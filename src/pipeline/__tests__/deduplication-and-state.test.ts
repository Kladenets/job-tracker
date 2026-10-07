import fs from "fs";
import path from "path";
import { ingestRawPostings } from "../ingestion-pipeline";
import { RawJobPosting } from "../../types/job";
import { FileJobRepository } from "../../db/file-repository";
import { loadSearchProfile } from "../../config/search-profile";
import { evaluateDeterministicFilter } from "../deterministic-filter";
import { translateRawJobPosting } from "../../normalizers/job-translator";

// Helper assertion function
function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ Assertion Failed: ${message}`);
    throw new Error(`Assertion Failed: ${message}`);
  }
}

async function runDeduplicationAndStatePreservationTests() {
  console.log("==========================================================");
  console.log(" Running Deduplication, Filtering & State Preservation Tests ");
  console.log("==========================================================");

  // Use a dedicated isolated test store file
  const testStorePath = path.join(process.cwd(), "data", "test_job_store.json");
  if (fs.existsSync(testStorePath)) {
    fs.unlinkSync(testStorePath);
  }

  // Instantiate isolated test repository
  const repo = new FileJobRepository(testStorePath);

  const restrictedProfile = structuredClone(loadSearchProfile());
  restrictedProfile.deterministicFilterRules.workplace.allowedTypes = ["onsite"];
  const remotePosting = translateRawJobPosting({
    id: "remote-type-filter-test",
    site: "indeed",
    title: "Software Engineer",
    company: "Allowed Company",
    location: "Remote, US",
    is_remote: true,
    description: "Software Engineer role.",
  });
  const remoteTypeEvaluation = evaluateDeterministicFilter(remotePosting, restrictedProfile);
  assert(
    remoteTypeEvaluation.matchedRules.some((rule) => rule.rule_id === "workplace_type_not_allowed"),
    "Known workplace types omitted from allowedTypes must be rejected"
  );

  const unknownWorkplacePosting = translateRawJobPosting({
    id: "unknown-type-filter-test",
    site: "indeed",
    title: "Software Engineer",
    company: "Allowed Company",
    description: "Software Engineer role.",
  });
  assert(
    evaluateDeterministicFilter(unknownWorkplacePosting, restrictedProfile).passed,
    "Unknown workplace data must remain eligible even when unknown is not selected"
  );

  const nearbyOnsitePosting = translateRawJobPosting({
    id: "nearby-onsite-test",
    site: "indeed",
    title: "Software Engineer",
    company: "Allowed Company",
    location: "Philadelphia, PA",
    is_remote: false,
    description: "Software Engineer role. 100% onsite.",
  });
  assert(
    evaluateDeterministicFilter(nearbyOnsitePosting, loadSearchProfile()).passed,
    "Geocodable onsite locations within the configured radius must remain eligible"
  );

  const unknownDistancePosting = translateRawJobPosting({
    id: "unknown-distance-test",
    site: "indeed",
    title: "Software Engineer",
    company: "Allowed Company",
    location: "Office location not disclosed",
    is_remote: false,
    description: "Software Engineer role. 100% onsite.",
  });
  assert(
    evaluateDeterministicFilter(unknownDistancePosting, loadSearchProfile()).passed,
    "Onsite locations without a resolvable postal centroid must remain unknown, not be guessed distant"
  );

  // 1. Ingest brand new job posting (First crawl)
  const initialRawJob: RawJobPosting = {
    id: "lever-job-12345",
    site: "lever",
    title: "Senior Distributed Systems Engineer",
    company: "CloudScale Inc",
    location: "Remote, US",
    job_url: "https://jobs.lever.co/cloudscale/lever-job-12345?utm_source=linkedin&utm_medium=cpc",
    job_url_direct: "https://jobs.lever.co/cloudscale/lever-job-12345/apply?gh_src=tracking789",
    description: "Initial description. Looking for expertise in Go, Kubernetes, and raft consensus. Salary $140,000 - $180,000.",
  };

  console.log("\n[Test 1] Ingesting viable posting for the first time...");
  const firstIngest = await ingestRawPostings([initialRawJob], { customRepo: repo });
  assert(firstIngest.totalProcessed === 1, "Should process 1 job");
  assert(firstIngest.newImported === 1, "Should mark 1 job as newly imported");
  assert(firstIngest.filteredOut === 0, "Viable job should NOT be filtered out");
  assert(firstIngest.duplicatesMatched === 0, "Duplicates should be 0 on first ingest");
  const storedJobId = firstIngest.items[0].id;
  assert(firstIngest.items[0].isNew === true, "Item must be flagged as isNew = true");
  assert(firstIngest.items[0].status === "discovered", "Initial status must be 'discovered'");
  assert(firstIngest.items[0].jevConfidence != null, "JEV confidence must be populated");
  console.log(`✓ Initial ingestion created posting with JEV confidence = ${firstIngest.items[0].jevConfidence}`);

  // 2. Test Missing Fields as Nulls (salary null, location null)
  console.log("\n[Test 2] Testing missing fields retention as nulls (unknowns)...");
  const jobWithMissingFields: RawJobPosting = {
    id: "greenhouse-999000",
    site: "greenhouse",
    title: "Full Stack Engineer",
    company: "Stealth Startup",
    // No salary, no location listed!
    job_url: "https://job-boards.greenhouse.io/stealth/jobs/999000",
    description: "Looking for a full stack engineer with TypeScript and React experience.",
  };

  const missingFieldsIngest = await ingestRawPostings([jobWithMissingFields], { customRepo: repo });
  assert(missingFieldsIngest.newImported === 1, "Job with missing fields must be imported");
  assert(missingFieldsIngest.filteredOut === 0, "Missing fields must NEVER trigger filtering exclusion");
  const storedMissingJob = await repo.getById(missingFieldsIngest.items[0].id);
  assert(storedMissingJob?.salary_min_annual == null, "salary_min_annual must be null");
  assert(storedMissingJob?.location == null, "location must be null");
  assert(storedMissingJob?.job_status === "discovered", "Status must remain 'discovered'");
  console.log("✓ Missing fields correctly preserved as null/unknown without triggering filtering exclusion");

  // 3. Test Deterministic Filtering Hard Gate (Non-viable jobs)
  console.log("\n[Test 3] Testing deterministic hard filtering on non-viable jobs...");
  const nonViableJobs: RawJobPosting[] = [
    {
      id: "bad-salary-1",
      site: "indeed",
      title: "Software Engineer",
      company: "LowPay LLC",
      location: "Remote, US",
      min_amount: 30000,
      max_amount: 50000,
      interval: "yearly",
      description: "Junior role paying $30,000 - $50,000.",
    },
    {
      id: "bad-location-1",
      site: "indeed",
      title: "Full Stack Developer",
      company: "Bay Area Corp",
      location: "San Francisco, CA",
      is_remote: false, // 100% onsite in San Francisco!
      description: "100% onsite in downtown San Francisco required.",
    },
    {
      id: "bad-title-1",
      site: "indeed",
      title: "Unpaid Software Engineering Intern",
      company: "Startup Co",
      location: "Remote",
      description: "Unpaid internship for college credit.",
    },
    {
      id: "blacklisted-co-1",
      site: "indeed",
      title: "Senior Full Stack Engineer",
      company: "Revature",
      location: "Remote",
      description: "Entry-level training contract.",
    },
  ];

  const filterIngest = await ingestRawPostings(nonViableJobs, { customRepo: repo });
  assert(filterIngest.filteredOut === 4, `All 4 non-viable jobs must be filtered out, got ${filterIngest.filteredOut}`);
  for (const item of filterIngest.items) {
    assert(item.status === "filtered_out", `Expected status 'filtered_out', got ${item.status}`);
    const dbRecord = await repo.getById(item.id);
    assert(
      (dbRecord?.crawler_data?.matched_rules?.length || 0) > 0,
      "Filtered out job must retain matched failing rule evidence"
    );
  }
  console.log("✓ Deterministic filter correctly rejected non-viable jobs with audit evidence");

  // 4. User reviews and advances workflow status in the app
  console.log("\n[Test 4] Simulating user workflow updates (advancing to 'saved', then 'reviewing')...");
  await repo.updateStatus(storedJobId, "saved", "user", "Bookmarked for weekend application");
  let currentJob = await repo.getById(storedJobId);
  assert(currentJob?.job_status === "saved", "Job status should now be 'saved'");

  await repo.updateStatus(storedJobId, "reviewing", "user", "Reviewing requirements with team");
  currentJob = await repo.getById(storedJobId);
  assert(currentJob?.job_status === "reviewing", "Job status should now be 'reviewing'");
  console.log("✓ Workflow status advanced to 'reviewing' and recorded in audit log");

  // 5. Re-crawl identical job with different marketing tracking parameters
  console.log("\n[Test 5] Re-crawling identical job with tracking parameter variations...");
  const duplicateRawJob: RawJobPosting = {
    id: "lever-job-12345",
    site: "lever",
    title: "Senior Distributed Systems Engineer",
    company: "CloudScale Inc",
    location: "Remote, US",
    job_url: "https://jobs.lever.co/cloudscale/lever-job-12345?utm_source=twitter&utm_campaign=q3_hiring",
    job_url_direct: "https://jobs.lever.co/cloudscale/lever-job-12345/apply?ref=tech_newsletter",
    description: "Initial description. Looking for expertise in Go, Kubernetes, and raft consensus. Salary $140,000 - $180,000.",
  };

  const secondIngest = await ingestRawPostings([duplicateRawJob], { customRepo: repo });
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

  // 6. Cross-Source Deduplication (Indeed/Google Aggregator pointing to Lever direct ATS link)
  console.log("\n[Test 6] Testing cross-source canonical URL deduplication (Aggregator -> Direct ATS link)...");
  const aggregatorPost: RawJobPosting = {
    id: "indeed-jk-xyz987", // Different source ID
    site: "indeed",
    title: "Senior Distributed Systems Engineer",
    company: "CloudScale Inc",
    location: "Remote, US",
    job_url: "https://www.indeed.com/viewjob?jk=xyz987&from=serp",
    // job_url_direct resolves to the same canonical Lever application link:
    job_url_direct: "https://jobs.lever.co/cloudscale/lever-job-12345/apply?ref=indeed_feed",
    description: "Initial description. Looking for expertise in Go, Kubernetes, and raft consensus. Salary $140,000 - $180,000.",
  };

  const thirdIngest = await ingestRawPostings([aggregatorPost], { customRepo: repo });
  assert(thirdIngest.duplicatesMatched === 1, "Canonical URL match should detect existing posting across sources");
  assert(thirdIngest.newImported === 0, "Must not create duplicate row for aggregator wrapper");
  assert(thirdIngest.items[0].id === storedJobId, "Matched record should resolve to existing ID");
  console.log("✓ Aggregator cross-source canonical URL deduplication successfully resolved to existing posting");

  // 7. Content Hash Change Detection on Re-crawl
  console.log("\n[Test 7] Testing content hash change detection during re-crawl...");
  const updatedContentJob: RawJobPosting = {
    id: "lever-job-12345",
    site: "lever",
    title: "Senior Distributed Systems Engineer",
    company: "CloudScale Inc",
    location: "Remote, US",
    job_url: "https://jobs.lever.co/cloudscale/lever-job-12345",
    job_url_direct: "https://jobs.lever.co/cloudscale/lever-job-12345/apply",
    description: "UPDATED: We have added requirement for Rust in addition to Go, Kubernetes, and raft consensus. Salary $140,000 - $180,000.",
  };

  const fourthIngest = await ingestRawPostings([updatedContentJob], { customRepo: repo });
  assert(fourthIngest.duplicatesMatched === 1, "Should match duplicate");
  const jobAfterContentUpdate = await repo.getById(storedJobId);
  assert(
    Boolean(jobAfterContentUpdate?.description_text.includes("UPDATED: We have added requirement for Rust")),
    "Updated text should be updated in DB store"
  );
  assert(
    jobAfterContentUpdate?.job_status === "reviewing",
    "Workflow status MUST remain 'reviewing' even after content change"
  );
  console.log("✓ Content change detected, description updated, and workflow status strictly preserved");

  // 8. Cleanup test store
  if (fs.existsSync(testStorePath)) {
    fs.unlinkSync(testStorePath);
  }

  console.log("\n==========================================================");
  console.log("  ALL TESTS PASSED WITH 100% SUCCESS!                    ");
  console.log("==========================================================");
}

runDeduplicationAndStatePreservationTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
