import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { FileJobRepository } from "../../db/file-repository.js";
import { DiscoveryRun } from "../../db/repository-interface.js";
import { getSearchProfile } from "../../config/search-profile.js";
import { RawJobPosting } from "../../types/job.js";
import { PipelineIngestResult, ingestRawPostings } from "../ingestion-pipeline.js";
import {
  executeDiscoveryBatch,
  recoverAndResumeDiscoveryRuns,
} from "../discovery-runner.js";

function createRawPosting(id: string): RawJobPosting {
  return {
    id,
    site: "greenhouse",
    title: "Software Engineer",
    company: "Discovery Runner Test",
    location: "Remote, US",
    is_remote: true,
    description: "A sanitized job posting with TypeScript and Node.js.",
    job_url: `https://boards.greenhouse.io/test/jobs/${id}`,
  };
}

function emptyIngestResult(): PipelineIngestResult {
  return {
    totalProcessed: 0,
    newImported: 0,
    filteredOut: 0,
    screenedWithJev: 0,
    duplicatesMatched: 0,
    items: [],
  };
}

async function runTests(): Promise<void> {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "job-tracker-discovery-runner-"));
  const storePath = path.join(directory, "store.json");
  const repository = new FileJobRepository(storePath);

  try {
    let activeSources = 0;
    let maximumConcurrency = 0;
    const attempts = new Map<string, number>();
    const batch = await executeDiscoveryBatch({
      repository,
      sources: ["success", "retry", "failure"],
      triggerType: "manual",
      concurrency: 2,
      maxAttempts: 2,
      timeoutMs: 2_000,
      retryBaseDelayMs: 0,
      sleep: async () => undefined,
      fetchJobs: async (source) => {
        activeSources++;
        maximumConcurrency = Math.max(maximumConcurrency, activeSources);
        await new Promise((resolve) => setTimeout(resolve, 10));
        activeSources--;

        const count = (attempts.get(source) ?? 0) + 1;
        attempts.set(source, count);
        if (source === "failure" || (source === "retry" && count === 1)) {
          throw new Error(`${source} temporary error`);
        }
        return source === "success" ? [createRawPosting("success-job")] : [];
      },
      ingestJobs: async (jobs) => ({
        ...emptyIngestResult(),
        totalProcessed: jobs.length,
        newImported: jobs.length,
        screenedWithJev: jobs.length,
        items: jobs.map((job) => ({
          id: job.id,
          isNew: true,
          title: job.title,
          company: job.company ?? "Unknown",
          status: "recommended",
          availability: "open",
          jevFit: true,
        })),
      }),
    });

    assert.equal(batch.status, "partial", "One failed source must not fail successful sources");
    assert.equal(batch.details.find((detail) => detail.source === "retry")?.attemptCount, 2);
    assert.equal(batch.details.find((detail) => detail.source === "failure")?.attemptCount, 2);
    assert.equal(maximumConcurrency, 2, "Source workers must honor the configured concurrency bound");
    assert.equal(batch.discoveredCount, 1);
    assert.equal(batch.recommendedCount, 1);

    const timedOutBatch = await executeDiscoveryBatch({
      repository,
      sources: ["slow-source"],
      triggerType: "manual",
      concurrency: 1,
      maxAttempts: 1,
      timeoutMs: 20,
      fetchJobs: async (_source, signal) => new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      }),
      ingestJobs: async () => emptyIngestResult(),
    });
    assert.equal(timedOutBatch.status, "failed");
    assert.match(timedOutBatch.details[0].error ?? "", /timed out after 20ms/);

    const persistedBatch = await new FileJobRepository(storePath)
      .listDiscoveryRuns({ limit: 10 });
    assert.equal(persistedBatch.length, 4);
    assert.equal(persistedBatch.find((run) => run.source === "failure")?.status, "failed");
    assert.equal(persistedBatch.find((run) => run.source === "failure")?.error_count, 2);
    assert.equal(persistedBatch.find((run) => run.source === "retry")?.attempt_count, 2);

    const interruptedRun: DiscoveryRun = {
      id: "interrupted-discovery-run",
      batch_id: "interrupted-discovery-batch",
      source: "recovered",
      trigger_type: "scheduled",
      status: "running",
      total_found: 0,
      new_imported: 0,
      duplicates_seen: 0,
      filtered_out: 0,
      screened_with_jev: 0,
      recommended: 0,
      error_count: 0,
      error_message: null,
      attempt_count: 1,
      started_at: new Date(Date.now() - 10 * 60_000).toISOString(),
      completed_at: null,
    };
    await repository.saveDiscoveryRun(interruptedRun);
    const recoveredCount = await recoverAndResumeDiscoveryRuns({
      repository,
      fetchJobs: async () => [],
      ingestJobs: async () => emptyIngestResult(),
      concurrency: 1,
      maxAttempts: 2,
      timeoutMs: 2_000,
      retryBaseDelayMs: 0,
      sleep: async () => undefined,
    });
    assert.equal(recoveredCount, 1);
    const recoveredRun = (await repository.listDiscoveryRuns({ limit: 10 }))
      .find((run) => run.id === interruptedRun.id);
    assert.equal(recoveredRun?.status, "completed");
    assert.equal(recoveredRun?.attempt_count, 2);

    const idempotentStore = path.join(directory, "idempotent-store.json");
    const idempotentRepository = new FileJobRepository(idempotentStore);
    const profile = await getSearchProfile(idempotentRepository);
    profile.jevScreening.enabled = false;
    const fetchJobs = async () => [createRawPosting("same-job")];
    const ingestJobs = (jobs: RawJobPosting[]) => ingestRawPostings(jobs, {
      customRepo: idempotentRepository,
      customProfile: profile,
    });
    const firstRun = await executeDiscoveryBatch({
      repository: idempotentRepository,
      sources: ["greenhouse"],
      triggerType: "manual",
      fetchJobs: async (_source, signal) => {
        assert.equal(signal.aborted, false);
        return fetchJobs();
      },
      ingestJobs,
      maxAttempts: 1,
    });
    const secondRun = await executeDiscoveryBatch({
      repository: idempotentRepository,
      sources: ["greenhouse"],
      triggerType: "manual",
      fetchJobs: async () => fetchJobs(),
      ingestJobs,
      maxAttempts: 1,
    });
    assert.equal(firstRun.details[0].newImported, 1);
    assert.equal(secondRun.details[0].newImported, 0);
    assert.equal(secondRun.details[0].duplicatesMatched, 1);
    assert.equal(
      (await idempotentRepository.listPostings({ limit: 10 })).length,
      1,
      "Repeated discovery runs must not create duplicate postings"
    );

    const job = (await idempotentRepository.listPostings({ limit: 1 }))[0];
    assert.equal(await idempotentRepository.recordAvailabilityCheck(
      job.id,
      "unknown",
      "Timeout; availability is inconclusive"
    ), 1);
    assert.equal(await idempotentRepository.recordAvailabilityCheck(
      job.id,
      "unknown",
      "HTTP 503; availability is inconclusive"
    ), 2);
    assert.equal(await idempotentRepository.recordAvailabilityCheck(
      job.id,
      "closed",
      "Source API explicitly returned 404"
    ), 0);
    const checkedJob = await idempotentRepository.getById(job.id);
    assert.equal(checkedJob?.availability, "closed");
    assert.equal(checkedJob?.availability_check_failures, 0);
    assert.match(checkedJob?.availability_evidence ?? "", /404/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }

  console.log(
    "Discovery lifecycle tests passed: bounded workers, retry isolation, durable run records, crash recovery, idempotence, and evidence-based availability tracking."
  );
}

runTests().catch((error: unknown) => {
  console.error("Discovery lifecycle tests failed:", error);
  process.exitCode = 1;
});
