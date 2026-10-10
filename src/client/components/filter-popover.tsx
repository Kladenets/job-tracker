import React from "react";
import { Filter, X, Check } from "lucide-react";
import { InboxFilterCriteria } from "../inbox-filtering";

export type FilterCriteria = InboxFilterCriteria;

interface FilterPopoverProps {
  criteria: FilterCriteria;
  onChange: (criteria: FilterCriteria) => void;
  availableSources: string[];
  isOpen: boolean;
  onClose: () => void;
  onReset: () => void;
}

export function FilterPopover({
  criteria,
  onChange,
  availableSources,
  isOpen,
  onClose,
  onReset,
}: FilterPopoverProps) {
  if (!isOpen) return null;

  return (
    <div
      id="inbox-filter-popover"
      data-testid="filter-popover"
      role="dialog"
      aria-labelledby="filter-popover-title"
      className="absolute right-0 top-full mt-2 w-72 sm:w-80 rounded-lg border border-[var(--border-strong)] bg-[var(--surface-elevated)] shadow-xl z-50 p-3.5 space-y-3.5 text-xs text-[var(--text-primary)]"
    >
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2">
        <div className="flex items-center gap-1.5 font-bold">
          <Filter className="h-3.5 w-3.5 text-[var(--border-focus)]" />
          <span id="filter-popover-title">Advanced Criteria</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close filters"
          className="p-1 rounded hover:bg-[var(--surface-sunken)] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Workplace Type */}
      <div className="space-y-1.5">
        <label className="font-semibold text-[11px] text-[var(--text-secondary)] block">
          Workplace Type
        </label>
        <div className="grid grid-cols-4 gap-1">
          {(["all", "remote", "hybrid", "onsite"] as const).map((type) => {
            const isSelected = criteria.workplaceType === type;
            return (
              <button
                key={type}
                type="button"
                onClick={() => onChange({ ...criteria, workplaceType: type })}
                className={`py-1 px-1.5 text-center capitalize rounded border text-[11px] font-medium transition-colors cursor-pointer ${
                  isSelected
                    ? "border-[var(--action-primary-bg)] bg-[var(--action-primary-bg)] text-white font-semibold"
                    : "border-[var(--border-subtle)] bg-[var(--surface-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
                }`}
              >
                {type}
              </button>
            );
          })}
        </div>
      </div>

      {/* Source Adapter Filter */}
      {availableSources.length > 0 && (
        <div className="space-y-1.5">
          <label className="font-semibold text-[11px] text-[var(--text-secondary)] block">
            Source Origin
          </label>
          <select
            aria-label="Source origin"
            value={criteria.source}
            onChange={(e) => onChange({ ...criteria, source: e.target.value })}
            className="w-full px-2 py-1.5 rounded border border-[var(--border-subtle)] bg-[var(--surface-base)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-focus)] cursor-pointer"
          >
            <option value="all">All Sources</option>
            {availableSources.map((src) => (
              <option key={src} value={src}>
                {src.charAt(0).toUpperCase() + src.slice(1)}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Checkboxes: Data Gaps */}
      <div className="space-y-2 pt-1 border-t border-[var(--border-subtle)]">
        <span className="font-semibold text-[11px] text-[var(--text-secondary)] block">
          Exclude Data Gaps
        </span>
        <label className="flex items-center gap-2 cursor-pointer text-xs select-none">
          <input
            type="checkbox"
            checked={criteria.missingSalary}
            onChange={(e) => onChange({ ...criteria, missingSalary: e.target.checked })}
            className="rounded border-[var(--border-subtle)] text-[var(--border-focus)] focus:ring-0 cursor-pointer"
          />
          <span className="text-[var(--text-secondary)]">Hide missing salary postings</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer text-xs select-none">
          <input
            type="checkbox"
            checked={criteria.missingLocation}
            onChange={(e) => onChange({ ...criteria, missingLocation: e.target.checked })}
            className="rounded border-[var(--border-subtle)] text-[var(--border-focus)] focus:ring-0 cursor-pointer"
          />
          <span className="text-[var(--text-secondary)]">Hide unverified locations</span>
        </label>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-2 border-t border-[var(--border-subtle)]">
        <button
          type="button"
          onClick={onReset}
          className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] underline cursor-pointer"
        >
          Reset filters
        </button>
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1 rounded bg-[var(--action-primary-bg)] text-white text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer shadow-2xs"
        >
          Done
        </button>
      </div>
    </div>
  );
}
