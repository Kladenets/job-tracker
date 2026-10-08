import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { ArrowLeft, ExternalLink, MapPin, Sparkles } from "lucide-react";
import { UnifiedJobPosting } from "../../types/job-posting";
import { useAIDockStore } from "../shell/ai-dock-store";

type JobDetail = Pick<UnifiedJobPosting, "id" | "title" | "company" | "source" | "description_text"> &
  Partial<UnifiedJobPosting>;

export function JobDetailPage() {
  const { id } = useParams({ from: "/jobs/$id" });
  const askAboutJob = useAIDockStore((state) => state.askAboutJob);
  const { data, isLoading, isError, error, refetch } = useQuery<{ success: boolean; job: JobDetail }>({
    queryKey: ["job", id],
    queryFn: async () => {
      const response = await fetch(`/api/jobs/${encodeURIComponent(id)}`);
      if (!response.ok) {
        throw new Error(response.status === 404 ? "Job posting not found." : `Could not load job (HTTP ${response.status}).`);
      }
      return response.json();
    },
  });

  if (isLoading) {
    return (
      <div className="p-6 max-w-5xl mx-auto w-full space-y-4" aria-label="Loading job details">
        <div className="h-5 w-40 rounded bg-[var(--surface-sunken)] animate-pulse" />
        <div className="h-10 w-3/4 rounded bg-[var(--surface-sunken)] animate-pulse" />
        <div className="h-64 rounded border border-[var(--border-subtle)] bg-[var(--surface-elevated)] animate-pulse" />
      </div>
    );
  }

  if (isError || !data?.job) {
    const message = error instanceof Error ? error.message : "Could not load job details.";
    const isNotFound = message === "Job posting not found.";
    return (
      <div className="p-6 max-w-3xl mx-auto w-full space-y-4" role="alert">
        <Link to="/inbox" className="inline-flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
          <ArrowLeft className="h-4 w-4" /> Back to Inbox
        </Link>
        <h1 className="text-lg font-bold text-[var(--text-primary)]">
          {isNotFound ? "Job not found" : "Unable to load job"}
        </h1>
        <p className="text-sm text-[var(--text-secondary)]">{message}</p>
        {!isNotFound && (
          <button type="button" onClick={() => refetch()} className="rounded border border-[var(--border-subtle)] px-3 py-2 text-sm">
            Retry
          </button>
        )}
      </div>
    );
  }

  const job = data.job;
  const applicationUrl = job.application_url || job.canonical_url || job.source_url;
  const salary = job.salary_min_annual != null || job.salary_max_annual != null
    ? [job.salary_min_annual, job.salary_max_annual]
        .filter((value): value is number => value != null)
        .map((value) => new Intl.NumberFormat(undefined, { style: "currency", currency: job.currency || "USD", maximumFractionDigits: 0 }).format(value))
        .join(" - ")
    : job.raw_salary_text || "Not listed";

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto w-full space-y-6">
      <Link to="/inbox" className="inline-flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
        <ArrowLeft className="h-4 w-4" /> Back to Inbox
      </Link>

      <header className="space-y-4 border-b border-[var(--border-subtle)] pb-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-2">
            <p className="text-xs uppercase text-[var(--text-muted)]">{job.source}</p>
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">{job.title}</h1>
            <p className="text-base text-[var(--text-secondary)]">{job.company}</p>
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-[var(--text-secondary)]">
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-4 w-4" /> {job.location || "Location not listed"}
              </span>
              <span>{salary}</span>
              <span className="capitalize">{job.workplace_type || "Workplace not specified"}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <button
              type="button"
              onClick={() => askAboutJob({
                id: job.id,
                title: job.title,
                company: job.company,
                location: job.location,
                salary: job.raw_salary_text || salary,
              })}
              className="inline-flex items-center gap-2 rounded-md border border-[var(--border-subtle)] px-3 py-2 text-sm font-semibold"
            >
              <Sparkles className="h-4 w-4" /> Ask AI
            </button>
            {applicationUrl && (
              <a href={applicationUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-md bg-[var(--border-focus)] px-3 py-2 text-sm font-semibold text-white">
                Apply Now <ExternalLink className="h-4 w-4" />
              </a>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-muted)]">
          <span>Discovered: {job.date_discovered ? new Date(job.date_discovered).toLocaleDateString() : "Unknown"}</span>
          <span>Availability: {job.availability || "Unknown"}</span>
          {job.last_checked_at && <span>Last checked: {new Date(job.last_checked_at).toLocaleString()}</span>}
          {job.source_url && <a href={job.source_url} target="_blank" rel="noopener noreferrer" className="underline">Original posting</a>}
        </div>
      </header>

      {job.jev_fit !== undefined && job.jev_fit !== null && (
        <section className="rounded-md border border-[var(--border-subtle)] p-4 space-y-2">
          <h2 className="font-semibold text-[var(--text-primary)]">Automated screening</h2>
          <p className="text-sm text-[var(--text-secondary)]">
            {job.jev_fit ? "Passed JEV qualification" : "Did not pass JEV qualification"}
            {job.jev_confidence != null && ` · ${Math.round(job.jev_confidence * 100)}% confidence`}
          </p>
          {job.ai_analysis?.rationale && <p className="text-sm text-[var(--text-secondary)]">{job.ai_analysis.rationale}</p>}
        </section>
      )}

      {job.crawler_data?.matched_rules && job.crawler_data.matched_rules.length > 0 && (
        <details className="rounded-md border border-[var(--border-subtle)] p-4">
          <summary className="cursor-pointer font-semibold text-[var(--text-primary)]">Filter and extraction evidence</summary>
          <ul className="mt-3 space-y-2 text-sm">
            {job.crawler_data.matched_rules.map((rule, index) => (
              <li key={`${rule.rule_id}-${index}`} className="text-[var(--text-secondary)]">
                <strong>{rule.rule_id}</strong>: {rule.passed ? "passed" : "failed"}{rule.evidence ? ` · ${rule.evidence}` : ""}
              </li>
            ))}
          </ul>
        </details>
      )}

      <section className="rounded-md border border-[var(--border-subtle)] p-4 md:p-6">
        <h2 className="mb-4 text-lg font-semibold text-[var(--text-primary)]">Job description</h2>
        <div className="whitespace-pre-wrap break-words text-sm leading-7 text-[var(--text-secondary)]">
          {job.description_text || "No description was provided."}
        </div>
      </section>
    </div>
  );
}