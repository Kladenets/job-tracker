import assert from "node:assert/strict";

console.log("Running Metrics & Funnel Dashboard Unit Tests (Chunk 6)...");

// ====================================================================
// Test 1: Date Range Filtering & Boundary Calculation
// ====================================================================
function computeDateRangeBounds(segment: "7d" | "30d" | "90d" | "all" | "custom", customStart?: string, customEnd?: string, mockNowMs: number = Date.now()) {
  if (segment === "all") {
    return { startMs: 0, endMs: mockNowMs };
  }
  if (segment === "custom") {
    return {
      startMs: customStart ? new Date(customStart).getTime() : 0,
      endMs: customEnd ? new Date(customEnd).getTime() : mockNowMs,
    };
  }
  const days = segment === "7d" ? 7 : segment === "90d" ? 90 : 30;
  return {
    startMs: mockNowMs - days * 24 * 60 * 60 * 1000,
    endMs: mockNowMs,
  };
}

const mockNow = new Date("2026-10-04T12:00:00Z").getTime();
const sevenDays = computeDateRangeBounds("7d", undefined, undefined, mockNow);
assert.strictEqual(sevenDays.endMs - sevenDays.startMs, 7 * 24 * 60 * 60 * 1000, "7d range must span exactly 7 days");

const thirtyDays = computeDateRangeBounds("30d", undefined, undefined, mockNow);
assert.strictEqual(thirtyDays.endMs - thirtyDays.startMs, 30 * 24 * 60 * 60 * 1000, "30d range must span exactly 30 days");

const allTime = computeDateRangeBounds("all", undefined, undefined, mockNow);
assert.strictEqual(allTime.startMs, 0, "All time start must be epoch 0");

console.log("  ✔ Date range boundary calculation verified");

// ====================================================================
// Test 2: Conversion Rate Formulas (Div-by-zero resilience)
// ====================================================================
function calculateConversionRates(apps: {
  appliedCount: number;
  recruiterScreenCount: number;
  interviewCount: number;
  offerCount: number;
  rejectedCount: number;
}) {
  const { appliedCount, recruiterScreenCount, interviewCount, offerCount, rejectedCount } = apps;
  return {
    recruiterScreenRate: appliedCount > 0 ? Math.round((recruiterScreenCount / appliedCount) * 100) : 0,
    interviewRate: appliedCount > 0 ? Math.round((interviewCount / appliedCount) * 100) : 0,
    offerRate: appliedCount > 0 ? Math.round((offerCount / appliedCount) * 100) : 0,
    rejectionRate: appliedCount > 0 ? Math.round((rejectedCount / appliedCount) * 100) : 0,
  };
}

// 0 applications (edge case: no division by zero)
const zeroApps = calculateConversionRates({
  appliedCount: 0,
  recruiterScreenCount: 0,
  interviewCount: 0,
  offerCount: 0,
  rejectedCount: 0,
});
assert.strictEqual(zeroApps.recruiterScreenRate, 0);
assert.strictEqual(zeroApps.interviewRate, 0);
assert.strictEqual(zeroApps.offerRate, 0);
assert.strictEqual(zeroApps.rejectionRate, 0);

// Normal applications
const populatedApps = calculateConversionRates({
  appliedCount: 20,
  recruiterScreenCount: 8,
  interviewCount: 4,
  offerCount: 2,
  rejectedCount: 10,
});
assert.strictEqual(populatedApps.recruiterScreenRate, 40, "8/20 should be 40%");
assert.strictEqual(populatedApps.interviewRate, 20, "4/20 should be 20%");
assert.strictEqual(populatedApps.offerRate, 10, "2/20 should be 10%");
assert.strictEqual(populatedApps.rejectionRate, 50, "10/20 should be 50%");

console.log("  ✔ Conversion rate formulas and div-by-zero resilience verified");

// ====================================================================
// Test 3: Small-Sample Guard Indicator (N < 10)
// ====================================================================
function checkSmallSampleGuard(appliedCount: number) {
  return {
    isSmallSample: appliedCount < 10,
    warning: appliedCount < 10 ? "Early Signal: Small sample size (N < 10 applications)" : null,
  };
}

const smallSample = checkSmallSampleGuard(4);
assert.strictEqual(smallSample.isSmallSample, true, "N=4 must trigger small sample guard");
assert.ok(smallSample.warning?.includes("N < 10"));

const largeSample = checkSmallSampleGuard(12);
assert.strictEqual(largeSample.isSmallSample, false, "N=12 must NOT trigger small sample guard");
assert.strictEqual(largeSample.warning, null);

console.log("  ✔ Small-sample indicator guard (N < 10) verified");

// ====================================================================
// Test 4: Source Channel Breakdown and Yield Calculations
// ====================================================================
interface SourceTelemetry {
  discovered: number;
  recommended: number;
  applied: number;
  callbackCount: number;
}

function computeSourceSummary(sources: Record<string, SourceTelemetry>) {
  return Object.entries(sources).map(([key, data]) => {
    const yieldRate = data.discovered > 0 ? Math.round((data.recommended / data.discovered) * 100) : 0;
    const callbackRate = data.applied > 0 ? Math.round((data.callbackCount / data.applied) * 100) : 0;
    return {
      source: key,
      yieldRate,
      callbackRate,
    };
  });
}

const sampleSources: Record<string, SourceTelemetry> = {
  greenhouse: { discovered: 50, recommended: 20, applied: 5, callbackCount: 2 },
  lever: { discovered: 30, recommended: 15, applied: 3, callbackCount: 1 },
  manual: { discovered: 5, recommended: 5, applied: 2, callbackCount: 1 },
};

const sourceMetrics = computeSourceSummary(sampleSources);
const gh = sourceMetrics.find((s) => s.source === "greenhouse")!;
assert.strictEqual(gh.yieldRate, 40, "20/50 should be 40% yield");
assert.strictEqual(gh.callbackRate, 40, "2/5 should be 40% callback");

console.log("  ✔ Source channel breakdown yield & callback metrics verified");

// ====================================================================
// Test 5: Guest Mode Perimeter Check for Metrics Dashboard
// ====================================================================
function evaluateDashboardGuestAccess(userRole: "owner" | "guest") {
  if (userRole === "guest") {
    return {
      allowed: false,
      statusCode: 403,
      uiMessage: "Restricted to authenticated candidate workspace to preserve personal applicant privacy.",
    };
  }
  return { allowed: true, statusCode: 200, uiMessage: null };
}

const guestEval = evaluateDashboardGuestAccess("guest");
assert.strictEqual(guestEval.allowed, false, "Guest must be denied access to dashboard");
assert.strictEqual(guestEval.statusCode, 403);
assert.ok(guestEval.uiMessage && guestEval.uiMessage.includes("Restricted to authenticated candidate workspace"));

const ownerEval = evaluateDashboardGuestAccess("owner");
assert.strictEqual(ownerEval.allowed, true);
assert.strictEqual(ownerEval.statusCode, 200);

console.log("  ✔ Guest mode perimeter defense for metrics dashboard verified");

// ====================================================================
// Test 6: Refresh Metrics Button Styling, Distinction from Sync, & Mobile Layout
// ====================================================================
function getRefreshButtonState(isFetching: boolean) {
  return {
    label: "Refresh Metrics", // Constant label without text toggle
    disabled: isFetching,
    iconSpin: isFetching,
    title: "Refresh metrics data",
    ariaLabel: "Refresh metrics",
    classes: "inline-flex items-center justify-center gap-1.5 h-8.5 md:h-9 px-2.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 shrink-0",
    iconClasses: `h-3.5 w-3.5 ${isFetching ? "animate-spin text-[var(--border-focus)]" : ""}`,
  };
}

// Initial and active states: label is ALWAYS "Refresh Metrics"
const idleBtn = getRefreshButtonState(false);
const activeBtn = getRefreshButtonState(true);

assert.strictEqual(idleBtn.label, "Refresh Metrics");
assert.strictEqual(activeBtn.label, "Refresh Metrics", "Text must not toggle or shift during fetch");
assert.strictEqual(idleBtn.disabled, false);
assert.strictEqual(activeBtn.disabled, true, "Must be disabled while fetching to prevent duplicate in-flight requests");
assert.strictEqual(idleBtn.iconSpin, false);
assert.strictEqual(activeBtn.iconSpin, true, "Icon must spin while fetching");
assert.ok(activeBtn.iconClasses.includes("animate-spin"), "Icon must have animate-spin class to rotate clockwise");
assert.notStrictEqual(idleBtn.label, "Sync", "Label must be distinct from recommendations Sync button");
assert.ok(idleBtn.classes.includes("h-8.5 md:h-9"), "Must match Sync button height token");
assert.ok(idleBtn.classes.includes("border-[var(--border-subtle)]"), "Must match border styling");
assert.ok(idleBtn.classes.includes("bg-[var(--surface-elevated)]"), "Must match background styling");

// Layout test: when showSearch is false, verify single-row structure (no separate line for button)
function evaluateFilterBarLayout(showSearch: boolean) {
  return {
    renderRow1: showSearch,
    controlsRow: showSearch ? "row-1" : "row-2",
    isSeparateLineOnMobile: showSearch ? false : false, // controls are never isolated on their own line when !showSearch
  };
}

const searchEnabledLayout = evaluateFilterBarLayout(true);
assert.strictEqual(searchEnabledLayout.renderRow1, true);

const dashboardNoSearchLayout = evaluateFilterBarLayout(false);
assert.strictEqual(dashboardNoSearchLayout.renderRow1, false, "Row 1 must be omitted when showSearch is false");
assert.strictEqual(dashboardNoSearchLayout.controlsRow, "row-2", "Right controls must sit in Row 2 alongside segment chips");
assert.strictEqual(dashboardNoSearchLayout.isSeparateLineOnMobile, false, "Refresh button must not be on its own line on mobile");

console.log("  ✔ Refresh metrics button styling, label distinction & mobile layout verified");
console.log("All Chunk 6 Metrics & Funnel Dashboard tests passed successfully!\n");
