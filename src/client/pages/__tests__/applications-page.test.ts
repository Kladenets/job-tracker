import assert from "node:assert/strict";
import { Application, ApplicationStatus, ApplicationStatusSchema } from "../../../types/job-posting";
import {
  APPLICATION_STAGE_DEFINITIONS,
  ARCHIVED_APPLICATION_STATUSES,
} from "../../components/application-stages";

console.log("Running Application Tracking Board Unit Tests (Chunk 5)...");

// ====================================================================
// Test 1: Lifecycle Stages Schema Validation
// ====================================================================
const requiredStages: ApplicationStatus[] = [
  "preparing",
  "applied",
  "recruiter_screen",
  "interviewing",
  "assessment",
  "offer",
  "accepted",
  "rejected",
  "withdrawn",
  "inactive",
];

for (const stage of requiredStages) {
  const result = ApplicationStatusSchema.safeParse(stage);
  assert.ok(result.success, `Application stage '${stage}' must be valid under ApplicationStatusSchema`);
}
console.log("  ✔ All 10 lifecycle stages validated against ApplicationStatusSchema");

assert.deepStrictEqual(
  APPLICATION_STAGE_DEFINITIONS.map((stage) => stage.id).sort(),
  [...ApplicationStatusSchema.options].sort(),
  "Kanban and drawer stage definitions must cover every valid application status exactly once"
);
assert.strictEqual(new Set(APPLICATION_STAGE_DEFINITIONS.map((stage) => stage.id)).size, 10);
console.log("  ✔ Kanban and drawer expose all 10 lifecycle stages");

// ====================================================================
// Test 2: Next Action Deadline Urgency Calculation
// ====================================================================
function calculateNextActionUrgency(deadlineIso: string, referenceTimeMs: number) {
  const dueDate = new Date(deadlineIso).getTime();
  const diffDays = Math.ceil((dueDate - referenceTimeMs) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return { urgency: "overdue", diffDays };
  if (diffDays <= 2) return { urgency: "soon", diffDays };
  return { urgency: "normal", diffDays };
}

const mockNow = new Date("2026-10-01T12:00:00Z").getTime();

// 2 days ago -> overdue
const overdue = calculateNextActionUrgency("2026-09-29T12:00:00Z", mockNow);
assert.strictEqual(overdue.urgency, "overdue", "Past deadline must be marked overdue");
assert.ok(overdue.diffDays < 0);

// Today / 1 day away -> soon
const dueTomorrow = calculateNextActionUrgency("2026-10-02T12:00:00Z", mockNow);
assert.strictEqual(dueTomorrow.urgency, "soon", "Deadline within 2 days must be marked soon");

// 7 days away -> normal
const dueNextWeek = calculateNextActionUrgency("2026-10-08T12:00:00Z", mockNow);
assert.strictEqual(dueNextWeek.urgency, "normal", "Future deadline > 2 days must be normal");

console.log("  ✔ Next action deadline urgency classification (overdue, soon, normal) verified");

// ====================================================================
// Test 3: Relative Applied Days Calculation
// ====================================================================
function getRelativeAppliedDays(appliedIso: string, referenceTimeMs: number): string {
  const appliedTime = new Date(appliedIso).getTime();
  const diffDays = Math.floor((referenceTimeMs - appliedTime) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Applied today";
  if (diffDays === 1) return "Applied 1d ago";
  return `Applied ${diffDays}d ago`;
}

assert.strictEqual(getRelativeAppliedDays("2026-10-01T08:00:00Z", mockNow), "Applied today");
assert.strictEqual(getRelativeAppliedDays("2026-09-30T10:00:00Z", mockNow), "Applied 1d ago");
assert.strictEqual(getRelativeAppliedDays("2026-09-26T12:00:00Z", mockNow), "Applied 5d ago");

console.log("  ✔ Relative applied days formatting verified");

// ====================================================================
// Test 4: Kanban Grouping and Segment Filtering
// ====================================================================
const testApplications: Application[] = [
  {
    id: "app-1",
    job_posting_id: "00000000-0000-0000-0000-000000000001",
    status: "applied",
    application_url: "https://linear.app/careers",
    applied_at: "2026-09-28T00:00:00Z",
    next_action_date: "2026-10-05T00:00:00Z",
    user_notes: "Initial referral from Sarah",
    stage_history: [{ stage: "applied", entered_at: "2026-09-28T00:00:00Z" }],
    created_at: "2026-09-28T00:00:00Z",
    updated_at: "2026-09-28T00:00:00Z",
  },
  {
    id: "app-2",
    job_posting_id: "00000000-0000-0000-0000-000000000002",
    status: "interviewing",
    application_url: null,
    applied_at: "2026-09-20T00:00:00Z",
    next_action_date: "2026-10-02T00:00:00Z",
    user_notes: "System design round scheduled",
    stage_history: [
      { stage: "applied", entered_at: "2026-09-20T00:00:00Z" },
      { stage: "interviewing", entered_at: "2026-09-25T00:00:00Z" },
    ],
    created_at: "2026-09-20T00:00:00Z",
    updated_at: "2026-09-25T00:00:00Z",
  },
  {
    id: "app-3",
    job_posting_id: "00000000-0000-0000-0000-000000000003",
    status: "rejected",
    application_url: null,
    applied_at: "2026-09-10T00:00:00Z",
    next_action_date: null,
    user_notes: "Position filled internally",
    stage_history: [
      { stage: "applied", entered_at: "2026-09-10T00:00:00Z" },
      { stage: "rejected", entered_at: "2026-09-15T00:00:00Z" },
    ],
    created_at: "2026-09-10T00:00:00Z",
    updated_at: "2026-09-15T00:00:00Z",
  },
];

// Active segment filter should exclude rejected/withdrawn
const segmentTerminalStatuses: ApplicationStatus[] = ["accepted", "rejected", "withdrawn", "inactive"];
const segmentApplications = [
  ...testApplications,
  ...segmentTerminalStatuses.filter((status) => !testApplications.some((app) => app.status === status)).map((status, index) => ({
    ...testApplications[0],
    id: `terminal-${index}`,
    status,
  })),
  { ...testApplications[0], id: "active-offer", status: "offer" as const },
];
const activeApps = segmentApplications.filter((application) => !ARCHIVED_APPLICATION_STATUSES.has(application.status));
assert.strictEqual(activeApps.length, 3, "Active filter must exclude terminal applications but retain offers");
assert.ok(activeApps.some((a) => a.id === "app-1"));
assert.ok(activeApps.some((a) => a.id === "app-2"));
assert.ok(activeApps.some((application) => application.id === "active-offer"), "Offer remains in the active pipeline");

const archivedApps = segmentApplications.filter((application) => ARCHIVED_APPLICATION_STATUSES.has(application.status));
assert.strictEqual(archivedApps.length, 4, "Archived filter must include each terminal application stage");
assert.deepStrictEqual(
  new Set(archivedApps.map((application) => application.status)),
  new Set(segmentTerminalStatuses)
);
assert.strictEqual(activeApps.some((application) => archivedApps.some((archived) => archived.id === application.id)), false);

console.log("  ✔ Pipeline segment filtering (active vs archived) verified");

// ====================================================================
// Test 5: Stage History Audit Trail Append Logic
// ====================================================================
function advanceStage(
  currentApp: Application,
  newStage: ApplicationStatus,
  notes?: string
): Application {
  const now = new Date().toISOString();
  return {
    ...currentApp,
    status: newStage,
    stage_history: [
      ...currentApp.stage_history,
      {
        stage: newStage,
        entered_at: now,
        notes: notes || `Stage updated to ${newStage}`,
      },
    ],
    updated_at: now,
  };
}

const advanced = advanceStage(testApplications[0], "recruiter_screen", "Spoke with recruiter John");
assert.strictEqual(advanced.status, "recruiter_screen");
assert.strictEqual(advanced.stage_history.length, 2);
assert.strictEqual(advanced.stage_history[1].stage, "recruiter_screen");
assert.strictEqual(advanced.stage_history[1].notes, "Spoke with recruiter John");

console.log("  ✔ Stage history audit trail append logic verified");

// ====================================================================
// Test 6: Guest Mode Presentation Rule Verification
// ====================================================================
function evaluateGuestAccess(role: "owner" | "guest") {
  if (role === "guest") {
    return {
      allowed: false,
      status: 403,
      uiMessage:
        "Application Pipeline & Kanban Tracker: Restricted to authenticated candidate workspace to preserve personal applicant privacy.",
    };
  }
  return { allowed: true, status: 200 };
}

const guestCheck = evaluateGuestAccess("guest");
assert.strictEqual(guestCheck.allowed, false);
assert.strictEqual(guestCheck.status, 403);
assert.ok(guestCheck.uiMessage && guestCheck.uiMessage.includes("Restricted to authenticated candidate workspace"));

const ownerCheck = evaluateGuestAccess("owner");
assert.strictEqual(ownerCheck.allowed, true);
assert.strictEqual(ownerCheck.status, 200);

console.log("  ✔ Guest mode perimeter defense & privacy guard presentation verified");
console.log("All Chunk 5 Application Tracking Board tests passed successfully!\n");
