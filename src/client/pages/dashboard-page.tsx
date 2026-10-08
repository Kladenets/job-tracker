import React, { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { StickyFilterBar } from "../components/sticky-filter-bar";
import { MetricCard } from "../components/metric-card";
import { SourceBreakdownTable } from "../components/source-breakdown-table";
import { FunnelVisualizer } from "../components/funnel-visualizer";
import { useShellStore } from "../shell/shell-store";
import { getCustomDateRangeParams, getDashboardDateRangeError } from "../dashboard-dates";
import { ShieldAlert, AlertTriangle, Inbox, Calendar, RefreshCw } from "lucide-react";
import { Link } from "@tanstack/react-router";

interface DashboardMetricsResponse {
  success: boolean;
  metrics: {
    dateRange: {
      startDate: string | null;
      endDate: string | null;
    };
    funnel: {
      discoveredCount: number;
      filteredOutCount: number;
      recommendedCount: number;
      savedCount: number;
      dismissedCount: number;
    };
    applications: {
      appliedCount: number;
      recruiterScreenCount: number;
      interviewCount: number;
      offerCount: number;
      rejectedCount: number;
      recruiterScreenRate: number;
      interviewRate: number;
      offerRate: number;
      rejectionRate: number;
      isSmallSample: boolean;
      sampleSizeWarning: string | null;
    };
    sources: Record<
      string,
      {
        discovered: number;
        recommended: number;
        applied: number;
        callbackCount: number;
        callbackRate: number;
      }
    >;
  };
}

export function DashboardPage() {
  const { userRole } = useShellStore();
  const isGuest = userRole === "guest";
  const routeSearch = useSearch({ from: "/dashboard" });
  const navigate = useNavigate({ from: "/dashboard" });

  const segment = routeSearch.range;
  const customStart = routeSearch.startDate || "";
  const customEnd = routeSearch.endDate || "";
  const dateRangeError = getDashboardDateRangeError(segment, customStart, customEnd);

  const updateSearch = (updates: Partial<typeof routeSearch>, replace = false) => {
    navigate({ search: (previous) => ({ ...previous, ...updates }), replace });
  };

  // Calculate start & end ISO dates based on active segment
  const dateParams = useMemo(() => {
    if (segment === "all") {
      return {};
    }
    if (segment === "custom") {
      return getCustomDateRangeParams(customStart || undefined, customEnd || undefined) || {};
    }
    const days = segment === "7d" ? 7 : segment === "90d" ? 90 : 30;
    const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    return { startDate: start, endDate: new Date().toISOString() };
  }, [segment, customStart, customEnd, dateRangeError]);

  // Fetch Dashboard Metrics API
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery<DashboardMetricsResponse>({
    queryKey: ["dashboard-metrics", dateParams],
    queryFn: async () => {
      const sp = new URLSearchParams();
      if (dateParams.startDate) sp.set("startDate", dateParams.startDate);
      if (dateParams.endDate) sp.set("endDate", dateParams.endDate);
      const res = await fetch(`/api/dashboard/metrics?${sp.toString()}`);
      if (!res.ok) {
        if (res.status === 403) throw new Error("GUEST_RESTRICTED");
        throw new Error(`Failed to load metrics: HTTP ${res.status}`);
      }
      return res.json();
    },
    enabled: !isGuest && !dateRangeError,
  });

  // Guest Mode Perimeter Check (page-dashboard.md section 1.6)
  if (isGuest || (isError && (error as Error)?.message === "GUEST_RESTRICTED")) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-lg mx-auto space-y-5 my-auto">
        <div className="h-14 w-14 rounded-2xl bg-[var(--surface-sunken)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--border-focus)] shadow-inner">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <div className="space-y-2">
          <h2 className="text-lg font-bold text-[var(--text-primary)]">
            Metrics & Funnel Dashboard
          </h2>
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
            Restricted to authenticated candidate workspace to preserve personal applicant privacy. Conversion rates and interview pipelines are strictly private.
          </p>
        </div>
        <Link
          to="/inbox"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-[var(--border-focus)] text-white text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer shadow-xs"
        >
          <Inbox className="h-4 w-4" />
          <span>Return to Recommendation Inbox</span>
        </Link>
      </div>
    );
  }

  const metrics = data?.metrics;
  const isSmallSample = metrics?.applications.isSmallSample ?? true;

  return (
    <div className="flex-1 flex flex-col min-h-full">
      {/* In-Page Sticky Filter Bar */}
      <StickyFilterBar
        showSearch={false}
        activeSegment={segment}
        onSegmentChange={(range) => updateSearch({
          range: range as typeof routeSearch.range,
          startDate: range === "custom" ? routeSearch.startDate : undefined,
          endDate: range === "custom" ? routeSearch.endDate : undefined,
        })}
        segments={[
          { id: "7d", label: "Last 7 Days" },
          { id: "30d", label: "Last 30 Days" },
          { id: "90d", label: "Last 90 Days" },
          { id: "all", label: "All Time" },
          { id: "custom", label: "Custom Range" },
        ]}
        rightControls={
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            title="Refresh metrics data"
            aria-label="Refresh metrics"
            className="inline-flex items-center justify-center gap-1.5 h-8.5 md:h-9 px-2.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 shrink-0"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin text-[var(--border-focus)]" : ""}`} />
            <span>Refresh Metrics</span>
          </button>
        }
      />

      {/* Main Container */}
      <div className="p-4 md:p-6 max-w-7xl mx-auto w-full space-y-6 flex-1">
        {/* Header & Small Sample Banner */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-[var(--border-subtle)]">
          <div>
            <h1 className="text-lg md:text-xl font-bold tracking-tight text-[var(--text-primary)]">
              Metrics & Conversion Funnel
            </h1>
            <p className="text-xs text-[var(--text-secondary)]">
              Auditable discovery throughput, interview conversion rates, and small-sample data guards.
            </p>
          </div>

          {/* Small Sample Warning Indicator (page-dashboard.md section 1.4) */}
          {isSmallSample && (
            <div
              data-testid="small-sample-badge"
              className="self-start sm:self-auto px-2.5 py-1 rounded-md bg-[var(--status-marginal-bg)] text-[var(--status-marginal-fg)] border border-[var(--status-marginal-fg)]/20 text-xs font-semibold font-mono-tabular flex items-center gap-1.5 shadow-xs"
            >
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span>Early Signal: Small sample size (N &lt; 10 applications)</span>
            </div>
          )}
        </div>

        {/* Custom Date Range Picker (rendered when custom segment is selected) */}
        {segment === "custom" && (
          <div className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] flex flex-wrap items-center gap-3 text-xs">
            <span className="font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-[var(--border-focus)]" />
              Custom Date Range:
            </span>
            <div className="flex items-center gap-2 font-mono-tabular">
              <label className="text-[var(--text-muted)]">From</label>
              <input
                type="date"
                value={customStart}
                onChange={(e) => updateSearch({ startDate: e.target.value || undefined }, true)}
                className="h-7 px-2 rounded border border-[var(--border-subtle)] bg-[var(--surface-base)] text-xs text-[var(--text-primary)]"
              />
              <label className="text-[var(--text-muted)]">To</label>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => updateSearch({ endDate: e.target.value || undefined }, true)}
                className="h-7 px-2 rounded border border-[var(--border-subtle)] bg-[var(--surface-base)] text-xs text-[var(--text-primary)]"
              />
            </div>
          </div>
        )}

        {/* Loading Skeletons */}
        {dateRangeError ? (
          <div role="alert" className="rounded-md border border-[var(--status-danger-fg)]/30 bg-[var(--status-danger-bg)]/20 p-4 text-sm text-[var(--status-danger-fg)]">
            {dateRangeError}
          </div>
        ) : isError ? (
          <div role="alert" className="rounded-md border border-[var(--status-danger-fg)]/30 bg-[var(--status-danger-bg)]/20 p-4 text-sm text-[var(--status-danger-fg)] flex items-center justify-between gap-3">
            <span>{error instanceof Error ? error.message : "Failed to load metrics."}</span>
            <button type="button" onClick={() => refetch()} className="shrink-0 underline">Retry</button>
          </div>
        ) : isLoading ? (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="h-28 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] animate-pulse"
                />
              ))}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="h-28 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] animate-pulse"
                />
              ))}
            </div>
          </div>
        ) : metrics ? (
          <>
            {/* Section 1: Discovery & Evaluation Funnel */}
            <div className="space-y-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] font-mono-tabular">
                Core Discovery Throughput
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                <MetricCard
                  title="Jobs Discovered"
                  value={metrics.funnel.discoveredCount}
                  subtitle="Total raw crawled postings"
                  formula="Count of all unique jobs ingested during period"
                />
                <MetricCard
                  title="Passed Filtering"
                  value={metrics.funnel.recommendedCount}
                  status="recommended"
                  subtitle={`${
                    metrics.funnel.discoveredCount > 0
                      ? Math.round(
                          (metrics.funnel.recommendedCount / metrics.funnel.discoveredCount) * 100
                        )
                      : 0
                  }% overall yield`}
                  formula="Jobs passing hard rules and JEV qualification thresholds"
                />
                <MetricCard
                  title="Saved & Bookmarked"
                  value={metrics.funnel.savedCount}
                  subtitle="Candidates review shortlist"
                  formula="Jobs explicitly marked 'saved' or 'reviewing'"
                />
                <MetricCard
                  title="Jobs Dismissed"
                  value={metrics.funnel.dismissedCount}
                  status="marginal"
                  subtitle="Filtered or rejected"
                  formula="Jobs user dismissed or system marked irrelevant"
                />
              </div>
            </div>

            {/* Section 2: Application & Conversion Rates */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] font-mono-tabular">
                  Application & Interview Conversion Rates
                </h2>
                {isSmallSample && (
                  <span className="text-[10px] text-[var(--status-marginal-fg)] font-mono-tabular font-medium">
                    Volatile: Small N
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
                <MetricCard
                  title="Applications Submitted"
                  value={metrics.applications.appliedCount}
                  subtitle="Active pipeline submissions"
                  formula="Distinct applications entered into pipeline"
                />
                <MetricCard
                  title="Recruiter Screen Rate"
                  value={metrics.applications.recruiterScreenRate}
                  isPercentage
                  rateNumerator={metrics.applications.recruiterScreenCount}
                  rateDenominator={metrics.applications.appliedCount}
                  status={metrics.applications.recruiterScreenRate >= 20 ? "recommended" : "default"}
                  subtitle="Screen callbacks"
                  formula="Count(screen or beyond) / Count(total applied) * 100"
                  isSmallSample={isSmallSample}
                />
                <MetricCard
                  title="Interview Rate"
                  value={metrics.applications.interviewRate}
                  isPercentage
                  rateNumerator={metrics.applications.interviewCount}
                  rateDenominator={metrics.applications.appliedCount}
                  status={metrics.applications.interviewRate >= 15 ? "recommended" : "default"}
                  subtitle="Technical / team rounds"
                  formula="Count(interviewing or beyond) / Count(total applied) * 100"
                  isSmallSample={isSmallSample}
                />
                <MetricCard
                  title="Offer Rate"
                  value={metrics.applications.offerRate}
                  isPercentage
                  rateNumerator={metrics.applications.offerCount}
                  rateDenominator={metrics.applications.appliedCount}
                  status={metrics.applications.offerRate > 0 ? "recommended" : "default"}
                  subtitle="Formal job offers"
                  formula="Count(offer or accepted) / Count(total applied) * 100"
                  isSmallSample={isSmallSample}
                />
                <MetricCard
                  title="Rejection Rate"
                  value={metrics.applications.rejectionRate}
                  isPercentage
                  rateNumerator={metrics.applications.rejectedCount}
                  rateDenominator={metrics.applications.appliedCount}
                  status={metrics.applications.rejectionRate > 50 ? "marginal" : "default"}
                  subtitle="Applications closed / passed"
                  formula="Count(applications marked rejected) / Count(total applied) * 100"
                  isSmallSample={isSmallSample}
                />
              </div>
            </div>

            {/* Section 3: Visualizer Funnel */}
            <FunnelVisualizer
              funnel={{
                discoveredCount: metrics.funnel.discoveredCount,
                recommendedCount: metrics.funnel.recommendedCount,
                savedCount: metrics.funnel.savedCount,
                dismissedCount: metrics.funnel.dismissedCount,
                appliedCount: metrics.applications.appliedCount,
                recruiterScreenCount: metrics.applications.recruiterScreenCount,
                interviewCount: metrics.applications.interviewCount,
                offerCount: metrics.applications.offerCount,
                rejectedCount: metrics.applications.rejectedCount,
              }}
            />

            {/* Section 4: Source Channel Effectiveness Table */}
            <div className="space-y-3">
              <SourceBreakdownTable sources={metrics.sources} />
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
