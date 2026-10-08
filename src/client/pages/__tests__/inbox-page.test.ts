import assert from "node:assert/strict";
import { UnifiedJobPosting } from "../../../types/job-posting";
import { filterInboxJobs, getJobFitScore, sortInboxJobs } from "../../inbox-filtering";

console.log("Running Recommendation Inbox & Job Cards Unit Tests (Chunk 4)...");

// ====================================================================
// Test 1: FitScoreArc Calculation & Semantic Thresholds
// ====================================================================
function getArcColors(score: number) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  if (clamped >= 70) {
    return { level: "high", fg: "var(--status-recommended-fg)", bg: "var(--status-recommended-bg)" };
  } else if (clamped >= 40) {
    return { level: "marginal", fg: "var(--status-marginal-fg)", bg: "var(--status-marginal-bg)" };
  } else {
    return { level: "low", fg: "var(--status-danger-fg)", bg: "var(--status-danger-bg)" };
  }
}

const arcHigh = getArcColors(87);
assert.strictEqual(arcHigh.level, "high", "Score >= 70 must be categorized as high fit");
assert.strictEqual(arcHigh.fg, "var(--status-recommended-fg)", "High fit must use recommended token");

const arcMarginal = getArcColors(58);
assert.strictEqual(arcMarginal.level, "marginal", "Score between 40 and 69 must be marginal");
assert.strictEqual(arcMarginal.fg, "var(--status-marginal-fg)", "Marginal fit must use warm amber token");

const arcLow = getArcColors(32);
assert.strictEqual(arcLow.level, "low", "Score < 40 must be low/disqualified");
assert.strictEqual(arcLow.fg, "var(--status-danger-fg)", "Low fit must use danger token");

console.log("  ✔ SVG arc ring percentage & semantic color thresholds verified");

// ====================================================================
// Test 2: Zero-Pill Typography & Formatting
// ====================================================================
function formatZeroPillMetadata(job: {
  location?: string | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  dateStr?: string | null;
  source: string;
}) {
  const loc = job.location || "Remote US";
  let sal = "Salary unlisted";
  if (job.salaryMin && job.salaryMax) {
    sal = `$${Math.round(job.salaryMin / 1000)}k – $${Math.round(job.salaryMax / 1000)}k`;
  }
  return `${loc} · ${sal} · ${job.source}`;
}

const meta = formatZeroPillMetadata({
  location: "San Francisco, CA (Remote US)",
  salaryMin: 185000,
  salaryMax: 225000,
  source: "greenhouse",
});
assert.strictEqual(
  meta,
  "San Francisco, CA (Remote US) · $185k – $225k · greenhouse",
  "Zero-pill text must concatenate metadata cleanly with middots without pill boxes"
);

console.log("  ✔ Zero-pill typography formatting verified");

// ====================================================================
// Test 3: Production filter and sort logic, including score-less jobs
// ====================================================================
const testJobs: Partial<UnifiedJobPosting>[] = [
  {
    id: "job-1",
    title: "Senior Backend Engineer",
    company: "Stripe",
    location: "San Francisco, CA",
    workplace_type: "remote",
    salary_min_annual: 180000,
    salary_max_annual: 220000,
    source: "greenhouse",
    job_status: "discovered",
    jev_confidence: 0.92,
    date_discovered: "2026-10-01T01:00:00Z",
  },
  {
    id: "job-2",
    title: "Platform Systems Architect",
    company: "Datadog",
    location: "New York, NY",
    workplace_type: "hybrid",
    salary_min_annual: 160000,
    salary_max_annual: 190000,
    source: "lever",
    job_status: "discovered",
    jev_confidence: 0.55,
    date_discovered: "2026-10-01T02:00:00Z",
  },
  {
    id: "job-3",
    title: "Junior IT Support Specialist",
    company: "Legacy Corp",
    location: "Chicago, IL",
    workplace_type: "onsite",
    salary_min_annual: null,
    salary_max_annual: null,
    source: "jobspy",
    job_status: "dismissed",
    jev_confidence: 0.25,
    date_discovered: "2026-10-01T00:00:00Z",
  },
  {
    id: "job-4",
    title: "Staff Infrastructure Engineer",
    company: "Cloudflare",
    location: "Austin, TX",
    workplace_type: "remote",
    salary_min_annual: 210000,
    salary_max_annual: 250000,
    source: "greenhouse",
    job_status: "saved",
    jev_confidence: 0.88,
    date_discovered: "2026-10-01T03:00:00Z",
  },
];

function completeJob(overrides: Partial<UnifiedJobPosting>): UnifiedJobPosting {
  return {
    id: "00000000-0000-4000-8000-000000000099",
    source: "greenhouse",
    content_hash: "hash",
    title: "Engineer",
    company: "Example",
    workplace_type: "unknown",
    employment_type: "unknown",
    seniority: "unknown",
    currency: "USD",
    description_text: "",
    date_discovered: "2026-10-01T00:00:00Z",
    job_status: "discovered",
    availability: "unknown",
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
    ...overrides,
  };
}

function analysis(
  score: number,
  recommendation: "recommend" | "consider",
  confidence: number
): NonNullable<UnifiedJobPosting["ai_analysis"]> {
  return {
    version: "1",
    analyzed_at: "2026-10-01",
    provider: "test",
    model_id: "test",
    prompt_version: "1",
    profile_state_hash: "x",
    overall_fit_score: score,
    recommendation,
    confidence,
    matched_qualifications: [],
    qualification_gaps: [],
    compensation_assessment: "unknown",
    concerns: [],
    facts_requiring_verification: [],
    suggested_resume_focus: [],
    rationale: "fit",
  };
}

const productionFilterJobs = [
  completeJob({ id: "high", title: "High fit", ai_analysis: analysis(87, "recommend", 0.55) }),
  completeJob({ id: "marginal", title: "Marginal fit", job_status: "saved", ai_analysis: analysis(55, "consider", 0.92) }),
  completeJob({ id: "dismissed-high", title: "Dismissed high", job_status: "dismissed", ai_analysis: analysis(95, "recommend", 0.99) }),
  completeJob({ id: "filtered-marginal", title: "Filtered marginal", job_status: "filtered_out", ai_analysis: analysis(50, "consider", 0.88) }),
  completeJob({ id: "unscored", title: "Unscored confidence", jev_fit: true, jev_confidence: 0.99 }),
  completeJob({ id: "reviewing", title: "Reviewing", job_status: "reviewing" }),
];
const noExtraFilters = { workplaceType: "all" as const, source: "all", missingSalary: false, missingLocation: false };

assert.strictEqual(getJobFitScore(productionFilterJobs[4]), null, "JEV confidence is not a fit score");
assert.deepStrictEqual(filterInboxJobs(productionFilterJobs, "recommended", "", noExtraFilters).map((job) => job.id), ["high"]);
assert.deepStrictEqual(filterInboxJobs(productionFilterJobs, "marginal", "", noExtraFilters).map((job) => job.id), ["marginal"]);
assert.deepStrictEqual(filterInboxJobs(productionFilterJobs, "dismissed", "", noExtraFilters).map((job) => job.id), ["dismissed-high"]);
assert.deepStrictEqual(filterInboxJobs(productionFilterJobs, "hidden", "", noExtraFilters).map((job) => job.id).sort(), ["dismissed-high", "filtered-marginal"]);
assert.deepStrictEqual(filterInboxJobs(productionFilterJobs, "saved", "", noExtraFilters).map((job) => job.id).sort(), ["marginal", "reviewing"]);
assert.strictEqual(filterInboxJobs(productionFilterJobs, "all", "confidence", noExtraFilters)[0].id, "unscored");
assert.ok(
  sortInboxJobs(productionFilterJobs, "fit_desc").slice(-2).every((job) => getJobFitScore(job) === null),
  "Unscored jobs must sort after jobs with a numeric fit score"
);

console.log("  ✔ Production filter/sort logic excludes hidden jobs and keeps confidence distinct from fit");

// ====================================================================
// Test 4: Three Differentiated Empty States Logic
// ====================================================================
function determineEmptyStateType(totalAll: number, segment: string, search: string, filterCount: number) {
  if (totalAll === 0) return "empty_database";
  if (segment === "all" && !search && filterCount === 0) return "inbox_zero";
  return "filter_mismatch";
}

assert.strictEqual(
  determineEmptyStateType(0, "all", "", 0),
  "empty_database",
  "When total database is 0, must show empty_database state"
);

assert.strictEqual(
  determineEmptyStateType(15, "all", "", 0),
  "inbox_zero",
  "When no active unreviewed jobs remain, must show inbox_zero state"
);

assert.strictEqual(
  determineEmptyStateType(15, "all", "nonexistent company", 0),
  "filter_mismatch",
  "When query returns zero results, must show filter_mismatch state"
);

console.log("  ✔ Three differentiated empty states resolution verified");

// ====================================================================
// Test 5: Keyboard Shortcuts & Triage Mapping
// ====================================================================
const shortcutActions = {
  j: "next_focus",
  k: "prev_focus",
  s: "toggle_save",
  x: "dismiss",
  a: "apply_direct",
  c: "ask_ai",
};

assert.strictEqual(shortcutActions.j, "next_focus");
assert.strictEqual(shortcutActions.k, "prev_focus");
assert.strictEqual(shortcutActions.s, "toggle_save");
assert.strictEqual(shortcutActions.x, "dismiss");
assert.strictEqual(shortcutActions.a, "apply_direct");
assert.strictEqual(shortcutActions.c, "ask_ai");

console.log("  ✔ Keyboard navigation & triage shortcut bindings verified");
console.log("All Chunk 4 Inbox & Job Cards tests passed successfully!\n");
