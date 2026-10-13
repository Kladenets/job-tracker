import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { FileJobRepository } from "../../db/file-repository.js";
import { UnifiedJobPosting } from "../../types/job-posting.js";
import { Conversation } from "../agent/conversation.js";
import { GeminiAgent } from "../agent/gemini-agent.js";
import { ToolContext } from "../agent/tool.js";
import { DraftApplicationAnswerTool } from "../agent/tools/draft-application-answer.tool.js";
import { DraftCoverLetterTool } from "../agent/tools/draft-cover-letter.tool.js";
import { loadSearchProfile } from "../../config/search-profile.js";
import {
  buildApplicationDraftSourceFacts,
  detectSensitiveApplicationQuestion,
} from "../application-drafts.js";

async function runTests(): Promise<void> {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "job-tracker-drafts-"));
  const storePath = path.join(directory, "drafts.json");
  try {
    const repository = new FileJobRepository(storePath);
    const jobId = randomUUID();
    const now = new Date().toISOString();
    const job: UnifiedJobPosting = {
      id: jobId,
      source: "draft-fixture",
      content_hash: "draft-fixture",
      title: "Platform Engineer",
      company: "Example Co",
      workplace_type: "remote",
      employment_type: "full_time",
      seniority: "senior",
      currency: "USD",
      description_text: "Build reliable backend services.",
      date_discovered: now,
      job_status: "saved",
      availability: "open",
      created_at: now,
      updated_at: now,
    };
    await repository.savePosting(job);
    await repository.saveUserProfile("candidate_profile", {
      fullName: "Draft Test Candidate",
      skills: ["TypeScript", "PostgreSQL"],
      yearsExperience: 4,
      additionalExperience: "Maintained an internal service catalog.",
    });
    await repository.saveUserProfile("candidate_resume", {
      basics: { name: "Draft Test Candidate" },
      work: [{
        company: "Prior Co",
        position: "Software Engineer",
        startDate: "2020",
        endDate: "2024",
        summary: "Built TypeScript services.",
      }],
      projects: [],
      education: [],
      skills: [],
    });

    const facts = await buildApplicationDraftSourceFacts(repository, job);
    assert.ok(facts.some((fact) => fact.id === "candidate.skill.1" && fact.value === "PostgreSQL"));
    assert.ok(facts.some((fact) => fact.id === "resume.work.0"));
    assert.ok(!facts.some((fact) => fact.value.includes("candidate@example.com")));

    const profile = loadSearchProfile();
    const conversation = new Conversation({ job_ids: [jobId] });
    const context: ToolContext = {
      repository,
      profile,
      conversation,
      role: "owner",
      model_id: "gemini-test",
      prompt_version: "application-draft-v1",
      execution_mode: "model",
    };
    const answerTool = new DraftApplicationAnswerTool();
    const contextResult = JSON.parse(await answerTool.execute({
      job_id: jobId,
      question: "Describe your experience using PostgreSQL.",
    }, context));
    assert.equal(contextResult.phase, "context");
    assert.ok(contextResult.candidate_facts.some((fact: { value: string }) => fact.value === "PostgreSQL"));
    assert.equal((await repository.listApplicationDrafts({ includeSensitive: true })).length, 0);

    const sensitiveQuestion = "Draft an application answer about work authorization and sponsorship.";
    assert.equal(detectSensitiveApplicationQuestion(sensitiveQuestion), "work authorization or sponsorship");
    const sensitiveResult = JSON.parse(await answerTool.execute({
      job_id: jobId,
      question: "Are you authorized to work in this country?",
      draft_text: "I am authorized.",
      source_fact_ids: ["candidate.skill.1"],
    }, context));
    assert.equal(sensitiveResult.user_only, true);
    assert.equal(sensitiveResult.draft_created, false);
    assert.equal((await repository.listApplicationDrafts({ includeSensitive: true })).length, 0);

    const answerResult = JSON.parse(await answerTool.execute({
      job_id: jobId,
      question: "Describe your experience using PostgreSQL.",
      draft_text: "I have used PostgreSQL in my work.",
      source_fact_ids: ["candidate.skill.1"],
    }, context));
    const answerDraft = await repository.getApplicationDraft(answerResult.draft_id);
    assert.equal(answerDraft?.status, "draft");
    assert.equal(answerDraft?.versions[0].model_id, "gemini-test");
    assert.deepEqual(answerDraft?.versions[0].source_facts.map((fact) => fact.id), ["candidate.skill.1"]);

    await repository.approveApplicationDraft(answerResult.draft_id);
    await repository.updateApplicationDraft(answerResult.draft_id, "Edited by the user.");
    const editedAnswer = await repository.getApplicationDraft(answerResult.draft_id);
    assert.equal(editedAnswer?.status, "draft");
    assert.equal(editedAnswer?.versions.length, 2);
    assert.equal(editedAnswer?.versions[0].approved_at !== null, true);
    assert.equal(editedAnswer?.versions[1].author, "user");
    assert.equal(editedAnswer?.versions[1].approved_at, null);

    const priorAnswerContext = JSON.parse(await answerTool.execute({
      job_id: jobId,
      question: "How have you used PostgreSQL in a recent project?",
    }, context));
    assert.equal(priorAnswerContext.approved_prior_answers.length, 1);
    assert.equal(
      priorAnswerContext.approved_prior_answers[0].content,
      "I have used PostgreSQL in my work."
    );

    const sensitiveUserDraft = await repository.createApplicationDraft({
      id: randomUUID(),
      job_posting_id: jobId,
      draft_type: "application_answer",
      question: "Describe a disability accommodation you need.",
      sensitive: true,
      content: "User-authored private response.",
      author: "user",
    });
    await repository.approveApplicationDraft(sensitiveUserDraft.id);
    assert.equal((await repository.listApplicationDrafts()).some((draft) => draft.id === sensitiveUserDraft.id), false);
    const contextWithSensitivePrior = JSON.parse(await answerTool.execute({
      job_id: jobId,
      question: "Describe a recent project using PostgreSQL.",
    }, context));
    assert.equal(contextWithSensitivePrior.approved_prior_answers.length, 1);

    const coverLetter = JSON.parse(await new DraftCoverLetterTool().execute({
      job_id: jobId,
      notes: "Use a concise tone.",
    }, { ...context, execution_mode: "offline", model_id: "offline-template" }));
    assert.equal(coverLetter.status, "draft");
    assert.ok(coverLetter.content.includes("TypeScript"));
    assert.ok(coverLetter.content.includes("Built TypeScript services."));
    assert.ok(!coverLetter.content.includes("scalable systems"));
    assert.ok(coverLetter.assumptions.includes("User-provided emphasis to review: Use a concise tone."));

    const providerCalls: string[] = [];
    const restrictedAgent = new GeminiAgent({
      apiKey: "test",
      tools: [],
      clientFactory: () => ({
        interactions: {
          create: async () => {
            providerCalls.push("called");
            return { output_text: "must not be generated" };
          },
        },
      }) as never,
    });
    const restrictedConversation = new Conversation();
    const restrictedResult = await restrictedAgent.run(
      "Draft my job application answer about disability status.",
      restrictedConversation,
      { repository, profile }
    );
    assert.equal(restrictedResult.toolCalls.length, 0);
    assert.equal(providerCalls.length, 0);
    assert.ok(!restrictedConversation.toString().includes("disability status"));
    assert.ok(restrictedConversation.toString().includes("withheld from AI"));
    await restrictedAgent.run(
      "I am disabled and need an accommodation.",
      restrictedConversation,
      { repository, profile }
    );
    assert.equal(providerCalls.length, 0, "A personal follow-up to a sensitive question must stay local");
    assert.ok(!restrictedConversation.toString().includes("I am disabled"));

    const restartedRepository = new FileJobRepository(storePath);
    const persisted = await restartedRepository.getApplicationDraft(answerDraft!.id);
    assert.equal(persisted?.versions.length, 2);
    assert.equal(persisted?.versions[0].approved_at !== null, true);
    assert.equal((await restartedRepository.listApplicationDrafts()).some((draft) => draft.sensitive), false);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }

  console.log("Application draft tests passed: source-grounded drafts, sensitive-question isolation, approved-answer reuse, edit history, approval, and file persistence.");
}

runTests().catch((error: unknown) => {
  console.error("Application draft tests failed:", error);
  process.exitCode = 1;
});
