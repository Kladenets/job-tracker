import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { FileJobRepository } from "../../db/file-repository";
import { PostgresJobRepository } from "../../db/postgres-repository";
import { UnifiedJobPosting } from "../../types/job-posting";

console.log("=== Running Applications, Profile, and Metrics Integration Tests ===");

async function runTests() {
  const testStorePath = path.join(process.cwd(), "data", "test_app_metrics_store.json");
  if (fs.existsSync(testStorePath)) fs.unlinkSync(testStorePath);
  const repository = new FileJobRepository(testStorePath);

  // Seed a test job for application tracking
  const jobId = "11111111-2222-3333-4444-555555555555";
  const testJob: UnifiedJobPosting = {
    id: jobId,
    source: "greenhouse",
    source_job_id: "gh-app-test",
    source_url: "https://boards.greenhouse.io/test/jobs/123",
    canonical_url: "https://boards.greenhouse.io/test/jobs/123",
    application_url: "https://boards.greenhouse.io/test/jobs/123/apply",
    content_hash: "hash123",
    title: "Senior Full-Stack Engineer",
    company: "Acme Corp",
    location: "Remote - US",
    workplace_type: "remote",
    employment_type: "full_time",
    seniority: "senior",
    salary_min_annual: 160000,
    salary_max_annual: 185000,
    currency: "USD",
    interval: "yearly",
    raw_salary_text: "$160k - $185k",
    description_text: "Exciting opportunity for a full-stack engineer.",
    date_posted: new Date().toISOString(),
    date_discovered: new Date().toISOString(),
    last_checked_at: new Date().toISOString(),
    job_status: "saved",
    availability: "open",
    availability_evidence: "Posting active on Greenhouse",
    jev_fit: true,
    jev_confidence: 0.92,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  await repository.savePosting(testJob);
  console.log("✓ Test job seeded for application tracking");

  // Test 1: Save application
  const appId = "app-test-12345";
  const appData = {
    id: appId,
    job_posting_id: jobId,
    status: "applied",
    application_url: "https://boards.greenhouse.io/test/jobs/123/apply",
    applied_at: new Date().toISOString(),
    next_action_date: new Date(Date.now() + 86400000 * 7).toISOString(),
    user_notes: "Applied via direct Greenhouse ATS portal.",
    stage_history: [
      {
        stage: "applied",
        entered_at: new Date().toISOString(),
        notes: "Submitted tailored cover letter and resume.",
      },
    ],
  };

  const savedApp = await repository.saveApplication(appData);
  assert(savedApp.id === appId, "Application ID matches");
  assert(savedApp.status === "applied", "Application status is applied");
  console.log("✓ Application created and saved to repository");

  // Test 2: Retrieve application by ID and by JobId
  const retrievedApp = await repository.getApplication(appId);
  assert(retrievedApp !== null, "Application retrieved by ID");
  assert(retrievedApp.job_posting_id === jobId, "Job posting foreign key matches");

  const byJob = await repository.getApplicationByJobId(jobId);
  assert(byJob !== null, "Application retrieved by JobId");
  assert(byJob.id === appId, "Application matches");
  console.log("✓ Application retrieved by ID and by JobId");

  // Test 3: List applications with joined job metadata
  const list = await repository.listApplications();
  assert(list.length > 0, "List returns at least 1 application");
  const item = list.find((a) => a.id === appId);
  assert(item !== undefined, "Seeded application found in list");
  assert(item.job?.title === "Senior Full-Stack Engineer", "Joined job title populated");
  console.log("✓ listApplications returns applications with enriched job metadata");

  // Test 4: Stage advancement and history
  item.status = "interviewing";
  item.stage_history.push({
    stage: "interviewing",
    entered_at: new Date().toISOString(),
    notes: "Invited to round 1 technical screen.",
  });
  await repository.saveApplication(item);
  const updatedApp = await repository.getApplication(appId);
  assert(updatedApp.status === "interviewing", "Status advanced to interviewing");
  assert(updatedApp.stage_history.length === 2, "Stage history appended second transition");
  console.log("✓ Application stage advanced with audit timeline history");

  const preparingAppId = "22222222-3333-4444-8555-666666666666";
  const preparingCreatedAt = new Date().toISOString();
  await repository.saveApplication({
    id: preparingAppId,
    job_posting_id: jobId,
    status: "preparing",
    applied_at: null,
    created_at: preparingCreatedAt,
    stage_history: [],
  });

  // Test 5: Metrics computation
  const metrics = await repository.getMetrics();
  assert(metrics.funnel.discoveredCount >= 1, "Discovered count positive");
  assert(metrics.funnel.savedCount >= 1, "Saved count positive");
  assert.strictEqual(metrics.applications.appliedCount, 1, "Preparing applications are excluded from submitted count");
  assert(metrics.applications.interviewCount >= 1, "Interview count positive");
  assert(metrics.applications.isSmallSample === true, "Sample size guard flags N < 10");
  assert.strictEqual(metrics.sources.greenhouse.applied, 1);
  assert.strictEqual(metrics.sources.greenhouse.callbackCount, 1);
  assert.strictEqual(metrics.sources.greenhouse.callbackRate, 100);

  const postgresRepository = new PostgresJobRepository({
    query: async (query: string) => ({
      rows: query.includes("FROM job_postings")
        ? [{
            id: testJob.id,
            source: testJob.source,
            job_status: testJob.job_status,
            jev_fit: testJob.jev_fit,
            date_discovered: new Date(testJob.date_discovered),
            created_at: new Date(testJob.created_at),
          }]
        : [
            {
              id: updatedApp.id,
              job_posting_id: updatedApp.job_posting_id,
              status: updatedApp.status,
              applied_at: new Date(updatedApp.applied_at),
              created_at: new Date(updatedApp.created_at),
            },
            {
              id: preparingAppId,
              job_posting_id: jobId,
              status: "preparing",
              applied_at: null,
              created_at: new Date(preparingCreatedAt),
            },
          ],
    }),
  } as any);
  const postgresMetrics = await postgresRepository.getMetrics();
  assert.deepStrictEqual(postgresMetrics, metrics, "PostgreSQL and file repositories must return the same metrics contract");
  console.log("✓ Dashboard metrics computed correctly with sample size guards");

  console.log("\n==========================================================");
  console.log("  ALL APPLICATION & METRICS TESTS PASSED SUCCESSFULLY!    ");
  console.log("==========================================================\n");
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
