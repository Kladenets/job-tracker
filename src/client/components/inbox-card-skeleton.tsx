import React from "react";

export function InboxCardSkeleton() {
  return (
    <div
      data-testid="job-card-skeleton"
      className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-3 md:p-4 animate-pulse space-y-3"
    >
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 md:gap-4">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          {/* 36px circular skeleton pulse matching FitScoreArc */}
          <div className="h-9 w-9 md:h-10 md:w-10 rounded-full bg-[var(--surface-sunken)] shrink-0" />
          <div className="space-y-2 flex-1 min-w-0">
            {/* Title bar */}
            <div className="h-4 bg-[var(--surface-sunken)] rounded-md w-3/4 max-w-md" />
            {/* Zero-pill metadata line */}
            <div className="h-3 bg-[var(--surface-sunken)] rounded-md w-1/2 max-w-xs" />
          </div>
        </div>

        {/* Action buttons placeholder */}
        <div className="flex items-center gap-1.5 self-end sm:self-start shrink-0">
          <div className="h-7 w-16 bg-[var(--surface-sunken)] rounded-md" />
          <div className="h-7 w-14 bg-[var(--surface-sunken)] rounded-md" />
          <div className="h-7 w-14 bg-[var(--surface-sunken)] rounded-md" />
          <div className="h-7 w-16 bg-[var(--surface-sunken)] rounded-md" />
        </div>
      </div>

      {/* Footer rule divider */}
      <div className="pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between">
        <div className="h-3 bg-[var(--surface-sunken)] rounded-md w-2/5" />
        <div className="h-3 bg-[var(--surface-sunken)] rounded-md w-1/5" />
      </div>
    </div>
  );
}
