import React, { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Link as LinkIcon,
  Play,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  Building2,
  Globe,
  Radio,
  Clock,
  Inbox,
  ArrowRight,
} from "lucide-react";
import { Link } from "@tanstack/react-router";

interface DiscoveryRunsPanelProps {
  onIngestUrlSuccess?: () => void;
  onDiscoveryRunSuccess?: () => void;
}

interface StoredDiscoveryRun {
  id: string;
  batch_id: string;
  source: string;
  trigger_type: "manual" | "scheduled";
  status: "queued" | "running" | "completed" | "failed";
  total_found: number;
  recommended: number;
  filtered_out: number;
  error_message: string | null;
  attempt_count: number;
  started_at: string;
}

export function DiscoveryRunsPanel({
  onIngestUrlSuccess,
  onDiscoveryRunSuccess,
}: DiscoveryRunsPanelProps) {
  const queryClient = useQueryClient();
  // Single URL Importer state
  const [jobUrl, setJobUrl] = useState("");
  const [urlTitle, setUrlTitle] = useState("");
  const [urlCompany, setUrlCompany] = useState("");
  const [isIngestingUrl, setIsIngestingUrl] = useState(false);
  const [urlResult, setUrlResult] = useState<{
    success: boolean;
    source?: string;
    message?: string;
    error?: string;
    result?: any;
  } | null>(null);

  // Manual Discovery Run state
  const [selectedSources, setSelectedSources] = useState<string[]>(["greenhouse", "lever"]);
  const [isRunningDiscovery, setIsRunningDiscovery] = useState(false);
  const [storedRuns, setStoredRuns] = useState<StoredDiscoveryRun[]>([]);
  const [storedRunsError, setStoredRunsError] = useState<string | null>(null);
  const [discoveryResult, setDiscoveryResult] = useState<{
    success: boolean;
    status?: "complete" | "partial" | "failed";
    summary?: string;
    discoveredCount?: number;
    recommendedCount?: number;
    filteredOutCount?: number;
    error?: string;
    details?: Array<{ source: string; status: string; error?: string }>;
  } | null>(null);

  const refreshStoredRuns = async () => {
    try {
      const response = await fetch("/api/discovery/runs?limit=20");
      const data = await response.json();
      if (!response.ok || !data.success || !Array.isArray(data.runs)) {
        throw new Error(data.error || "Failed to load discovery history");
      }
      setStoredRuns(data.runs);
      setStoredRunsError(null);
    } catch (error: unknown) {
      setStoredRunsError(error instanceof Error ? error.message : "Failed to load discovery history");
    }
  };

  useEffect(() => {
    void refreshStoredRuns();
  }, []);

  // Single URL Ingest Handler
  const handleIngestUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jobUrl.trim()) return;

    setIsIngestingUrl(true);
    setUrlResult(null);

    try {
      const res = await fetch("/api/jobs/ingest-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: jobUrl.trim(),
          title: urlTitle.trim() || undefined,
          company: urlCompany.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to ingest URL");
      }

      setUrlResult({
        success: true,
        source: data.source,
        message: data.message,
        result: data.result,
      });
      setJobUrl("");
      setUrlTitle("");
      setUrlCompany("");
      void queryClient.invalidateQueries({ queryKey: ["jobs"] });
      onIngestUrlSuccess?.();
    } catch (err: unknown) {
      setUrlResult({
        success: false,
        error: err instanceof Error ? err.message : "Ingestion failed",
      });
    } finally {
      setIsIngestingUrl(false);
    }
  };

  // Run Discovery Pipeline Handler
  const handleRunDiscovery = async () => {
    if (selectedSources.length === 0) return;

    setIsRunningDiscovery(true);
    setDiscoveryResult(null);

    try {
      const res = await fetch("/api/discovery/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sources: selectedSources }),
      });

      const data = await res.json();
      const details = Array.isArray(data.details) ? data.details : undefined;
      if (data.status === "partial") {
        setDiscoveryResult({
          success: false,
          status: "partial",
          summary: data.summary,
          discoveredCount: data.discoveredCount,
          recommendedCount: data.recommendedCount,
          filteredOutCount: data.filteredOutCount,
          details,
        });
        void queryClient.invalidateQueries({ queryKey: ["jobs"] });
        onDiscoveryRunSuccess?.();
        return;
      }
      if (!res.ok || !data.success) {
        setDiscoveryResult({
          success: false,
          status: data.status === "failed" ? "failed" : undefined,
          summary: data.summary,
          error: data.error || data.summary || "Discovery run failed",
          details,
        });
        return;
      }

      setDiscoveryResult({
        success: true,
        status: "complete",
        summary: data.summary,
        discoveredCount: data.discoveredCount,
        recommendedCount: data.recommendedCount,
        filteredOutCount: data.filteredOutCount,
        details,
      });
      void queryClient.invalidateQueries({ queryKey: ["jobs"] });
      onDiscoveryRunSuccess?.();
    } catch (err: unknown) {
      setDiscoveryResult({
        success: false,
        status: "failed",
        error: err instanceof Error ? err.message : "Discovery execution failed",
      });
    } finally {
      setIsRunningDiscovery(false);
      void refreshStoredRuns();
    }
  };

  const toggleSource = (source: string) => {
    setSelectedSources((prev) =>
      prev.includes(source) ? prev.filter((s) => s !== source) : [...prev, source]
    );
  };

  const partialDiscovery = discoveryResult?.status === "partial";
  const hasDiscoveryResults = discoveryResult?.success === true || partialDiscovery;

  return (
    <div className="space-y-6">
      {/* ========================================================================= */}
      {/* 1. ACTIVE SOURCE HEALTH CARDS (page-setup.md section 1.3)                 */}
      {/* ========================================================================= */}
      <div className="space-y-3">
        <div>
          <h2 className="text-sm font-bold text-[var(--text-primary)]">
            Supported Job Sources
          </h2>
          <p className="text-xs text-[var(--text-secondary)]">
            These connectors are supported. Results and errors are reported after each attempted run; no live health probe is available.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          {/* Greenhouse Card */}
          <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5 text-emerald-500" />
                Greenhouse ATS
              </span>
              <span className="inline-flex items-center gap-1 text-[10px] font-mono-tabular font-medium text-[var(--text-secondary)] bg-[var(--surface-sunken)] px-1.5 py-0.5 rounded border border-[var(--border-subtle)]">
                Supported
              </span>
            </div>
            <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
              Native boards-api endpoint with automated HTML clean-up and direct requisition availability checks.
            </p>
            <div className="pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between text-[10px] font-mono-tabular text-[var(--text-muted)]">
              <span>Target: gitlab, stripe</span>
              <span>Rate Limit: None</span>
            </div>
          </div>

          {/* Lever Card */}
          <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                <Radio className="h-3.5 w-3.5 text-blue-500" />
                Lever ATS
              </span>
              <span className="inline-flex items-center gap-1 text-[10px] font-mono-tabular font-medium text-[var(--text-secondary)] bg-[var(--surface-sunken)] px-1.5 py-0.5 rounded border border-[var(--border-subtle)]">
                Supported
              </span>
            </div>
            <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
              Direct company postings parser extracting structured workplace categorization and compensation lines.
            </p>
            <div className="pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between text-[10px] font-mono-tabular text-[var(--text-muted)]">
              <span>Target: palantir, netflix</span>
              <span>Availability: Verified</span>
            </div>
          </div>

          {/* JobSpy Scraper Card */}
          <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                <Globe className="h-3.5 w-3.5 text-purple-500" />
                JobSpy Scraper CLI
              </span>
              <span className="inline-flex items-center gap-1 text-[10px] font-mono-tabular font-medium text-[var(--text-secondary)] bg-[var(--surface-sunken)] px-1.5 py-0.5 rounded border border-[var(--border-subtle)]">
                Supported
              </span>
            </div>
            <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
              Python multi-board aggregator scraping Indeed, LinkedIn, and Google Jobs with headless browser emulation.
            </p>
            <div className="pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between text-[10px] font-mono-tabular text-[var(--text-muted)]">
              <span>Engine: Python CLI</span>
              <span>Run to check availability</span>
            </div>
          </div>

          <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                <Globe className="h-3.5 w-3.5 text-cyan-500" />
                RemoteOK
              </span>
              <span className="text-[10px] font-medium text-[var(--text-secondary)]">Supported</span>
            </div>
            <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
              Public JSON feed for remote roles with source links, tags, and salary fields when supplied.
            </p>
          </div>

          <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5 text-amber-500" />
                Jobicy
              </span>
              <span className="text-[10px] font-medium text-[var(--text-secondary)]">Supported</span>
            </div>
            <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
              Public remote-jobs API with geographic eligibility, posting date, and optional salary ranges.
            </p>
          </div>

          <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                <Radio className="h-3.5 w-3.5 text-orange-500" />
                Hacker News Hiring
              </span>
              <span className="text-[10px] font-medium text-[var(--text-secondary)]">Supported</span>
            </div>
            <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
              Recent monthly hiring threads and bounded comment pages, preserving comment and apply links.
            </p>
          </div>

          <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                <Globe className="h-3.5 w-3.5 text-indigo-500" />
                We Work Remotely
              </span>
              <span className="text-[10px] font-medium text-[var(--text-secondary)]">Supported</span>
            </div>
            <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
              Full-stack, front-end, and back-end RSS feeds with ETag and Last-Modified caching.
            </p>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. INSTANT SINGLE JOB URL IMPORTER (page-setup.md section 1.3)            */}
      {/* ========================================================================= */}
      <div className="p-4 sm:p-5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] space-y-4 shadow-xs">
        <div>
          <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
            <LinkIcon className="h-4 w-4 text-[var(--border-focus)]" />
            Instant Single Job URL Importer
          </h3>
          <p className="text-xs text-[var(--text-secondary)]">
            Paste any direct Greenhouse, Lever, LinkedIn, or Indeed job URL to parse, filter, and score with JEV.
          </p>
        </div>

        <form onSubmit={handleIngestUrl} className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="url"
              required
              value={jobUrl}
              onChange={(e) => setJobUrl(e.target.value)}
              placeholder="https://boards.greenhouse.io/gitlab/jobs/12345 or https://jobs.lever.co/palantir/abc..."
              className="flex-1 h-9 px-3 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] text-xs font-mono text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--border-focus)]"
            />
            <button
              type="submit"
              disabled={isIngestingUrl || !jobUrl.trim()}
              className="h-9 px-4 rounded-md bg-[var(--action-primary-bg)] text-white text-xs font-semibold hover:opacity-90 transition-opacity disabled:opacity-40 flex items-center justify-center gap-1.5 cursor-pointer shrink-0 shadow-xs"
            >
              {isIngestingUrl ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  <span>Ingesting & Scoring...</span>
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5 fill-current" />
                  <span>Fetch & Ingest</span>
                </>
              )}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            <input
              type="text"
              value={urlTitle}
              onChange={(e) => setUrlTitle(e.target.value)}
              placeholder="Role title override (optional)"
              className="h-8 px-2.5 rounded border border-[var(--border-subtle)] bg-[var(--surface-base)] text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--border-focus)]"
            />
            <input
              type="text"
              value={urlCompany}
              onChange={(e) => setUrlCompany(e.target.value)}
              placeholder="Company name override (optional)"
              className="h-8 px-2.5 rounded border border-[var(--border-subtle)] bg-[var(--surface-base)] text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--border-focus)]"
            />
          </div>
        </form>

        {/* Ingestion Feedback Banner */}
        {urlResult && (
          <div
            className={`p-3 rounded-lg border text-xs flex items-start gap-2.5 ${
              urlResult.success
                ? "bg-[var(--status-recommended-bg)] border-[var(--status-recommended-fg)]/20 text-[var(--text-primary)]"
                : "bg-[var(--status-danger-bg)] border-[var(--status-danger-fg)]/20 text-[var(--status-danger-fg)]"
            }`}
          >
            {urlResult.success ? (
              <CheckCircle2 className="h-4 w-4 text-[var(--status-recommended-fg)] shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            )}
            <div className="space-y-1 flex-1">
              <span className="font-semibold block">
                {urlResult.success ? "Job Ingested Successfully" : "Ingestion Failed"}
              </span>
              <p className="text-[11px] text-[var(--text-secondary)]">
                {urlResult.message || urlResult.error}
              </p>
              {urlResult.result?.postings?.[0] && (
                <div className="pt-1.5 border-t border-[var(--border-subtle)] font-mono-tabular text-[11px] flex flex-wrap items-center gap-3">
                  <span>
                    Role: <strong>{urlResult.result.postings[0].title}</strong> ({urlResult.result.postings[0].company})
                  </span>
                  <span>
                    JEV confidence: <strong>{Math.round((urlResult.result.postings[0].jev_confidence || 0) * 100)}%</strong>
                  </span>
                  <Link
                    to="/inbox"
                    className="inline-flex items-center gap-1 font-semibold text-[var(--border-focus)] hover:underline ml-auto"
                  >
                    <span>View in Inbox</span>
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 3. MANUAL DISCOVERY PIPELINE EXECUTION (page-setup.md section 1.4)        */}
      {/* ========================================================================= */}
      <div className="p-4 sm:p-5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] space-y-4 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-[var(--border-focus)]" />
              Manual Discovery Execution Trigger
            </h3>
            <p className="text-xs text-[var(--text-secondary)]">
              Run the selected connectors. Per-source results and aggregate counts appear when the request completes.
            </p>
          </div>

          <button
            type="button"
            onClick={handleRunDiscovery}
            disabled={isRunningDiscovery || selectedSources.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-[var(--action-primary-bg)] text-white text-xs font-semibold hover:opacity-90 transition-opacity disabled:opacity-40 cursor-pointer shadow-xs shrink-0"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRunningDiscovery ? "animate-spin" : ""}`} />
            <span>{isRunningDiscovery ? "Running Discovery..." : "Run Discovery Pipeline Now"}</span>
          </button>
        </div>

        {isRunningDiscovery && (
          <p role="status" aria-live="polite" className="text-xs text-[var(--text-secondary)]">
            Discovery is running. Counts will be available when selected sources finish.
          </p>
        )}

        {/* Source Selection Checkboxes */}
        <div className="flex flex-wrap items-center gap-4 text-xs pt-1">
          <span className="text-[var(--text-muted)] font-medium">Target Sources:</span>
          {[
            { id: "greenhouse", label: "Greenhouse ATS" },
            { id: "lever", label: "Lever ATS" },
            { id: "jobspy", label: "JobSpy Scraper (Indeed/LinkedIn)" },
            { id: "remoteok", label: "RemoteOK" },
            { id: "jobicy", label: "Jobicy" },
            { id: "hackernews", label: "Hacker News: Who is Hiring?" },
            { id: "weworkremotely", label: "We Work Remotely" },
          ].map((src) => (
            <label key={src.id} className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={selectedSources.includes(src.id)}
                onChange={() => toggleSource(src.id)}
                className="rounded border-[var(--border-subtle)] text-[var(--border-focus)] focus:ring-0"
              />
              <span className="text-[var(--text-primary)] font-medium">{src.label}</span>
            </label>
          ))}
        </div>

        {/* Execution Feedback / Summary Banner */}
        {discoveryResult && (
          <div
            className={`p-3.5 rounded-lg border text-xs space-y-2 ${
              discoveryResult.success
                ? "bg-[var(--status-recommended-bg)] border-[var(--status-recommended-fg)]/20"
                : partialDiscovery
                  ? "bg-[var(--status-marginal-bg)] border-[var(--status-marginal-fg)]/20"
                  : "bg-[var(--status-danger-bg)] border-[var(--status-danger-fg)]/20 text-[var(--status-danger-fg)]"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-bold flex items-center gap-1.5 text-[var(--text-primary)]">
                {discoveryResult.success ? (
                  <CheckCircle2 className="h-4 w-4 text-[var(--status-recommended-fg)]" />
                ) : (
                  <AlertCircle className={`h-4 w-4 ${partialDiscovery ? "text-[var(--status-marginal-fg)]" : "text-[var(--status-danger-fg)]"}`} />
                )}
                {discoveryResult.success
                  ? "Pipeline Run Completed"
                  : partialDiscovery
                    ? "Pipeline Run Partially Completed"
                    : "Pipeline Run Failed"}
              </span>
              {hasDiscoveryResults && (
                <Link
                  to="/inbox"
                  className="inline-flex items-center gap-1 font-semibold text-xs text-[var(--border-focus)] hover:underline"
                >
                  <Inbox className="h-3.5 w-3.5" />
                  <span>Review in Inbox →</span>
                </Link>
              )}
            </div>

            {discoveryResult.summary && (
              <p className="text-[11px] text-[var(--text-secondary)]">{discoveryResult.summary}</p>
            )}

            {hasDiscoveryResults && (
              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[var(--border-subtle)] font-mono-tabular text-center">
                <div className="p-2 rounded bg-[var(--surface-elevated)] border border-[var(--border-subtle)]">
                  <span className="text-[10px] text-[var(--text-muted)] block">Discovered</span>
                  <span className="text-sm font-bold text-[var(--text-primary)]">
                    {discoveryResult.discoveredCount ?? 0}
                  </span>
                </div>
                <div className="p-2 rounded bg-[var(--surface-elevated)] border border-[var(--border-subtle)]">
                  <span className="text-[10px] text-[var(--text-muted)] block">Filtered Out</span>
                  <span className="text-sm font-bold text-[var(--status-marginal-fg)]">
                    {discoveryResult.filteredOutCount ?? 0}
                  </span>
                </div>
                <div className="p-2 rounded bg-[var(--surface-elevated)] border border-[var(--border-subtle)]">
                  <span className="text-[10px] text-[var(--text-muted)] block">Recommended</span>
                  <span className="text-sm font-bold text-[var(--status-recommended-fg)]">
                    {discoveryResult.recommendedCount ?? 0}
                  </span>
                </div>
              </div>
            )}

            {discoveryResult.details?.filter((detail) => detail.status === "failed").map((detail) => (
              <p key={detail.source} className="text-[11px] text-[var(--status-danger-fg)]">
                {detail.source}: {detail.error || "Source failed"}
              </p>
            ))}

            {discoveryResult.error && (
              <p className="text-[11px] text-[var(--status-danger-fg)]">{discoveryResult.error}</p>
            )}
          </div>
        )}

        <div className="space-y-2 border-t border-[var(--border-subtle)] pt-4">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-[var(--text-primary)]">Recent Source Runs</h4>
            <button
              type="button"
              onClick={() => void refreshStoredRuns()}
              className="text-[10px] font-medium text-[var(--border-focus)] hover:underline"
            >
              Refresh
            </button>
          </div>
          {storedRunsError && (
            <p role="alert" className="text-[11px] text-[var(--status-danger-fg)]">
              {storedRunsError}
            </p>
          )}
          {!storedRunsError && storedRuns.length === 0 && (
            <p className="text-[11px] text-[var(--text-muted)]">No discovery runs have been recorded yet.</p>
          )}
          {storedRuns.map((run) => (
            <div
              key={run.id}
              className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] p-2.5 text-[11px]"
            >
              <div>
                <span className="font-semibold text-[var(--text-primary)]">{run.source}</span>
                <span className="ml-2 text-[var(--text-muted)]">
                  {run.trigger_type} · {new Date(run.started_at).toLocaleString()}
                </span>
                <p className="mt-1 text-[var(--text-secondary)]">
                  {run.total_found} discovered · {run.filtered_out} filtered · {run.recommended} recommended · {run.attempt_count} attempt{run.attempt_count === 1 ? "" : "s"}
                </p>
                {run.error_message && (
                  <p className="mt-1 text-[var(--status-danger-fg)]">{run.error_message}</p>
                )}
              </div>
              <span className={`rounded px-1.5 py-0.5 font-medium ${
                run.status === "completed"
                  ? "bg-[var(--status-recommended-bg)] text-[var(--status-recommended-fg)]"
                  : run.status === "failed"
                    ? "bg-[var(--status-danger-bg)] text-[var(--status-danger-fg)]"
                    : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]"
              }`}>
                {run.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
