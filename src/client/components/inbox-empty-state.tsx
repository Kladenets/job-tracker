import React from "react";
import { FilterX, CheckCircle2, Compass, RefreshCw, SlidersHorizontal } from "lucide-react";
import { Link } from "@tanstack/react-router";

export type InboxEmptyStateType = "filter_mismatch" | "inbox_zero" | "empty_database";

interface InboxEmptyStateProps {
  type: InboxEmptyStateType;
  onResetFilters?: () => void;
  onTriggerSync?: () => void;
  isSyncing?: boolean;
}

export function InboxEmptyState({
  type,
  onResetFilters,
  onTriggerSync,
  isSyncing = false,
}: InboxEmptyStateProps) {
  if (type === "filter_mismatch") {
    return (
      <div
        data-testid="empty-state-filter-mismatch"
        className="rounded-lg border border-dashed border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-8 md:p-12 text-center space-y-4 max-w-lg mx-auto my-6"
      >
        <div className="h-12 w-12 rounded-full bg-[var(--surface-sunken)] border border-[var(--border-subtle)] mx-auto flex items-center justify-center text-[var(--text-muted)]">
          <FilterX className="h-6 w-6 text-[var(--border-focus)]" />
        </div>
        <div className="space-y-1.5">
          <h3 className="text-sm md:text-base font-bold text-[var(--text-primary)]">
            No matching jobs found
          </h3>
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
            No active postings meet your search query or filter criteria. Try broadening your score threshold or workplace type.
          </p>
        </div>
        {onResetFilters && (
          <button
            type="button"
            onClick={onResetFilters}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-[var(--action-primary-bg)] text-white text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer shadow-xs"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span>Reset All Filters</span>
          </button>
        )}
      </div>
    );
  }

  if (type === "inbox_zero") {
    return (
      <div
        data-testid="empty-state-inbox-zero"
        className="rounded-lg border border-dashed border-[var(--status-recommended-fg)]/30 bg-[var(--status-recommended-bg)]/10 p-8 md:p-12 text-center space-y-4 max-w-lg mx-auto my-6"
      >
        <div className="h-12 w-12 rounded-full bg-[var(--status-recommended-bg)] border border-[var(--status-recommended-fg)]/30 mx-auto flex items-center justify-center text-[var(--status-recommended-fg)]">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <div className="space-y-1.5">
          <h3 className="text-sm md:text-base font-bold text-[var(--text-primary)]">
            You're all caught up!
          </h3>
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
            Zero unreviewed jobs remaining in your active recommendation queue. All discovered roles have been saved or triaged.
          </p>
        </div>
        {onTriggerSync && (
          <button
            type="button"
            onClick={onTriggerSync}
            disabled={isSyncing}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-[var(--action-primary-bg)] text-white text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer shadow-xs disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? "animate-spin" : ""}`} />
            <span>{isSyncing ? "Crawling Sources..." : "Run Discovery Now"}</span>
          </button>
        )}
      </div>
    );
  }

  // empty_database
  return (
    <div
      data-testid="empty-state-empty-database"
      className="rounded-lg border border-dashed border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-8 md:p-12 text-center space-y-4 max-w-lg mx-auto my-6"
    >
      <div className="h-12 w-12 rounded-full bg-[var(--surface-sunken)] border border-[var(--border-subtle)] mx-auto flex items-center justify-center text-[var(--text-muted)]">
        <Compass className="h-6 w-6 text-amber-500" />
      </div>
      <div className="space-y-1.5">
        <h3 className="text-sm md:text-base font-bold text-[var(--text-primary)]">
          No jobs in repository yet
        </h3>
        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
          No job boards or company ATS feeds have been crawled yet. Run discovery or configure your candidate search profile.
        </p>
      </div>
      <div className="flex items-center justify-center gap-2">
        {onTriggerSync && (
          <button
            type="button"
            onClick={onTriggerSync}
            disabled={isSyncing}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-[var(--action-primary-bg)] text-white text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer shadow-xs disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? "animate-spin" : ""}`} />
            <span>{isSyncing ? "Starting Discovery..." : "Run Discovery Now"}</span>
          </button>
        )}
        <Link
          to="/setup"
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xs font-semibold hover:bg-[var(--surface-sunken)] transition-colors cursor-pointer"
        >
          <span>Configure Setup</span>
        </Link>
      </div>
    </div>
  );
}
