import React from "react";
import { Info, HelpCircle } from "lucide-react";

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  formula?: string;
  status?: "default" | "recommended" | "marginal" | "danger";
  isPercentage?: boolean;
  rateNumerator?: number;
  rateDenominator?: number;
  isSmallSample?: boolean;
}

export function MetricCard({
  title,
  value,
  subtitle,
  formula,
  status = "default",
  isPercentage = false,
  rateNumerator,
  rateDenominator,
  isSmallSample = false,
}: MetricCardProps) {
  const getStatusColor = () => {
    switch (status) {
      case "recommended":
        return "text-[var(--status-recommended-fg)]";
      case "marginal":
        return "text-[var(--status-marginal-fg)]";
      case "danger":
        return "text-[var(--status-danger-fg)]";
      default:
        return "text-[var(--text-primary)]";
    }
  };

  return (
    <div className="@container group relative p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] space-y-2 shadow-xs hover:border-[var(--border-focus)]/50 transition-colors">
      <div className="flex items-center justify-between gap-1.5">
        <span className="text-xs font-semibold text-[var(--text-muted)] truncate">{title}</span>
        {formula && (
          <div className="relative group/tooltip">
            <button
              type="button"
              aria-label={`Formula for ${title}`}
              className="p-0.5 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-help"
            >
              <HelpCircle className="h-3.5 w-3.5" />
            </button>
            <div className="absolute right-0 top-6 z-20 hidden group-hover/tooltip:block w-60 p-2.5 rounded-md bg-[var(--surface-overlay)] border border-[var(--border-subtle)] text-[10px] text-[var(--text-secondary)] shadow-lg leading-relaxed pointer-events-none">
              <span className="font-semibold text-[var(--text-primary)] block pb-0.5">Exact Formula:</span>
              <p className="font-mono text-[9.5px] text-[var(--text-secondary)]">{formula}</p>
              {rateNumerator !== undefined && rateDenominator !== undefined && (
                <div className="pt-1.5 mt-1.5 border-t border-[var(--border-subtle)] font-mono-tabular text-[var(--text-muted)] flex items-center justify-between">
                  <span>Current sample:</span>
                  <span className="font-semibold text-[var(--text-primary)]">
                    {rateNumerator} / {rateDenominator} applied
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex items-baseline gap-2">
        <p className={`text-2xl @[16rem]:text-3xl font-mono-tabular font-bold tracking-tight ${getStatusColor()}`}>
          {value}
          {isPercentage && typeof value === "number" && "%"}
        </p>
        {rateNumerator !== undefined && rateDenominator !== undefined && (
          <span className="text-[11px] font-mono-tabular text-[var(--text-muted)]">
            ({rateNumerator} / {rateDenominator})
          </span>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 pt-1 border-t border-[var(--border-subtle)] text-[10px]">
        {subtitle && (
          <span className="text-[var(--text-secondary)] font-mono-tabular truncate">{subtitle}</span>
        )}
        {isSmallSample && (
          <span
            title="Early Signal: Small sample size (N < 10 applications submitted)"
            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-[var(--status-marginal-bg)] text-[var(--status-marginal-fg)] border border-[var(--status-marginal-fg)]/20 font-semibold font-mono-tabular whitespace-nowrap cursor-help"
          >
            N &lt; 10
          </span>
        )}
      </div>
    </div>
  );
}
