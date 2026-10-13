import { randomUUID } from "node:crypto";
import { DiscoveryRun, JobPostingRepository } from "../db/repository-interface.js";
import { RawJobPosting } from "../types/job.js";
import { PipelineIngestResult } from "./ingestion-pipeline.js";

export interface DiscoveryBatchResult {
  batchId: string;
  status: "complete" | "partial" | "failed";
  success: boolean;
  summary: string;
  discoveredCount: number;
  recommendedCount: number;
  filteredOutCount: number;
  sources: string[];
  details: Array<{
    source: string;
    status: "succeeded" | "failed";
    discovered: number;
    recommendedCount: number;
    filteredOutCount: number;
    totalProcessed?: number;
    newImported?: number;
    duplicatesMatched?: number;
    screenedWithJev?: number;
    error?: string;
    runId: string;
    attemptCount: number;
  }>;
  errors: Array<{ source: string; error: string }>;
}

export interface DiscoveryRunnerOptions {
  repository: JobPostingRepository;
  sources: string[];
  triggerType: DiscoveryRun["trigger_type"];
  fetchJobs: (source: string, signal: AbortSignal) => Promise<RawJobPosting[]>;
  ingestJobs: (jobs: RawJobPosting[]) => Promise<PipelineIngestResult>;
  concurrency?: number;
  maxAttempts?: number;
  timeoutMs?: number;
  retryBaseDelayMs?: number;
  sleep?: (delayMs: number) => Promise<void>;
  batchId?: string;
}

function boundedInteger(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.max(min, Math.min(parsed, max)) : fallback;
}

export function getDiscoveryRunnerSettings() {
  return {
    concurrency: boundedInteger(process.env.DISCOVERY_CONCURRENCY, 2, 1, 8),
    maxAttempts: boundedInteger(process.env.DISCOVERY_MAX_ATTEMPTS, 2, 1, 5),
    timeoutMs: boundedInteger(process.env.DISCOVERY_SOURCE_TIMEOUT_MS, 60_000, 1_000, 300_000),
    retryBaseDelayMs: boundedInteger(process.env.DISCOVERY_RETRY_BASE_DELAY_MS, 500, 0, 60_000),
  };
}

function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

async function withTimeout<T>(
  source: string,
  timeoutMs: number,
  run: (signal: AbortSignal) => Promise<T>
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(new Error(`${source} discovery timed out after ${timeoutMs}ms`)),
    timeoutMs
  );
  try {
    return await run(controller.signal);
  } catch (error) {
    if (controller.signal.aborted) {
      throw controller.signal.reason instanceof Error
        ? controller.signal.reason
        : new Error(`${source} discovery timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function failureMessage(error: unknown, source: string): string {
  return error instanceof Error ? error.message : `${source} discovery failed`;
}

async function createQueuedRuns(options: DiscoveryRunnerOptions, batchId: string): Promise<DiscoveryRun[]> {
  const startedAt = new Date().toISOString();
  const runs = options.sources.map<DiscoveryRun>((source) => ({
    id: randomUUID(),
    batch_id: batchId,
    source,
    trigger_type: options.triggerType,
    status: "queued",
    total_found: 0,
    new_imported: 0,
    duplicates_seen: 0,
    filtered_out: 0,
    screened_with_jev: 0,
    recommended: 0,
    error_count: 0,
    error_message: null,
    attempt_count: 0,
    started_at: startedAt,
    completed_at: null,
  }));
  await Promise.all(runs.map((run) => options.repository.saveDiscoveryRun(run)));
  return runs;
}

async function processQueuedRuns(options: DiscoveryRunnerOptions, runs: DiscoveryRun[]): Promise<void> {
  const settings = getDiscoveryRunnerSettings();
  const maxAttempts = options.maxAttempts ?? settings.maxAttempts;
  const timeoutMs = options.timeoutMs ?? settings.timeoutMs;
  const retryBaseDelayMs = options.retryBaseDelayMs ?? settings.retryBaseDelayMs;
  const sleep = options.sleep ?? wait;
  let cursor = 0;

  const processRun = async (queuedRun: DiscoveryRun): Promise<void> => {
    while (true) {
      const run = await options.repository.claimDiscoveryRun(queuedRun.id, maxAttempts);
      if (!run) {
        const stored = (await options.repository.listDiscoveryRuns({ limit: 500 }))
          .find((candidate) => candidate.id === queuedRun.id);
        if (stored?.status === "queued" && stored.attempt_count >= maxAttempts) {
          stored.status = "failed";
          stored.error_count = Math.max(stored.error_count, 1);
          stored.error_message ||= "Retry limit exhausted before execution";
          stored.completed_at = new Date().toISOString();
          await options.repository.saveDiscoveryRun(stored);
        }
        if (stored) Object.assign(queuedRun, stored);
        return;
      }

      Object.assign(queuedRun, run);
      try {
        const jobs = await withTimeout(
          run.source,
          timeoutMs,
          (signal) => options.fetchJobs(run.source, signal)
        );
        run.total_found = jobs.length;
        const ingested = await options.ingestJobs(jobs);
        run.new_imported = ingested.newImported;
        run.duplicates_seen = ingested.duplicatesMatched;
        run.filtered_out = ingested.filteredOut;
        run.screened_with_jev = ingested.screenedWithJev;
        run.recommended = ingested.items.filter((item) => item.jevFit === true).length;
        if (run.error_count > 0) {
          run.error_message = `Recovered after ${run.error_count} failed attempt(s): ${run.error_message}`;
        }
        run.status = "completed";
        run.completed_at = new Date().toISOString();
        Object.assign(queuedRun, run);
        await options.repository.saveDiscoveryRun(run);
        return;
      } catch (error) {
        run.error_count++;
        run.error_message = failureMessage(error, run.source);
        run.completed_at = null;
        run.status = run.attempt_count < maxAttempts ? "queued" : "failed";
        if (run.status === "failed") run.completed_at = new Date().toISOString();
        Object.assign(queuedRun, run);
        await options.repository.saveDiscoveryRun(run);
        if (run.status === "failed") return;

        const exponentialDelay = retryBaseDelayMs * 2 ** (run.attempt_count - 1);
        const jitter = Math.floor(Math.random() * Math.max(1, retryBaseDelayMs));
        await sleep(exponentialDelay + jitter);
      }
    }
  };

  const worker = async (): Promise<void> => {
    while (true) {
      const index = cursor++;
      if (index >= runs.length) return;
      await processRun(runs[index]);
    }
  };

  const concurrency = Math.max(1, Math.min(options.concurrency ?? settings.concurrency, runs.length));
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
}

function toBatchResult(batchId: string, runs: DiscoveryRun[]): DiscoveryBatchResult {
  const completedCount = runs.filter((run) => run.status === "completed").length;
  const failedRuns = runs.filter((run) => run.status === "failed");
  const status = failedRuns.length === 0
    ? "complete"
    : completedCount === 0
      ? "failed"
      : "partial";
  const details = runs.map((run) => ({
    source: run.source,
    status: run.status === "completed" ? "succeeded" as const : "failed" as const,
    discovered: run.total_found,
    recommendedCount: run.recommended,
    filteredOutCount: run.filtered_out,
    screenedWithJev: run.screened_with_jev,
    totalProcessed: run.total_found,
    newImported: run.new_imported,
    duplicatesMatched: run.duplicates_seen,
    runId: run.id,
    attemptCount: run.attempt_count,
    ...(run.error_message ? { error: run.error_message } : {}),
  }));
  const sourceNames = runs.map((run) => run.source);

  return {
    batchId,
    status,
    success: status === "complete",
    summary: status === "complete"
      ? `Discovery run completed across ${runs.length} sources`
      : status === "partial"
        ? `Discovery run partially completed: ${completedCount} of ${runs.length} sources succeeded`
        : `Discovery run failed: all ${runs.length} selected sources failed`,
    discoveredCount: runs.reduce((total, run) => total + run.total_found, 0),
    recommendedCount: runs.reduce((total, run) => total + run.recommended, 0),
    filteredOutCount: runs.reduce((total, run) => total + run.filtered_out, 0),
    sources: sourceNames,
    details,
    errors: failedRuns.map((run) => ({
      source: run.source,
      error: run.error_message || `${run.source} discovery failed`,
    })),
  };
}

export async function executeDiscoveryBatch(options: DiscoveryRunnerOptions): Promise<DiscoveryBatchResult> {
  const sources = Array.from(new Set(options.sources.map((source) => source.trim().toLowerCase())));
  if (sources.length === 0 || sources.some((source) => !source)) {
    throw new Error("At least one valid discovery source is required");
  }
  const batchId = options.batchId ?? randomUUID();
  const runs = options.batchId
    ? (await options.repository.listDiscoveryRuns({ limit: 500, status: "queued" }))
        .filter((run) => run.batch_id === batchId)
    : await createQueuedRuns({ ...options, sources }, batchId);

  await processQueuedRuns({ ...options, sources }, runs);
  return toBatchResult(batchId, runs);
}

export async function recoverAndResumeDiscoveryRuns(
  options: Omit<DiscoveryRunnerOptions, "sources" | "batchId" | "triggerType">
): Promise<number> {
  const settings = getDiscoveryRunnerSettings();
  const staleMinutes = boundedInteger(process.env.DISCOVERY_STALE_RUN_MINUTES, 5, 1, 1440);
  const staleBefore = new Date(Date.now() - staleMinutes * 60_000).toISOString();
  const recovered = await options.repository.recoverInterruptedDiscoveryRuns(
    staleBefore,
    settings.maxAttempts
  );
  const queued = await options.repository.listDiscoveryRuns({ limit: 500, status: "queued" });
  const batches = new Map<string, DiscoveryRun[]>();
  for (const run of queued) {
    const batch = batches.get(run.batch_id) ?? [];
    batch.push(run);
    batches.set(run.batch_id, batch);
  }
  for (const [batchId, runs] of batches) {
    const sources = runs.map((run) => run.source);
    await executeDiscoveryBatch({
      ...options,
      sources,
      triggerType: runs[0].trigger_type,
      batchId,
    });
  }
  return recovered;
}
