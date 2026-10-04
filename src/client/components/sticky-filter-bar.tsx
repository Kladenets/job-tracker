import React from "react";
import { Search, ArrowUpDown, SlidersHorizontal, RefreshCw, X } from "lucide-react";
import { AITopBarButton } from "./ai-topbar-button";

interface FilterBarProps {
  itemCount?: number;
  totalCount?: number;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  showSearch?: boolean;
  activeSegment: string;
  onSegmentChange: (segment: string) => void;
  segments?: { id: string; label: string; count?: number }[];
  sortValue?: string;
  onSortChange?: (sort: string) => void;
  sortOptions?: { id: string; label: string }[];
  filterCount?: number;
  onToggleFilters?: () => void;
  showAIButton?: boolean;
  onSync?: () => void;
  isSyncing?: boolean;
  rightControls?: React.ReactNode;
}

export function StickyFilterBar({
  itemCount,
  totalCount,
  searchValue = "",
  onSearchChange,
  searchPlaceholder = "Search roles, companies, tech stack...",
  showSearch = true,
  activeSegment,
  onSegmentChange,
  segments = [
    { id: "all", label: "All Active" },
    { id: "recommended", label: "High Fit (≥70%)" },
    { id: "marginal", label: "Marginal" },
    { id: "saved", label: "Saved" },
    { id: "dismissed", label: "Dismissed" },
  ],
  sortValue,
  onSortChange,
  sortOptions,
  filterCount = 0,
  onToggleFilters,
  showAIButton = true,
  onSync,
  isSyncing = false,
  rightControls,
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
    <div
      data-testid="sticky-filter-bar"
      className="sticky top-0 z-10 w-full border-b border-[var(--border-subtle)] bg-[var(--surface-base)]/90 backdrop-blur-md px-3 md:px-5 py-2 space-y-2 shrink-0 transition-all"
    >
      {/* ========================================================================= */}
      {/* ROW 1: FULL-WIDTH SEARCH & SYSTEM CONTROLS (Only when search enabled)     */}
      {/* ========================================================================= */}
      {showSearch && (
        <div className="flex items-center justify-between gap-2 md:gap-3 w-full">
          {/* Search Bar - Expands to available space if enabled */}
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-muted)] pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchValue}
              onChange={(e) => onSearchChange?.(e.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              className="w-full pl-8.5 pr-14 py-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--border-focus)] transition-colors h-8.5 md:h-9"
            />
            {searchValue ? (
              <button
                type="button"
                onClick={() => onSearchChange?.("")}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : (
              <kbd className="hidden sm:inline-block absolute right-2.5 top-1/2 -translate-y-1/2 px-1.5 py-0.2 rounded bg-[var(--surface-sunken)] border border-[var(--border-subtle)] text-[10px] font-mono-tabular text-[var(--text-muted)] pointer-events-none">
                /
              </kbd>
            )}
          </div>

          {/* Live Counter Badge */}
          {itemCount !== undefined && totalCount !== undefined && (
            <span className="text-xs font-mono-tabular text-[var(--text-muted)] whitespace-nowrap shrink-0 hidden sm:inline-block">
              Showing <span className="font-semibold text-[var(--text-primary)]">{itemCount}</span> of {totalCount}
            </span>
          )}

          {/* Optional custom right controls */}
          {rightControls}

          {/* Sync Crawlers Trigger */}
          {onSync && (
            <button
              type="button"
              onClick={onSync}
              disabled={isSyncing}
              title="Crawl source job boards for fresh postings"
              aria-label="Crawl source job boards"
              className="inline-flex items-center justify-center gap-1.5 h-8.5 md:h-9 px-2.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 shrink-0"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? "animate-spin text-[var(--border-focus)]" : ""}`} />
              <span className="hidden md:inline">{isSyncing ? "Syncing..." : "Sync"}</span>
            </button>
          )}

          {/* AI Assistant Button (Only visible when AI dock is collapsed) */}
          {showAIButton && (
            <div className="shrink-0 hidden sm:block">
              <AITopBarButton />
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* ROW 2: TOUCH-SCROLLABLE PRESET TOGGLES & ADVANCED CRITERIA / SORT        */}
      {/* ========================================================================= */}
      <div className="flex items-center justify-between gap-2 w-full pt-0.5">
        {/* Left Side: Smooth Touch-Scrollable Segment Toggle Chips */}
        <div className="relative flex-1 min-w-0 overflow-hidden">
          <div
            role="tablist"
            aria-label="Filter presets"
            className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none scroll-smooth touch-pan-x"
            style={{
              scrollbarWidth: "none",
              msOverflowStyle: "none",
              WebkitOverflowScrolling: "touch",
            }}
          >
            {segments.map((seg) => {
              const isSelected = activeSegment === seg.id;
              return (
                <button
                  key={seg.id}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  onClick={() => onSegmentChange(seg.id)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-all cursor-pointer shrink-0 border select-none ${
                    isSelected
                      ? "bg-[var(--border-focus)] text-white border-[var(--border-focus)] shadow-2xs font-semibold"
                      : "bg-[var(--surface-elevated)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]"
                  }`}
                >
                  <span>{seg.label}</span>
                  {seg.count !== undefined && (
                    <span
                      className={`ml-1.5 px-1 py-0.2 rounded-full text-[10px] font-mono-tabular ${
                        isSelected ? "bg-white/20 text-white" : "bg-[var(--surface-sunken)] text-[var(--text-muted)]"
                      }`}
                    >
                      {seg.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Side: Controls when !showSearch, Filters Popover Trigger & Sort Dropdown */}
        {((!showSearch && (rightControls || onSync || showAIButton)) || onToggleFilters || (sortOptions && sortOptions.length > 0)) && (
          <div className="flex items-center gap-1.5 shrink-0 pl-1.5 border-l border-[var(--border-subtle)]">
            {!showSearch && rightControls}

            {!showSearch && onSync && (
              <button
                type="button"
                onClick={onSync}
                disabled={isSyncing}
                title="Crawl source job boards for fresh postings"
                aria-label="Crawl source job boards"
                className="inline-flex items-center justify-center gap-1.5 h-8.5 md:h-9 px-2.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 shrink-0"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? "animate-spin text-[var(--border-focus)]" : ""}`} />
                <span className="hidden md:inline">{isSyncing ? "Syncing..." : "Sync"}</span>
              </button>
            )}

            {!showSearch && showAIButton && (
              <div className="shrink-0 hidden sm:block">
                <AITopBarButton />
              </div>
            )}

            {/* Advanced Filter Popover Trigger */}
            {onToggleFilters && (
              <button
                type="button"
                onClick={onToggleFilters}
                aria-label="Open advanced filters popover"
                className={`inline-flex items-center gap-1 h-7.5 px-2 rounded-md border text-xs font-semibold transition-colors cursor-pointer ${
                  filterCount > 0
                    ? "border-[var(--border-focus)] bg-[var(--surface-sunken)] text-[var(--border-focus)]"
                    : "border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]"
                }`}
              >
                <SlidersHorizontal className="h-3 w-3" />
                <span className="hidden sm:inline">Filters</span>
                {filterCount > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full bg-[var(--border-focus)] text-white text-[10px] font-mono-tabular font-bold">
                    {filterCount}
                  </span>
                )}
              </button>
            )}

            {/* Sort Select (Only rendered if sortOptions is provided) */}
            {sortOptions && sortOptions.length > 0 && onSortChange && (
              <div className="relative shrink-0">
                <select
                  value={sortValue}
                  onChange={(e) => onSortChange(e.target.value)}
                  aria-label="Sort list"
                  className="pl-2 pr-6 h-7.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] focus:outline-none focus:border-[var(--border-focus)] transition-colors cursor-pointer appearance-none"
                >
                  {sortOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <ArrowUpDown className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-[var(--text-muted)]" />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
