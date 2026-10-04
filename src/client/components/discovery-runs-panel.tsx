import React, { useState } from "react";
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

export function DiscoveryRunsPanel({
  onIngestUrlSuccess,
  onDiscoveryRunSuccess,
}: DiscoveryRunsPanelProps) {
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
  const [discoveryResult, setDiscoveryResult] = useState<{
    success: boolean;
    summary?: string;
    discoveredCount?: number;
    recommendedCount?: number;
    filteredOutCount?: number;
    error?: string;
  } | null>(null);

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
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Discovery run failed");
      }

      setDiscoveryResult({
        success: true,
        summary: data.summary,
        discoveredCount: data.discoveredCount,
        recommendedCount: data.recommendedCount,
        filteredOutCount: data.filteredOutCount,
      });
      onDiscoveryRunSuccess?.();
    } catch (err: unknown) {
      setDiscoveryResult({
        success: false,
        error: err instanceof Error ? err.message : "Discovery execution failed",
      });
    } finally {
      setIsRunningDiscovery(false);
    }
  };

  const toggleSource = (source: string) => {
    setSelectedSources((prev) =>
      prev.includes(source) ? prev.filter((s) => s !== source) : [...prev, source]
    );
  };

  return (
    <div className="space-y-6">
      {/* ========================================================================= */}
      {/* 1. ACTIVE SOURCE HEALTH CARDS (page-setup.md section 1.3)                 */}
      {/* ========================================================================= */}
      <div className="space-y-3">
        <div>
          <h2 className="text-sm font-bold text-[var(--text-primary)]">
            Active Source Adapters & Crawler Health
          </h2>
          <p className="text-xs text-[var(--text-secondary)]">
            Real-time status of configured ATS connectors and multi-source scrapers.
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
              <span className="inline-flex items-center gap-1 text-[10px] font-mono-tabular font-medium text-[var(--status-recommended-fg)] bg-[var(--status-recommended-bg)] px-1.5 py-0.5 rounded border border-[var(--status-recommended-fg)]/20">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live / HTTP API
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
              <span className="inline-flex items-center gap-1 text-[10px] font-mono-tabular font-medium text-[var(--status-recommended-fg)] bg-[var(--status-recommended-bg)] px-1.5 py-0.5 rounded border border-[var(--status-recommended-fg)]/20">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live / REST API
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
              <span className="inline-flex items-center gap-1 text-[10px] font-mono-tabular font-medium text-[var(--status-recommended-fg)] bg-[var(--status-recommended-bg)] px-1.5 py-0.5 rounded border border-[var(--status-recommended-fg)]/20">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Ready
              </span>
            </div>
            <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
              Python multi-board aggregator scraping Indeed, LinkedIn, and Google Jobs with headless browser emulation.
            </p>
            <div className="pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between text-[10px] font-mono-tabular text-[var(--text-muted)]">
              <span>Engine: Python 3 / TLS</span>
              <span>Proxy: Fallback</span>
            </div>
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
              className="h-9 px-4 rounded-md bg-[var(--border-focus)] text-white text-xs font-semibold hover:opacity-90 transition-opacity disabled:opacity-40 flex items-center justify-center gap-1.5 cursor-pointer shrink-0 shadow-xs"
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
                    Fit Score: <strong>{Math.round((urlResult.result.postings[0].jev_confidence || 0) * 100)}%</strong>
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
              Initiate a live crawling cycle across selected target adapters to discover and evaluate new postings.
            </p>
          </div>

          <button
            type="button"
            onClick={handleRunDiscovery}
            disabled={isRunningDiscovery || selectedSources.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-[var(--border-focus)] text-white text-xs font-semibold hover:opacity-90 transition-opacity disabled:opacity-40 cursor-pointer shadow-xs shrink-0"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRunningDiscovery ? "animate-spin" : ""}`} />
            <span>{isRunningDiscovery ? "Running Discovery..." : "Run Discovery Pipeline Now"}</span>
          </button>
        </div>

        {/* Source Selection Checkboxes */}
        <div className="flex flex-wrap items-center gap-4 text-xs pt-1">
          <span className="text-[var(--text-muted)] font-medium">Target Sources:</span>
          {[
            { id: "greenhouse", label: "Greenhouse ATS" },
            { id: "lever", label: "Lever ATS" },
            { id: "jobspy", label: "JobSpy Scraper (Indeed/LinkedIn)" },
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
                : "bg-[var(--status-danger-bg)] border-[var(--status-danger-fg)]/20 text-[var(--status-danger-fg)]"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-bold flex items-center gap-1.5 text-[var(--text-primary)]">
                {discoveryResult.success ? (
                  <CheckCircle2 className="h-4 w-4 text-[var(--status-recommended-fg)]" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-[var(--status-danger-fg)]" />
                )}
                {discoveryResult.success ? "Pipeline Run Completed" : "Pipeline Run Failed"}
              </span>
              {discoveryResult.success && (
                <Link
                  to="/inbox"
                  className="inline-flex items-center gap-1 font-semibold text-xs text-[var(--border-focus)] hover:underline"
                >
                  <Inbox className="h-3.5 w-3.5" />
                  <span>Review in Inbox →</span>
                </Link>
              )}
            </div>

            {discoveryResult.success && (
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
                  <span className="text-[10px] text-[var(--text-muted)] block">JEV Evaluated / Rec</span>
                  <span className="text-sm font-bold text-[var(--status-recommended-fg)]">
                    {discoveryResult.recommendedCount ?? 0}
                  </span>
                </div>
              </div>
            )}

            {discoveryResult.error && (
              <p className="text-[11px] text-[var(--status-danger-fg)]">{discoveryResult.error}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
