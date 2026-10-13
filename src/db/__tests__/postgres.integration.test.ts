import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { FileJobRepository } from "../file-repository.js";
import { PostgresJobRepository } from "../postgres-repository.js";
import { runMigrations } from "../migrations/migrator.js";
import { DiscoveryRun } from "../repository-interface.js";
import { UnifiedJobPosting } from "../../types/job-posting.js";
import { createRecommendationFeedbackSnapshot } from "../../types/job-posting.js";
import { AiUsageRecord, AiBudgetExceededError, DailyAiBudget } from "../../ai/usage-types.js";
import { ApplicationDraft } from "../../ai/application-drafts.js";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));

function runCommand(command: string, args: string[], timeout = 30_000): string {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    timeout,
    maxBuffer: 10 * 1024 * 1024,
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const details = result.stderr.trim() || result.stdout.trim() || "no command output";
    throw new Error(`${command} ${args[0]} failed: ${details}`);
  }
  return result.stdout.trim();
}

function createPosting(): UnifiedJobPosting {
  const now = new Date().toISOString();
  const id = randomUUID();
  return {
    id,
    source: "integration_fixture",
    source_job_id: `fixture-${id}`,
    source_url: `https://example.test/jobs/${id}`,
    canonical_url: `https://example.test/jobs/${id}`,
    application_url: `https://example.test/jobs/${id}/apply`,
    content_hash: `hash-${id}`,
    title: "Integration Test Engineer",
    company: "Integration Test Company",
    location: "Remote - US",
    workplace_type: "remote",
    employment_type: "full_time",
    seniority: "senior",
    salary_min_annual: 150000,
    salary_max_annual: 175000,
    currency: "USD",
    interval: "yearly",
    raw_salary_text: "$150k-$175k",
    description_text: "Sanitized integration fixture posting.",
    date_posted: now,
    date_discovered: now,
    last_checked_at: now,
    job_status: "discovered",
    availability: "unknown",
    availability_evidence: null,
    jev_fit: true,
    jev_confidence: 0.9,
    created_at: now,
    updated_at: now,
  };
}

async function waitForPostgres(pool: Pool): Promise<void> {
  const deadline = Date.now() + 90_000;
  let lastError = "PostgreSQL did not accept a connection";

  while (Date.now() < deadline) {
    try {
      await pool.query("SELECT 1");
      return;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  throw new Error(`Timed out waiting for the disposable PostgreSQL container: ${lastError}`);
}

async function verifyRepositoryParity(
  repository: FileJobRepository | PostgresJobRepository
): Promise<{
  postingId: string;
  profileKey: string;
  profile: object;
  aiUsageStartsAt: string;
  applicationDraftId: string;
}> {
  const posting = createPosting();
  await repository.savePosting(posting);

  const savedPosting = await repository.getById(posting.id);
  assert.ok(savedPosting);
  assert.equal(savedPosting.title, posting.title);
  assert.equal(savedPosting.job_status, posting.job_status);

  const sourceMatch = await repository.findExisting({
    source: posting.source,
    sourceJobId: posting.source_job_id,
  });
  assert.equal(sourceMatch?.id, posting.id);

  const urlMatch = await repository.findExisting({
    source: "different_source",
    canonicalUrl: posting.canonical_url,
  });
  assert.equal(urlMatch?.id, posting.id);

  const foundByFilter = await repository.listPostings({
    jobStatus: "discovered",
    company: "integration test",
  });
  assert.deepEqual(foundByFilter.map((item) => item.id), [posting.id]);

  const profileKey = `integration_profile_${randomUUID()}`;
  const profile = { nested: { enabled: true }, marker: randomUUID() };
  await repository.saveUserProfile(profileKey, profile);
  assert.deepEqual(await repository.getUserProfile(profileKey), profile);

  const usageStarts = new Date();
  usageStarts.setUTCHours(0, 0, 0, 0);
  const aiUsageStartsAt = usageStarts.toISOString();
  const aiBudget: DailyAiBudget = {
    starts_at: aiUsageStartsAt,
    resets_at: new Date(usageStarts.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    max_requests: 1,
    max_tokens: 100,
  };
  const aiUsageRecord: AiUsageRecord = {
    id: randomUUID(),
    role: "owner",
    provider: "gemini",
    model: "integration-model",
    prompt_version: "integration-prompt-v1",
    started_at: new Date().toISOString(),
    completed_at: null,
    estimated_input_tokens: 10,
    input_tokens: null,
    output_tokens: null,
    total_tokens: null,
    latency_ms: null,
    status: "pending",
    error_code: null,
  };
  await repository.reserveAiUsage(aiUsageRecord, aiBudget);
  await assert.rejects(
    repository.reserveAiUsage({ ...aiUsageRecord, id: randomUUID() }, aiBudget),
    AiBudgetExceededError
  );
  await repository.finishAiUsage(aiUsageRecord.id, {
    completed_at: new Date().toISOString(),
    input_tokens: 10,
    output_tokens: 7,
    total_tokens: 17,
    latency_ms: 12,
    status: "succeeded",
    error_code: null,
  });
  assert.deepEqual(await repository.getAiUsageSummary(aiUsageStartsAt), {
    owner_requests: 1,
    owner_tokens: 17,
    guest_requests: 0,
    guest_tokens: 0,
  });

  const applicationId = randomUUID();
  const now = new Date().toISOString();
  await repository.saveApplication({
    id: applicationId,
    job_posting_id: posting.id,
    status: "preparing",
    application_url: posting.application_url,
    applied_at: null,
    next_action_date: null,
    user_notes: "Integration fixture",
    stage_history: [],
    created_at: now,
    updated_at: now,
  });
  assert.equal((await repository.getApplication(applicationId))?.status, "preparing");
  assert.equal((await repository.getApplicationByJobId(posting.id))?.id, applicationId);
  const listedApplications = await repository.listApplications({ status: "preparing" });
  assert.equal(
    listedApplications.find((item) => item.id === applicationId)?.job?.title,
    posting.title
  );

  await repository.updateStatus(posting.id, "saved", "user", "Integration contract");
  assert.equal((await repository.getById(posting.id))?.job_status, "saved");

  const initialFeedback = await repository.recordRecommendationFeedback({
    id: randomUUID(),
    job_posting_id: posting.id,
    vote: "up",
    reason_code: "skills",
    explanation: "Fixture preference",
    recommendation_snapshot: createRecommendationFeedbackSnapshot(posting),
  });
  const replacementFeedback = await repository.recordRecommendationFeedback({
    id: randomUUID(),
    job_posting_id: posting.id,
    vote: "down",
    reason_code: "compensation",
    explanation: "Fixture replacement",
    recommendation_snapshot: createRecommendationFeedbackSnapshot(posting),
  });
  const feedbackHistory = await repository.listRecommendationFeedback(posting.id);
  assert.equal(feedbackHistory.length, 2);
  assert.equal(feedbackHistory[0].retracted_at !== null, true);
  assert.equal(feedbackHistory[0].replaced_by_id, replacementFeedback.id);
  assert.equal(feedbackHistory[1].id, replacementFeedback.id);
  assert.equal((await repository.retractRecommendationFeedback(posting.id))?.id, replacementFeedback.id);
  assert.equal((await repository.listActiveRecommendationFeedback([posting.id])).length, 0);
  assert.notEqual(initialFeedback.id, replacementFeedback.id);

  const applicationDraftId = randomUUID();
  const applicationDraft: ApplicationDraft = await repository.createApplicationDraft({
    id: applicationDraftId,
    job_posting_id: posting.id,
    draft_type: "application_answer",
    question: "Describe your experience with PostgreSQL.",
    content: "Generated draft with cited facts.",
    source_facts: [{
      id: "candidate.skill.0",
      source: "candidate_profile",
      label: "Candidate skill: PostgreSQL",
      value: "PostgreSQL",
    }],
    assumptions: ["Verify the detail before use."],
    author: "assistant",
    model_id: "integration-model",
    prompt_version: "application-draft-v1",
  });
  assert.equal(applicationDraft.status, "draft");
  assert.equal(applicationDraft.versions[0].author, "assistant");
  await repository.approveApplicationDraft(applicationDraftId);
  await repository.updateApplicationDraft(applicationDraftId, "User-edited answer.");
  await repository.approveApplicationDraft(applicationDraftId);
  const finalDraftVersion = await repository.updateApplicationDraft(
    applicationDraftId,
    "Latest unapproved revision."
  );
  assert.equal(finalDraftVersion?.status, "draft");
  assert.equal(finalDraftVersion?.versions.length, 3);
  assert.ok(finalDraftVersion?.versions[1].approved_at);
  assert.equal(
    (await repository.listApplicationDrafts({ hasApprovedVersion: true })).some(
      (draft) => draft.id === applicationDraftId
    ),
    true,
    "An earlier user-approved answer remains available as approved history"
  );

  const privateAnswer = await repository.createApplicationDraft({
    id: randomUUID(),
    job_posting_id: posting.id,
    draft_type: "application_answer",
    question: "Describe a disability accommodation you need.",
    sensitive: true,
    content: "User-authored private answer.",
    author: "user",
  });
  await repository.approveApplicationDraft(privateAnswer.id);
  assert.equal(
    (await repository.listApplicationDrafts({ hasApprovedVersion: true })).some(
      (draft) => draft.id === privateAnswer.id
    ),
    false,
    "Sensitive answers are never returned as reusable approved context"
  );

  const discoveryRun: DiscoveryRun = {
    id: randomUUID(),
    batch_id: randomUUID(),
    source: "integration_fixture",
    trigger_type: "scheduled",
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
    started_at: now,
    completed_at: null,
  };
  await repository.saveDiscoveryRun(discoveryRun);
  const claimedRun = await repository.claimDiscoveryRun(discoveryRun.id, 2);
  assert.equal(claimedRun?.status, "running");
  assert.equal(claimedRun?.attempt_count, 1);
  assert.equal(
    await repository.recoverInterruptedDiscoveryRuns(
      new Date(Date.now() + 1_000).toISOString(),
      2
    ),
    1,
    "A stale in-progress source run must be recoverable"
  );
  const recoveredRun = await repository.claimDiscoveryRun(discoveryRun.id, 2);
  assert.equal(recoveredRun?.attempt_count, 2);
  assert.equal(recoveredRun?.status, "running");
  recoveredRun!.status = "completed";
  recoveredRun!.total_found = 1;
  recoveredRun!.completed_at = new Date().toISOString();
  await repository.saveDiscoveryRun(recoveredRun!);
  const persistedRun = (await repository.listDiscoveryRuns({ limit: 20 }))
    .find((run) => run.id === discoveryRun.id);
  assert.equal(persistedRun?.status, "completed");
  assert.equal(persistedRun?.total_found, 1);
  assert.equal(persistedRun?.attempt_count, 2);

  assert.equal(await repository.recordAvailabilityCheck(
    posting.id,
    "unknown",
    "Integration timeout evidence"
  ), 1);
  assert.equal(await repository.recordAvailabilityCheck(
    posting.id,
    "closed",
    "Source explicitly confirmed removal"
  ), 0);
  assert.equal((await repository.getById(posting.id))?.availability, "closed");

  return { postingId: posting.id, profileKey, profile, aiUsageStartsAt, applicationDraftId };
}

async function verifyRealMigrationRollback(pool: Pool, temporaryDirectory: string): Promise<void> {
  const migrationsDirectory = path.join(temporaryDirectory, "failing-migrations");
  fs.mkdirSync(migrationsDirectory);
  fs.writeFileSync(
    path.join(migrationsDirectory, "9000_rollback_marker.sql"),
    "CREATE TABLE integration_migration_rollback_marker (id integer PRIMARY KEY);"
  );
  fs.writeFileSync(path.join(migrationsDirectory, "9001_failure.sql"), "THIS IS NOT VALID SQL;");

  const result = await runMigrations({ pool, migrationsDirectory });
  assert.equal(result.success, false, "A failing migration must not report success");
  const marker = await pool.query(
    "SELECT to_regclass('public.integration_migration_rollback_marker') AS relation"
  );
  assert.equal(marker.rows[0].relation, null, "Earlier DDL in the failed migration batch must roll back");
  const ledgerRows = await pool.query(
    "SELECT filename FROM schema_migrations WHERE filename LIKE '900%';"
  );
  assert.deepEqual(ledgerRows.rows, [], "Failed migration files must not enter the migration ledger");
}

function verifyProductionStartupFailsClosed(): void {
  const result = spawnSync(process.execPath, ["--import", "tsx", "src/server.ts"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    timeout: 15_000,
    env: {
      ...process.env,
      NODE_ENV: "production",
      JOB_TRACKER_FORCE_FILE: "false",
      DATABASE_URL: "postgresql://job_tracker:unavailable@127.0.0.1:1/startup_probe",
      HOST: "127.0.0.1",
      PORT: "0",
    },
  });

  if (result.error) {
    throw result.error;
  }
  const output = `${result.stdout}\n${result.stderr}`;
  assert.notEqual(result.status, 0, "Production server startup must fail without PostgreSQL");
  assert.match(output, /PostgreSQL is required in production/);
  assert.doesNotMatch(output, /Listening on http/);
}

function verifyPersistenceFromFreshProcess(
  databaseUrl: string,
  postingId: string,
  profileKey: string,
  profile: object,
  aiUsageStartsAt: string,
  applicationDraftId: string
): void {
  const probe = `
    import assert from "node:assert/strict";
    import { Pool } from "pg";
    import { PostgresJobRepository } from "./src/db/postgres-repository.ts";

    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const repository = new PostgresJobRepository(pool);
      const posting = await repository.getById(process.env.INTEGRATION_POSTING_ID);
      const profile = await repository.getUserProfile(process.env.INTEGRATION_PROFILE_KEY);
      const aiUsage = await repository.getAiUsageSummary(process.env.INTEGRATION_AI_USAGE_STARTS_AT);
      const feedbackHistory = await repository.listRecommendationFeedback(process.env.INTEGRATION_POSTING_ID);
      const applicationDraft = await repository.getApplicationDraft(process.env.INTEGRATION_APPLICATION_DRAFT_ID);
      assert.equal(posting?.job_status, "saved");
      assert.deepEqual(profile, JSON.parse(process.env.INTEGRATION_PROFILE_JSON));
      assert.equal(aiUsage.owner_requests, 1);
      assert.equal(aiUsage.owner_tokens, 17);
      assert.equal(feedbackHistory.length, 2);
      assert.equal(feedbackHistory[0].replaced_by_id, feedbackHistory[1].id);
      assert.equal(feedbackHistory[1].retraction_reason, "user_retracted");
      assert.equal(applicationDraft?.versions.length, 3);
      assert.equal(applicationDraft?.status, "draft");
      assert.ok(applicationDraft?.versions[1].approved_at);
      assert.equal(applicationDraft?.versions[2].author, "user");
    } finally {
      await pool.end();
    }
  `;
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "-e", probe],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      timeout: 15_000,
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        INTEGRATION_POSTING_ID: postingId,
        INTEGRATION_PROFILE_KEY: profileKey,
        INTEGRATION_PROFILE_JSON: JSON.stringify(profile),
        INTEGRATION_AI_USAGE_STARTS_AT: aiUsageStartsAt,
        INTEGRATION_APPLICATION_DRAFT_ID: applicationDraftId,
      },
    }
  );

  if (result.error) {
    throw result.error;
  }
  assert.equal(
    result.status,
    0,
    `A fresh process must read persisted PostgreSQL data:\n${result.stdout}\n${result.stderr}`
  );
}

async function runTests(): Promise<void> {
  const temporaryDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "job-tracker-postgres-integration-")
  );
  const containerName = `job-tracker-postgres-test-${process.pid}-${randomUUID()}`;
  const password = randomUUID();
  let pool: Pool | null = null;
  let containerStarted = false;
  let testError: unknown;

  try {
    runCommand(
      "docker",
      [
        "run",
        "--detach",
        "--name",
        containerName,
        "--publish",
        "127.0.0.1::5432",
        "--env",
        "POSTGRES_DB=job_tracker_integration",
        "--env",
        "POSTGRES_USER=job_tracker",
        "--env",
        `POSTGRES_PASSWORD=${password}`,
        "postgres:16-alpine",
      ],
      300_000
    );
    containerStarted = true;

    const publishedPort = runCommand("docker", ["port", containerName, "5432/tcp"]);
    const portMatch = publishedPort.match(/^127\.0\.0\.1:(\d+)$/m);
    assert.ok(portMatch, `Expected a loopback-only Docker port mapping, got: ${publishedPort}`);

    const databaseUrl = `postgresql://job_tracker:${password}@127.0.0.1:${portMatch[1]}/job_tracker_integration`;
    pool = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 2_000 });
    await waitForPostgres(pool);

    const migrationResult = await runMigrations({ pool });
    assert.equal(migrationResult.success, true, migrationResult.message);
    assert.ok((migrationResult.applied?.length ?? 0) > 0, "Real migrations must be applied");

    const repeatedMigrationResult = await runMigrations({ pool });
    assert.equal(repeatedMigrationResult.success, true, repeatedMigrationResult.message);
    assert.deepEqual(repeatedMigrationResult.applied, [], "Migrations must be idempotent");

    const requiredTables = await pool.query(
      `SELECT to_regclass('public.job_postings') AS postings,
              to_regclass('public.user_profiles') AS profiles,
              to_regclass('public.application_drafts') AS application_drafts`
    );
    assert.ok(requiredTables.rows[0].postings);
    assert.ok(requiredTables.rows[0].profiles);
    assert.ok(requiredTables.rows[0].application_drafts);
    await verifyRealMigrationRollback(pool, temporaryDirectory);

    const fileStorePath = path.join(temporaryDirectory, "file-repository.json");
    const fileResult = await verifyRepositoryParity(new FileJobRepository(fileStorePath));
    const postgresRepository = new PostgresJobRepository(pool);
    const postgresResult = await verifyRepositoryParity(postgresRepository);

    const fileRestarted = new FileJobRepository(fileStorePath);
    assert.equal((await fileRestarted.getById(fileResult.postingId))?.job_status, "saved");
    assert.deepEqual(
      await fileRestarted.getUserProfile(fileResult.profileKey),
      fileResult.profile,
      "The file repository contract also survives reopening"
    );
    assert.deepEqual(
      await fileRestarted.getAiUsageSummary(fileResult.aiUsageStartsAt),
      { owner_requests: 1, owner_tokens: 17, guest_requests: 0, guest_tokens: 0 },
      "File AI usage budgets and telemetry survive reopening"
    );
    const fileFeedback = await fileRestarted.listRecommendationFeedback(fileResult.postingId);
    assert.equal(fileFeedback.length, 2, "Feedback history survives reopening");
    assert.equal(fileFeedback[1].retraction_reason, "user_retracted");
    const fileDraft = await fileRestarted.getApplicationDraft(fileResult.applicationDraftId);
    assert.equal(fileDraft?.versions.length, 3, "Application draft versions survive reopening");
    assert.ok(fileDraft?.versions[1].approved_at);

    const client = await pool.connect();
    try {
      await client.query(`
        CREATE FUNCTION reject_integration_status_history() RETURNS trigger
        LANGUAGE plpgsql AS $$
        BEGIN
          RAISE EXCEPTION 'synthetic status history failure';
        END;
        $$;
      `);
      await client.query(`
        CREATE TRIGGER reject_integration_status_history
        BEFORE INSERT ON job_status_history
        FOR EACH ROW EXECUTE FUNCTION reject_integration_status_history();
      `);
    } finally {
      client.release();
    }

    try {
      await assert.rejects(
        postgresRepository.updateStatus(
          postgresResult.postingId,
          "dismissed",
          "user",
          "Force transaction rollback"
        ),
        /synthetic status history failure/
      );
    } finally {
      await pool.query("DROP TRIGGER IF EXISTS reject_integration_status_history ON job_status_history");
      await pool.query("DROP FUNCTION IF EXISTS reject_integration_status_history()");
    }

    assert.equal(
      (await postgresRepository.getById(postgresResult.postingId))?.job_status,
      "saved",
      "A failed audit insert must roll back the status update"
    );
    const statusHistory = await pool.query(
      "SELECT new_status FROM job_status_history WHERE job_posting_id = $1",
      [postgresResult.postingId]
    );
    assert.deepEqual(
      statusHistory.rows.map((row) => row.new_status),
      ["saved"],
      "A failed status transition must not leave an audit record"
    );

    verifyProductionStartupFailsClosed();
    verifyPersistenceFromFreshProcess(
      databaseUrl,
      postgresResult.postingId,
      postgresResult.profileKey,
      postgresResult.profile,
      postgresResult.aiUsageStartsAt,
      postgresResult.applicationDraftId
    );
  } catch (error) {
    testError = error;
  }

  const cleanupErrors: unknown[] = [];
  if (pool) {
    try {
      await pool.end();
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  if (containerStarted) {
    try {
      runCommand("docker", ["rm", "--force", containerName]);
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  try {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  } catch (error) {
    cleanupErrors.push(error);
  }

  if (testError && cleanupErrors.length > 0) {
    throw new AggregateError([testError, ...cleanupErrors], "PostgreSQL integration tests and cleanup failed");
  }
  if (testError) {
    throw testError;
  }
  if (cleanupErrors.length > 0) {
    throw new AggregateError(cleanupErrors, "PostgreSQL integration test cleanup failed");
  }

  console.log(
    "PostgreSQL integration tests passed: migrations, fail-closed startup, repository parity, AI usage budgets, transaction rollback, and fresh-process persistence."
  );
}

runTests().catch((error: unknown) => {
  console.error("PostgreSQL integration tests failed:", error);
  process.exitCode = 1;
});
