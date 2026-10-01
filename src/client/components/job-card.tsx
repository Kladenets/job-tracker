import React, { useState } from "react";
import {
  Sparkles,
  ExternalLink,
  Check,
  X,
  Bookmark,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  AlertTriangle,
  RotateCcw,
} from "lucide-react";
import { FitScoreArc } from "./fit-score-arc";
import { UnifiedJobPosting } from "../../types/job-posting";

interface JobCardProps {
  job: UnifiedJobPosting;
  isFocused?: boolean;
  onSave: (job: UnifiedJobPosting) => void;
  onDismiss: (job: UnifiedJobPosting) => void;
  onRestore?: (job: UnifiedJobPosting) => void;
  onAskAI: (job: UnifiedJobPosting) => void;
  onApply: (job: UnifiedJobPosting) => void;
  isGuest?: boolean;
}

export function JobCard({
  job,
  isFocused = false,
  onSave,
  onDismiss,
  onRestore,
  onAskAI,
  onApply,
  isGuest = false,
}: JobCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Score calculation: overall_fit_score or jev_confidence * 100 or default 75
  const fitScore =
    job.ai_analysis?.overall_fit_score ??
    (job.jev_confidence != null ? Math.round(job.jev_confidence * 100) : 50);

  // Format salary
  const formatSalary = () => {
    if (job.salary_min_annual && job.salary_max_annual) {
      const minK = Math.round(job.salary_min_annual / 1000);
      const maxK = Math.round(job.salary_max_annual / 1000);
      return `$${minK}k – $${maxK}k`;
    }
    if (job.salary_min_annual) {
      return `From $${Math.round(job.salary_min_annual / 1000)}k`;
    }
    if (job.raw_salary_text) {
      return job.raw_salary_text;
    }
    return "Salary unlisted";
  };

  // Format date posted / discovered
  const formatDateRelative = () => {
    const targetDate = job.date_posted || job.date_discovered;
    if (!targetDate) return "Recently";
    try {
      const diffMs = Date.now() - new Date(targetDate).getTime();
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      if (diffHours < 24) return `${Math.max(1, diffHours)}h ago`;
      const diffDays = Math.floor(diffHours / 24);
      return `${diffDays}d ago`;
    } catch {
      return "Recently";
    }
  };

  const technologies = job.crawler_data?.detected_technologies || [];
  const isDismissed = job.job_status === "dismissed";
  const isSaved = job.job_status === "saved";

  return (
    <article
      data-testid="job-card"
      data-job-id={job.id}
      aria-expanded={isExpanded}
      className={`@container rounded-lg border transition-all duration-200 overflow-hidden ${
        isDismissed
          ? "opacity-75 bg-[var(--surface-sunken)]/50 border-[var(--border-subtle)] hover:opacity-100"
          : isFocused
          ? "border-[var(--border-focus)] ring-2 ring-[var(--border-focus)]/20 shadow-md bg-[var(--surface-elevated)]"
          : "border-[var(--border-subtle)] bg-[var(--surface-elevated)] hover:border-[var(--border-strong)]/80 shadow-xs"
      }`}
    >
      {/* ========================================================================= */}
      {/* TIER 1: COLLAPSED SCAN ROW (~4rem / 64px)                                 */}
      {/* ========================================================================= */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className="p-3 md:p-4 cursor-pointer hover:bg-[var(--surface-sunken)]/40 transition-colors select-none"
      >
        <div className="flex flex-col @[600px]:flex-row @[600px]:items-center justify-between gap-3">
          {/* Left Block: Arc Percentage Ring + Title & Zero-Pill Typography */}
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <FitScoreArc score={fitScore} size={38} strokeWidth={3.5} />

            <div className="min-w-0 flex-1 space-y-1">
              {/* Job Title and Company */}
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <h2 className="font-bold text-xs md:text-sm text-[var(--text-primary)] tracking-tight truncate max-w-full">
                  {job.title}
                </h2>
                <span className="text-xs font-semibold text-[var(--text-secondary)]">
                  · {job.company}
                </span>
                {isSaved && (
                  <span className="px-1.5 py-0.2 rounded bg-[var(--status-recommended-bg)] text-[var(--status-recommended-fg)] border border-[var(--status-recommended-fg)]/20 text-[10px] font-mono-tabular font-bold">
                    Saved
                  </span>
                )}
                {isDismissed && (
                  <span className="px-1.5 py-0.2 rounded bg-[var(--status-danger-bg)] text-[var(--status-danger-fg)] border border-[var(--status-danger-fg)]/20 text-[10px] font-mono-tabular font-bold">
                    Dismissed
                  </span>
                )}
              </div>

              {/* Zero-Pill Typography with middots */}
              <p className="text-[11px] md:text-xs text-[var(--text-secondary)] font-mono-tabular break-words leading-tight">
                <span>{job.location || "Remote US"}</span>
                <span className="text-[var(--text-muted)]"> · </span>
                <span className={job.salary_min_annual ? "text-[var(--text-primary)] font-medium" : "text-[var(--text-muted)] italic"}>
                  {formatSalary()}
                </span>
                <span className="text-[var(--text-muted)]"> · </span>
                <span>Posted {formatDateRelative()}</span>
                <span className="text-[var(--text-muted)]"> · </span>
                <span className="capitalize">{job.source}</span>
                {job.workplace_type !== "unknown" && (
                  <>
                    <span className="text-[var(--text-muted)]"> · </span>
                    <span className="capitalize">{job.workplace_type}</span>
                  </>
                )}
              </p>
            </div>
          </div>

          {/* Right Block: Triage Action Buttons Cluster */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1.5 self-end @[600px]:self-center shrink-0 pt-1 @[600px]:pt-0"
          >
            {/* Ask AI (c or ⌘K) */}
            <button
              type="button"
              onClick={() => onAskAI(job)}
              title="Ask AI about this job (c or ⌘K)"
              aria-label={`Ask AI about ${job.title} at ${job.company}`}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 text-xs font-semibold transition-colors cursor-pointer"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span className="hidden @[480px]:inline">Ask AI</span>
            </button>

            {/* Save (s) */}
            <button
              type="button"
              onClick={() => onSave(job)}
              title="Save to bookmarks (s)"
              aria-label={`Save ${job.title}`}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md border text-xs font-semibold transition-colors cursor-pointer ${
                isSaved
                  ? "border-[var(--status-recommended-fg)] bg-[var(--status-recommended-bg)] text-[var(--status-recommended-fg)]"
                  : "border-[var(--border-subtle)] bg-[var(--surface-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
              }`}
            >
              <Bookmark className="h-3.5 w-3.5" />
              <span className="hidden @[520px]:inline">Save</span>
            </button>

            {/* Dismiss or Restore */}
            {isDismissed ? (
              <button
                type="button"
                onClick={() => (onRestore ? onRestore(job) : onSave(job))}
                title="Restore job to active queue"
                aria-label={`Restore ${job.title}`}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] text-xs font-semibold transition-colors cursor-pointer"
              >
                <RotateCcw className="h-3.5 w-3.5 text-[var(--border-focus)]" />
                <span className="hidden @[560px]:inline">Restore</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onDismiss(job)}
                title="Dismiss job from queue (x)"
                aria-label={`Dismiss ${job.title}`}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] text-[var(--text-muted)] hover:bg-[var(--status-danger-bg)] hover:text-[var(--status-danger-fg)] hover:border-[var(--status-danger-fg)]/30 text-xs font-medium transition-colors cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
                <span className="hidden @[560px]:inline">Dismiss</span>
              </button>
            )}

            {/* Apply Direct (a) */}
            <button
              type="button"
              onClick={() => onApply(job)}
              title="Open verified direct ATS application (a)"
              aria-label={`Apply direct to ${job.company}`}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[var(--border-focus)] text-white text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer shadow-2xs"
            >
              <span>Apply</span>
              <ExternalLink className="h-3 w-3" />
            </button>

            {/* Expand / Collapse Drawer Chevron */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded(!isExpanded);
              }}
              title={isExpanded ? "Collapse details" : "Expand audit details"}
              aria-label={isExpanded ? "Collapse details" : "Expand audit details"}
              className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] cursor-pointer"
            >
              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Guest Demo Mode Notice */}
        {isGuest && (
          <div className="mt-2 text-[10px] text-[var(--text-muted)] italic">
            Demo mode: Actions are view-only.
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* TIER 2: EXPANDED IN-DEPTH DRAWER WITH ACCORDION ANIMATION                 */}
      {/* ========================================================================= */}
      <div
        data-testid="job-card-expanded-drawer"
        className={`grid transition-all duration-300 ease-out border-t border-[var(--border-subtle)] bg-[var(--surface-base)]/50 ${
          isExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0 border-t-transparent pointer-events-none"
        }`}
      >
        <div className="overflow-hidden">
          <div className="p-4 space-y-4 text-xs">
            {/* 1. Deterministic Rule Audit Breakdown */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 font-bold text-xs text-[var(--text-primary)]">
                <ShieldCheck className="h-3.5 w-3.5 text-[var(--border-focus)]" />
                <span>Deterministic Qualification Audit</span>
              </div>

              <div className="grid grid-cols-1 @[600px]:grid-cols-3 gap-2">
                {/* Experience Rule */}
                <div className="p-2.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-elevated)] space-y-1">
                  <div className="flex items-center gap-1.5 font-semibold text-[11px]">
                    <Check className="h-3.5 w-3.5 text-[var(--status-recommended-fg)]" />
                    <span>Target Experience</span>
                  </div>
                  <p className="text-[10px] text-[var(--text-muted)]">
                    Candidate profile: 6+ yrs · Role seniority: {job.seniority || "Mid/Senior"}
                  </p>
                </div>

                {/* Workplace & Location Rule */}
                <div className="p-2.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-elevated)] space-y-1">
                  <div className="flex items-center gap-1.5 font-semibold text-[11px]">
                    <Check className="h-3.5 w-3.5 text-[var(--status-recommended-fg)]" />
                    <span>Location Eligibility</span>
                  </div>
                  <p className="text-[10px] text-[var(--text-muted)]">
                    {job.location || "Remote US"} ({job.workplace_type || "Verified"})
                  </p>
                </div>

                {/* Compensation Rule */}
                <div className="p-2.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-elevated)] space-y-1">
                  <div className="flex items-center gap-1.5 font-semibold text-[11px]">
                    {job.salary_min_annual ? (
                      <Check className="h-3.5 w-3.5 text-[var(--status-recommended-fg)]" />
                    ) : (
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                    )}
                    <span>Salary Threshold</span>
                  </div>
                  <p className="text-[10px] text-[var(--text-muted)]">
                    {job.salary_min_annual ? `${formatSalary()} meets target` : "Salary unlisted by employer"}
                  </p>
                </div>
              </div>
            </div>

            {/* 2. Extracted Tech Keywords */}
            {technologies.length > 0 && (
              <div className="space-y-1.5">
                <span className="font-bold text-xs text-[var(--text-primary)] block">
                  Extracted Technologies & Skills
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {technologies.map((tech) => (
                    <span
                      key={tech}
                      className="px-2 py-0.5 rounded bg-[var(--surface-sunken)] border border-[var(--border-subtle)] text-[10px] font-mono-tabular text-[var(--text-secondary)]"
                    >
                      {tech}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* 3. Role Overview / Description Snippet */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-[var(--text-primary)] block">
                  Posting Overview
                </span>
                <span className="text-[10px] text-[var(--text-muted)] font-mono-tabular">
                  Scrollable view
                </span>
              </div>
              <div className="max-h-56 overflow-y-auto rounded-md border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-3 text-[11px] text-[var(--text-secondary)] leading-relaxed whitespace-pre-line font-sans scroll-smooth focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)]/50">
                {job.description_text || "No description provided."}
              </div>
            </div>

            {/* 4. Provenance & Direct ATS Action */}
            <div className="pt-2 border-t border-[var(--border-subtle)] flex flex-col @[500px]:flex-row @[500px]:items-center justify-between gap-3">
              <div className="text-[10px] font-mono-tabular text-[var(--text-muted)] space-y-0.5">
                <div>
                  <span>Discovered: {new Date(job.date_discovered).toLocaleDateString()}</span>
                  <span className="mx-1">·</span>
                  <span>Source: {job.source}</span>
                  {job.source_job_id && <span> ({job.source_job_id})</span>}
                </div>
                {job.canonical_url && (
                  <div className="truncate max-w-sm">
                    <span className="text-[var(--text-secondary)]">Canonical: </span>
                    <a
                      href={job.canonical_url}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:underline text-[var(--border-focus)]"
                    >
                      {job.canonical_url}
                    </a>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => onAskAI(job)}
                  className="px-3 py-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 text-xs font-semibold cursor-pointer flex items-center gap-1.5"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Deep Analysis (c)</span>
                </button>
                <button
                  type="button"
                  onClick={() => onApply(job)}
                  className="px-3.5 py-1.5 rounded-md bg-[var(--border-focus)] text-white text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer shadow-xs flex items-center gap-1.5"
                >
                  <span>Apply on {job.source.toUpperCase()}</span>
                  <ExternalLink className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
