import React, { useState } from "react";
import { StickyFilterBar } from "../components/sticky-filter-bar";
import { TrendingUp, Users, CheckCircle2, AlertTriangle } from "lucide-react";

export function DashboardPage() {
  const [search, setSearch] = useState("");
  const [segment, setSegment] = useState("30d");
  const [sort, setSort] = useState("default");

  return (
    <div className="flex-1 flex flex-col min-h-full">
      <StickyFilterBar
        itemCount={4}
        totalCount={4}
        searchValue={search}
        onSearchChange={setSearch}
        activeSegment={segment}
        onSegmentChange={setSegment}
        segments={[
          { id: "7d", label: "7 Days" },
          { id: "30d", label: "30 Days" },
          { id: "90d", label: "90 Days" },
          { id: "all", label: "All Time" },
        ]}
        sortValue={sort}
        onSortChange={setSort}
        sortOptions={[{ id: "default", label: "Standard View" }]}
      />

      <div className="p-6 max-w-5xl mx-auto w-full space-y-6 flex-1">
        <div className="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)]">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Metrics & Conversion Funnel</h1>
            <p className="text-xs text-[var(--text-secondary)]">
              Auditable discovery throughput, interview conversion rates, and small-sample data guards.
            </p>
          </div>
          <span className="text-xs font-mono-tabular px-2.5 py-1 rounded bg-[var(--status-marginal-bg)] text-[var(--status-marginal-fg)] border border-[var(--status-marginal-fg)]/20 font-semibold flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            Early Signal: N &lt; 10
          </span>
        </div>

        {/* Discovery Funnel Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Jobs Discovered", count: "128", sub: "Raw ingest" },
            { label: "Passed Filtering", count: "42", sub: "32.8% rate" },
            { label: "Jobs Saved", count: "14", sub: "Review queue" },
            { label: "Applications", count: "5", sub: "Submitted" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="p-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)] space-y-1 shadow-xs"
            >
              <span className="text-xs text-[var(--text-muted)] font-medium">{stat.label}</span>
              <p className="text-2xl font-mono-tabular font-bold text-[var(--text-primary)]">{stat.count}</p>
              <span className="text-[11px] font-mono-tabular text-[var(--text-secondary)]">{stat.sub}</span>
            </div>
          ))}
        </div>

        <div className="p-4 rounded-lg border border-dashed border-[var(--border-subtle)] text-center text-xs text-[var(--text-muted)]">
          Comprehensive conversion rate charts and source breakdown table will be wired in Chunk 6.
        </div>
      </div>
    </div>
  );
}
