import fs from "fs";
import path from "path";
import { ingestRawPostings } from "../ingestion-pipeline";
import { RawJobPosting } from "../../types/job";
import { FileJobRepository } from "../../db/file-repository";
import { getRepository } from "../../db";

// Helper assertion function
function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ Assertion Failed: ${message}`);
    throw new Error(`Assertion Failed: ${message}`);
  }
}

async function runDeduplicationAndStatePreservationTests() {
  console.log("==========================================================");
  console.log(" Running Deduplication & Workflow State Preservation Tests ");
  console.log("==========================================================");

  // Use a dedicated isolated test store file
  const testStorePath = path.join(process.cwd(), "data", "test_job_store.json");
  if (fs.existsSync(testStorePath)) {
    fs.unlinkSync(testStorePath);
  }

  // Instantiate isolated test repository
  const repo = new FileJobRepository(testStorePath);

  // 1. Ingest brand new job posting (First crawl)
  const initialRawJob: RawJobPosting = {
    id: "lever-job-12345",
    site: "lever",
    title: "Senior Distributed Systems Engineer",
    company: "CloudScale Inc",
    location: "Remote, US",
    job_url: "https://jobs.lever.co/cloudscale/lever-job-12345?utm_source=linkedin&utm_medium=cpc",
    job_url_direct: "https://jobs.lever.co/cloudscale/lever-job-12345/apply?gh_src=tracking789",
    description: "Initial description. Looking for expertise in Go, Kubernetes, and raft consensus.",
  };

  console.log("\n[Test 1] Ingesting initial posting for the first time...");
  const firstIngest = await ingestRawPostings([initialRawJob], repo);
  assert(firstIngest.totalProcessed === 1, "Should process 1 job");
  assert(firstIngest.newImported === 1, "Should mark 1 job as newly imported");
  assert(firstIngest.duplicatesMatched === 0, "Duplicates should be 0 on first ingest");
  const storedJobId = firstIngest.items[0].id;
  assert(firstIngest.items[0].isNew === true, "Item must be flagged as isNew = true");
  assert(firstIngest.items[0].status === "discovered", "Initial status must be 'discovered'");
  console.log("✓ Initial ingestion correctly created posting with status = 'discovered'");

  // 2. User reviews and advances workflow status in the app
  console.log("\n[Test 2] Simulating user workflow updates (advancing to 'saved', then 'reviewing')...");
  // Retrieve job and advance review status
  await repo.updateStatus(storedJobId, "saved", "user", "Bookmarked for weekend application");
  let currentJob = await repo.getById(storedJobId);
  assert(currentJob?.job_status === "saved", "Job status should now be 'saved'");

  // Move forward to 'reviewing'
  await repo.updateStatus(storedJobId, "reviewing", "user", "Reviewing requirements with team");
  currentJob = await repo.getById(storedJobId);
  assert(currentJob?.job_status === "reviewing", "Job status should now be 'reviewing'");
  console.log("✓ Workflow status advanced to 'reviewing' and recorded in audit log");

  // 3. Second crawl occurs: Same job reappears with identical source ID & tracking URL variations
  console.log("\n[Test 3] Re-crawling identical job with different marketing tracking parameters...");
  const duplicateRawJob: RawJobPosting = {
    id: "lever-job-12345", // Same source ID
    site: "lever",
    title: "Senior Distributed Systems Engineer",
    company: "CloudScale Inc",
    location: "Remote, US",
    // Different tracking params in URL
    job_url: "https://jobs.lever.co/cloudscale/lever-job-12345?utm_source=twitter&utm_campaign=q3_hiring",
    job_url_direct: "https://jobs.lever.co/cloudscale/lever-job-12345/apply?ref=tech_newsletter",
    description: "Initial description. Looking for expertise in Go, Kubernetes, and raft consensus.",
  };

  const secondIngest = await ingestRawPostings([duplicateRawJob], repo);
  assert(secondIngest.totalProcessed === 1, "Should process 1 job");
  assert(secondIngest.newImported === 0, "New imported count MUST be 0");
  assert(secondIngest.duplicatesMatched === 1, "Duplicates matched count MUST be 1");
  assert(secondIngest.items[0].id === storedJobId, "Matched job ID must be identical to stored primary key");
  assert(secondIngest.items[0].isNew === false, "Item must be flagged as isNew = false");
  
  // CRITICAL CHECK: User review status MUST NOT be overwritten back to 'discovered'
  const jobAfterDuplicateCrawl = await repo.getById(storedJobId);
  assert(
    jobAfterDuplicateCrawl?.job_status === "reviewing",
    `Job status MUST remain 'reviewing' but got '${jobAfterDuplicateCrawl?.job_status}'`
  );
  assert(jobAfterDuplicateCrawl?.availability === "open", "Availability should be refreshed to 'open'");
  console.log("✓ Deduplication matched existing posting, refreshed availability, and STRICTLY PRESERVED 'reviewing' status");

  // 4. Third crawl: Testing canonical URL deduplication (even if source_job_id was omitted or formatted differently)
  console.log("\n[Test 4] Testing Tier-2 deduplication via canonical URL matching...");
  const canonicalMatchJob: RawJobPosting = {
    id: "aggregated-feed-abc", // Different synthetic source ID
    site: "google",
    title: "Senior Distributed Systems Engineer",
    company: "CloudScale Inc",
    location: "Remote, US",
    // Canonical application URL matches:
    job_url_direct: "https://jobs.lever.co/cloudscale/lever-job-12345/apply",
    description: "Initial description. Looking for expertise in Go, Kubernetes, and raft consensus.",
  };

  const thirdIngest = await ingestRawPostings([canonicalMatchJob], repo);
  assert(thirdIngest.duplicatesMatched === 1, "Canonical URL match should detect existing posting");
  assert(thirdIngest.newImported === 0, "Must not create a second row for the same canonical URL");
  assert(thirdIngest.items[0].id === storedJobId, "Matched record should resolve to existing ID");
  console.log("✓ Canonical URL deduplication matched existing posting and prevented duplicate creation");

  // 5. Cleanup test artifacts if needed
  if (fs.existsSync(testStorePath)) {
    fs.unlinkSync(testStorePath);
  }

  console.log("\n==========================================================");
  console.log("  ALL DEDUPLICATION & STATE PRESERVATION TESTS PASSED!     ");
  console.log("==========================================================");
}

runDeduplicationAndStatePreservationTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
