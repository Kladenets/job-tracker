import React, { useState } from "react";
import { Filter, Search, ArrowUpDown, Check, SlidersHorizontal } from "lucide-react";

interface FilterBarProps {
  itemCount: number;
  totalCount: number;
  searchValue: string;
  onSearchChange: (value: string) => void;
  activeSegment: string;
  onSegmentChange: (segment: string) => void;
  segments?: { id: string; label: string }[];
  sortValue: string;
  onSortChange: (sort: string) => void;
  sortOptions?: { id: string; label: string }[];
  filterCount?: number;
  onToggleFilters?: () => void;
}

export function StickyFilterBar({
  itemCount,
  totalCount,
  searchValue,
  onSearchChange,
  activeSegment,
  onSegmentChange,
  segments = [
    { id: "all", label: "All" },
    { id: "recommended", label: "High Fit (≥70%)" },
    { id: "marginal", label: "Marginal" },
  ],
  sortValue,
  onSortChange,
  sortOptions = [
    { id: "fit_desc", label: "Highest Fit" },
    { id: "date_desc", label: "Newest Discovered" },
    { id: "salary_desc", label: "Salary" },
  ],
  filterCount = 0,
  onToggleFilters,
}: FilterBarProps) {
  const searchInputRef = React.useRef<HTMLInputElement>(null);

  // Focus search with '/' shortcut
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement !== searchInputRef.current) {
        const activeTag = document.activeElement?.tagName;
        if (activeTag !== "INPUT" && activeTag !== "TEXTAREA") {
          e.preventDefault();
          searchInputRef.current?.focus();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className="sticky top-0 z-10 w-full border-b border-[var(--border-subtle)] bg-[var(--surface-base)]/85 backdrop-blur-md px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 min-h-[3.25rem]">
      {/* Left: Search with / shortcut + Count badge */}
      <div className="flex items-center gap-3 flex-1 min-w-[14rem] max-w-md">
        <div className="relative w-full">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-muted)]" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search jobs, companies, skills..."
            className="w-full pl-8 pr-8 py-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--border-focus)] transition-colors"
          />
          <kbd className="absolute right-2 top-1/2 -translate-y-1/2 px-1.5 py-0.2 rounded bg-[var(--surface-sunken)] border border-[var(--border-subtle)] text-[10px] font-mono-tabular text-[var(--text-muted)]">
            /
          </kbd>
        </div>
        <span className="text-xs font-mono-tabular text-[var(--text-muted)] whitespace-nowrap">
          {itemCount} of {totalCount}
        </span>
      </div>

      {/* Center: Segmented Quick Toggles */}
      <div className="flex items-center rounded-md border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-0.5 text-xs">
        {segments.map((seg) => {
          const isSelected = activeSegment === seg.id;
          return (
            <button
              key={seg.id}
              type="button"
              onClick={() => onSegmentChange(seg.id)}
              className={`px-3 py-1 rounded-sm font-medium transition-colors cursor-pointer ${
                isSelected
                  ? "bg-[var(--surface-base)] text-[var(--text-primary)] shadow-xs font-semibold"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              {seg.label}
            </button>
          );
        })}
      </div>

      {/* Right: Filters & Sort Controls */}
      <div className="flex items-center gap-2">
        {onToggleFilters && (
          <button
            type="button"
            onClick={onToggleFilters}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-xs font-medium transition-colors cursor-pointer ${
              filterCount > 0
                ? "border-[var(--border-focus)] bg-[var(--surface-sunken)] text-[var(--border-focus)]"
                : "border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span>Filters</span>
            {filterCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-[var(--border-focus)] text-white text-[10px] font-mono-tabular font-bold">
                {filterCount}
              </span>
            )}
          </button>
        )}

        {/* Sort Select */}
        <div className="relative">
          <select
            value={sortValue}
            onChange={(e) => onSortChange(e.target.value)}
            className="pl-2.5 pr-7 py-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-focus)] transition-colors cursor-pointer appearance-none"
          >
            {sortOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
          <ArrowUpDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-muted)]" />
        </div>
      </div>
    </div>
  );
}
