import React, { useState } from "react";
import { StickyFilterBar } from "../components/sticky-filter-bar";
import { KanbanSquare, ListFilter, Plus } from "lucide-react";

export function ApplicationsPage() {
  const [search, setSearch] = useState("");
  const [segment, setSegment] = useState("active");
  const [sort, setSort] = useState("date_desc");

  return (
    <div className="flex-1 flex flex-col min-h-full">
      <StickyFilterBar
        itemCount={5}
        totalCount={5}
        searchValue={search}
        onSearchChange={setSearch}
        activeSegment={segment}
        onSegmentChange={setSegment}
        segments={[
          { id: "active", label: "Active Pipeline" },
          { id: "archived", label: "Archived & Offers" },
        ]}
        sortValue={sort}
        onSortChange={setSort}
        sortOptions={[
          { id: "date_desc", label: "Most Recent Activity" },
          { id: "company_asc", label: "Company (A-Z)" },
        ]}
      />

      <div className="p-6 max-w-6xl mx-auto w-full space-y-4 flex-1">
        <div className="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)]">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Application Tracker</h1>
            <p className="text-xs text-[var(--text-secondary)]">
              Manage multi-stage interview lifecycles, next-action deadlines, and interview notes.
            </p>
          </div>
          <button
            type="button"
            className="px-3 py-1.5 rounded-md bg-[var(--border-focus)] text-white text-xs font-semibold hover:opacity-90 transition-opacity flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Application</span>
          </button>
        </div>

        {/* Stage Columns Preview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-2">
          {["Applied (2)", "Screening (1)", "Interviewing (2)", "Offer (0)"].map((col) => (
            <div
              key={col}
              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-3 space-y-3 min-h-[16rem]"
            >
              <div className="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)]">
                <span className="text-xs font-bold tracking-tight">{col}</span>
                <span className="h-2 w-2 rounded-full bg-[var(--border-focus)]" />
              </div>
              <div className="rounded border border-[var(--border-subtle)] bg-[var(--surface-base)] p-3 space-y-1.5 text-xs shadow-xs">
                <p className="font-bold text-[var(--text-primary)]">Backend Engineer</p>
                <p className="text-[var(--text-muted)]">Linear · Remote</p>
                <div className="flex items-center justify-between pt-2 border-t border-[var(--border-subtle)] text-[10px] font-mono-tabular">
                  <span className="text-[var(--status-marginal-fg)] font-semibold">Next: Recruiter call</span>
                  <span className="text-[var(--text-muted)]">Applied 3d ago</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="p-4 rounded-lg border border-dashed border-[var(--border-subtle)] text-center text-xs text-[var(--text-muted)]">
          Interactive drag-and-drop Kanban and table toggle will be wired in Chunk 5.
        </div>
      </div>
    </div>
  );
}
