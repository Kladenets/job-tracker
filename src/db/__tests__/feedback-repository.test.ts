import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { FileJobRepository } from "../file-repository.js";
import {
  createRecommendationFeedbackSnapshot,
  RecommendationFeedbackSchema,
  UnifiedJobPosting,
} from "../../types/job-posting.js";

async function runTests(): Promise<void> {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "job-tracker-feedback-"));
  const storePath = path.join(directory, "feedback.json");
  try {
    const repository = new FileJobRepository(storePath);
    const postingId = randomUUID();
    const posting: UnifiedJobPosting = {
      id: postingId,
      source: "fixture",
      content_hash: "feedback-fixture",
      title: "Senior Engineer",
      company: "Example Company",
      workplace_type: "remote",
      employment_type: "full_time",
      seniority: "senior",
      currency: "USD",
      description_text: "Sanitized fixture",
      date_discovered: new Date().toISOString(),
      job_status: "recommended",
      availability: "open",
      jev_fit: true,
      jev_confidence: 0.82,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await repository.savePosting(posting);
    await repository.updateStatus(postingId, "saved", "user", "Bookmark only");
    assert.deepEqual(await repository.listRecommendationFeedback(postingId), [], "Workflow changes are not votes");

    const firstVote = await repository.recordRecommendationFeedback({
      id: randomUUID(),
      job_posting_id: postingId,
      vote: "up",
      reason_code: "skills",
      explanation: "Strong match for my stack",
      recommendation_snapshot: createRecommendationFeedbackSnapshot(posting),
    });
    assert.equal(firstVote.vote, "up");
    assert.equal(firstVote.reason_code, "skills");
    assert.equal(firstVote.recommendation_snapshot.jev_confidence, 0.82);
    assert.ok(firstVote.created_at);
    assert.equal((await repository.listActiveRecommendationFeedback([postingId]))[0].id, firstVote.id);

    const secondVote = await repository.recordRecommendationFeedback({
      id: randomUUID(),
      job_posting_id: postingId,
      vote: "down",
      reason_code: "compensation",
      explanation: "Below my range",
      recommendation_snapshot: createRecommendationFeedbackSnapshot(posting, new Date().toISOString()),
    });
    const replacedHistory = await repository.listRecommendationFeedback(postingId);
    assert.equal(replacedHistory.length, 2);
    assert.equal(replacedHistory[0].retracted_at !== null, true);
    assert.equal(replacedHistory[0].retraction_reason, "replaced");
    assert.equal(replacedHistory[0].replaced_by_id, secondVote.id);
    assert.equal(replacedHistory[1].id, secondVote.id);
    assert.equal(replacedHistory[1].retracted_at, null);

    const retracted = await repository.retractRecommendationFeedback(postingId);
    assert.equal(retracted?.id, secondVote.id);
    assert.equal(retracted?.retraction_reason, "user_retracted");
    assert.ok(retracted?.retracted_at);
    assert.deepEqual(await repository.listActiveRecommendationFeedback([postingId]), []);

    const restartedRepository = new FileJobRepository(storePath);
    const persistedHistory = await restartedRepository.listRecommendationFeedback(postingId);
    assert.equal(persistedHistory.length, 2);
    assert.ok(persistedHistory.every((entry) => RecommendationFeedbackSchema.safeParse(entry).success));
    assert.equal((await restartedRepository.getById(postingId))?.job_status, "saved");
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }

  console.log("Feedback repository tests passed: explicit votes, reasons, snapshots, replacement/retraction history, workflow isolation, and file persistence.");
}

runTests().catch((error: unknown) => {
  console.error("Feedback repository tests failed:", error);
  process.exitCode = 1;
});
