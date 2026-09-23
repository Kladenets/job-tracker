import { translateRawJobPosting } from "../job-translator";
import { RawJobPosting } from "../../types/job";
import { UnifiedJobPostingSchema } from "../../types/job-posting";

function runTests() {
  console.log("--- Running Unified Data Model Translation Tests ---");

  // 1. Test Greenhouse translation
  const sampleGreenhouse: RawJobPosting = {
    id: "8556658002",
    site: "greenhouse",
    job_url: "https://job-boards.greenhouse.io/gitlab/jobs/8556658002?gh_src=12345",
    job_url_direct: "https://job-boards.greenhouse.io/gitlab/jobs/8556658002?gh_src=12345",
    title: "Senior Backend Engineer, AI",
    company: "GitLab",
    location: "Remote, United States",
    date_posted: "2026-09-14T20:01:39.000Z",
    job_type: "Full-time",
    is_remote: true,
    description: "<div>United States Salary Range: $115,200 - $194,400 USD. We require Python, LangGraph, and PostgreSQL.</div>",
  };

  const unifiedGh = translateRawJobPosting(sampleGreenhouse);
  const validatedGh = UnifiedJobPostingSchema.parse(unifiedGh);

  console.assert(validatedGh.seniority === "senior", `Expected 'senior', got ${validatedGh.seniority}`);
  console.assert(validatedGh.workplace_type === "remote", `Expected 'remote', got ${validatedGh.workplace_type}`);
  console.assert(validatedGh.canonical_url === "https://job-boards.greenhouse.io/gitlab/jobs/8556658002", `Tracking param gh_src should be stripped, got ${validatedGh.canonical_url}`);
  console.assert(validatedGh.salary_min_annual === 115200, `Expected min salary 115200, got ${validatedGh.salary_min_annual}`);
  console.assert(validatedGh.salary_max_annual === 194400, `Expected max salary 194400, got ${validatedGh.salary_max_annual}`);
  console.assert(validatedGh.crawler_data?.detected_technologies.includes("python"), "Should detect python keyword");
  console.log("✓ Greenhouse posting translation verified");

  // 2. Test Lever translation
  const sampleLever: RawJobPosting = {
    id: "ac978161-6f46-4f6b-ad9e-a258e642751c",
    site: "lever",
    job_url: "https://jobs.lever.co/palantir/ac978161?lever-source=linkedin",
    job_url_direct: "https://jobs.lever.co/palantir/ac978161/apply",
    title: "Staff Software Engineer, Infrastructure",
    company: "Palantir",
    location: "New York, NY",
    date_posted: "2026-09-10T12:00:00.000Z",
    job_type: "Full-time",
    is_remote: false,
    description: "The estimated salary range for this position is $140,000 - $210,000/year. Experience with Kubernetes and Go required.",
  };

  const unifiedLever = translateRawJobPosting(sampleLever);
  const validatedLever = UnifiedJobPostingSchema.parse(unifiedLever);

  console.assert(validatedLever.seniority === "lead", `Expected 'lead' for Staff, got ${validatedLever.seniority}`);
  console.assert(validatedLever.salary_min_annual === 140000, `Expected 140000, got ${validatedLever.salary_min_annual}`);
  console.assert(validatedLever.salary_max_annual === 210000, `Expected 210000, got ${validatedLever.salary_max_annual}`);
  console.assert(validatedLever.crawler_data?.detected_technologies.includes("kubernetes"), "Should detect kubernetes keyword");
  console.log("✓ Lever posting translation verified");

  // 3. Test JobSpy hourly translation
  const sampleJobspy: RawJobPosting = {
    id: "indeed-998877",
    site: "indeed",
    job_url: "https://www.indeed.com/viewjob?jk=998877&utm_source=feed",
    title: "Junior Frontend Developer",
    company: "Local Tech Co",
    location: "Doylestown, PA",
    is_remote: false,
    min_amount: 45,
    max_amount: 60,
    interval: "hourly",
    currency: "USD",
    description: "Great entry level role working with React and TypeScript.",
  };

  const unifiedJobspy = translateRawJobPosting(sampleJobspy);
  const validatedJobspy = UnifiedJobPostingSchema.parse(unifiedJobspy);

  console.assert(validatedJobspy.seniority === "entry", `Expected 'entry', got ${validatedJobspy.seniority}`);
  console.assert(validatedJobspy.salary_min_annual === 45 * 2080, `Expected annualized $93,600, got ${validatedJobspy.salary_min_annual}`);
  console.assert(validatedJobspy.salary_max_annual === 60 * 2080, `Expected annualized $124,800, got ${validatedJobspy.salary_max_annual}`);
  console.assert(validatedJobspy.workplace_type === "onsite", `Expected 'onsite', got ${validatedJobspy.workplace_type}`);
  console.log("✓ JobSpy hourly translation verified");

  // 4. Test Manual entry translation
  const sampleManual: RawJobPosting = {
    id: "manual-1",
    site: "manual",
    title: "Engineering Manager",
    company: "Stripe",
    location: "Remote, US",
    description: "Looking for an EM with experience scaling high-throughput payment rails.",
  };

  const unifiedManual = translateRawJobPosting(sampleManual);
  const validatedManual = UnifiedJobPostingSchema.parse(unifiedManual);

  console.assert(validatedManual.seniority === "lead", `Expected 'lead' for EM, got ${validatedManual.seniority}`);
  console.assert(validatedManual.workplace_type === "remote", `Expected 'remote', got ${validatedManual.workplace_type}`);
  console.log("✓ Manual posting translation verified");

  console.log("All data model translation assertions passed successfully!");
}

runTests();
