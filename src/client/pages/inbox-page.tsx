import React, { useState } from "react";
import { StickyFilterBar } from "../components/sticky-filter-bar";
import { Sparkles, ExternalLink, Bookmark, Check, ShieldAlert, Cpu } from "lucide-react";

export function InboxPage() {
  const [search, setSearch] = useState("");
  const [segment, setSegment] = useState("all");
  const [sort, setSort] = useState("fit_desc");

  return (
    <div className="flex-1 flex flex-col min-h-full">
      {/* Standard In-Page Sticky Filter Bar */}
      <StickyFilterBar
        itemCount={14}
        totalCount={42}
        searchValue={search}
        onSearchChange={setSearch}
        activeSegment={segment}
        onSegmentChange={setSegment}
        sortValue={sort}
        onSortChange={setSort}
      />

      {/* Page Content Viewport */}
      <div className="p-6 max-w-5xl mx-auto w-full space-y-4 flex-1">
        <div className="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)]">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Recommendation Inbox</h1>
            <p className="text-xs text-[var(--text-secondary)]">
              Curated postings discovered across ATS boards and aggregators, filtered by your candidate profile.
            </p>
          </div>
          <span className="text-xs font-mono-tabular px-2 py-1 rounded bg-[var(--surface-sunken)] border border-[var(--border-subtle)] text-[var(--text-secondary)]">
            Active Feed
          </span>
        </div>

        {/* Placeholder Job Card Mockup showcasing Tier 1 Scan Row */}
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-4 shadow-xs space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              {/* Circular SVG Arc Ring Mockup */}
              <div className="relative h-10 w-10 shrink-0 flex items-center justify-center rounded-full bg-[var(--status-recommended-bg)] text-[var(--status-recommended-fg)] font-mono-tabular font-bold text-xs border border-[var(--status-recommended-fg)]/20">
                87%
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-sm text-[var(--text-primary)]">
                    Senior Staff Distributed Systems Engineer
                  </h3>
                  <span className="text-xs text-[var(--text-muted)] font-normal">· Stripe</span>
                </div>
                {/* Zero-Pill Typography with middots */}
                <p className="text-xs text-[var(--text-secondary)] font-mono-tabular">
                  San Francisco, CA (Remote US) · $185k – $225k · Posted 2d ago · Greenhouse
                </p>
              </div>
            </div>

            {/* Quick Triage Buttons */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                className="px-2.5 py-1 rounded border border-[var(--border-subtle)] bg-[var(--surface-base)] text-xs font-medium hover:bg-[var(--surface-sunken)] transition-colors cursor-pointer"
              >
                Save (s)
              </button>
              <button
                type="button"
                className="px-2.5 py-1 rounded border border-[var(--border-subtle)] bg-[var(--surface-base)] text-xs font-medium hover:bg-[var(--status-danger-bg)] hover:text-[var(--status-danger-fg)] transition-colors cursor-pointer"
              >
                Dismiss (x)
              </button>
              <button
                type="button"
                className="px-2.5 py-1 rounded bg-[var(--border-focus)] text-white text-xs font-medium hover:opacity-90 transition-opacity cursor-pointer flex items-center gap-1"
              >
                <span>Apply</span>
                <ExternalLink className="h-3 w-3" />
              </button>
            </div>
          </div>

          <div className="pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between text-[11px] text-[var(--text-muted)]">
            <span>Deterministic Rules: ✅ Experience (6+ yrs) · ✅ Remote US · ⚠️ Salary range unlisted</span>
            <span className="font-mono-tabular">Press Space or click to expand full audit drawer</span>
          </div>
        </div>

        <div className="p-4 rounded-lg border border-dashed border-[var(--border-subtle)] text-center text-xs text-[var(--text-muted)]">
          Full recommendation queue and virtual list will be wired in Chunk 4.
        </div>
      </div>
    </div>
  );
}
