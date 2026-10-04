import React from "react";
import { Globe, Building2, TrendingUp, CheckCircle, Send, ArrowUpRight } from "lucide-react";

export interface SourceMetric {
  discovered: number;
  recommended: number;
  applied: number;
  callbackCount: number;
  callbackRate: number;
}

interface SourceBreakdownTableProps {
  sources: Record<string, SourceMetric>;
}

const SOURCE_LABELS: Record<string, { label: string; icon: string }> = {
  greenhouse: { label: "Greenhouse ATS", icon: "greenhouse" },
  lever: { label: "Lever ATS", icon: "lever" },
  jobspy_indeed: { label: "Indeed (JobSpy)", icon: "indeed" },
  jobspy_linkedin: { label: "LinkedIn (JobSpy)", icon: "linkedin" },
  "jobspy/indeed": { label: "Indeed (JobSpy)", icon: "indeed" },
  "jobspy/linkedin": { label: "LinkedIn (JobSpy)", icon: "linkedin" },
  indeed: { label: "Indeed Direct", icon: "indeed" },
  linkedin: { label: "LinkedIn Direct", icon: "linkedin" },
  manual: { label: "Manual Direct Entry", icon: "manual" },
};

export function SourceBreakdownTable({ sources }: SourceBreakdownTableProps) {
  const entries = Object.entries(sources);

  if (entries.length === 0) {
    return (
      <div className="p-8 text-center border border-dashed rounded-xl border-[var(--border-subtle)] text-xs text-[var(--text-muted)]">
        No source-specific telemetry recorded for this timeframe.
      </div>
    );
  }

  // Calculate totals
  const totals = entries.reduce(
    (acc, [_, s]) => {
      acc.discovered += s.discovered;
      acc.recommended += s.recommended;
      acc.applied += s.applied;
      acc.callbackCount += s.callbackCount;
      return acc;
    },
    { discovered: 0, recommended: 0, applied: 0, callbackCount: 0 }
  );

  const totalCallbackRate =
    totals.applied > 0 ? Math.round((totals.callbackCount / totals.applied) * 100) : 0;

  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-base)] shadow-xs overflow-hidden">
      <div className="p-4 border-b border-[var(--border-subtle)] bg-[var(--surface-elevated)] flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-[var(--text-primary)]">
            Source Channel Effectiveness
          </h3>
          <p className="text-xs text-[var(--text-secondary)]">
            Ingestion yields, qualification rates, and interview callback ratios by ATS adapter.
          </p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-[var(--border-subtle)] bg-[var(--surface-elevated)]/50 text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider font-mono-tabular">
              <th className="py-2.5 px-4">Channel Origin</th>
              <th className="py-2.5 px-3 text-right">Discovered</th>
              <th className="py-2.5 px-3 text-right">High Fit / Rec</th>
              <th className="py-2.5 px-3 text-right">Yield Rate</th>
              <th className="py-2.5 px-3 text-right">Applied</th>
              <th className="py-2.5 px-4 text-right">Callback Rate</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)] text-xs font-mono-tabular">
            {entries.map(([srcKey, data]) => {
              const labelInfo = SOURCE_LABELS[srcKey] || {
                label: srcKey.charAt(0).toUpperCase() + srcKey.slice(1),
                icon: "generic",
              };
              const yieldRate =
                data.discovered > 0 ? Math.round((data.recommended / data.discovered) * 100) : 0;

              return (
                <tr
                  key={srcKey}
                  className="hover:bg-[var(--surface-elevated)] transition-colors group"
                >
                  <td className="py-3 px-4 font-sans">
                    <span className="font-semibold text-[var(--text-primary)]">
                      {labelInfo.label}
                    </span>
                    <span className="text-[10px] text-[var(--text-muted)] block font-mono">
                      source:{srcKey}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-right text-[var(--text-primary)] font-medium">
                    {data.discovered}
                  </td>
                  <td className="py-3 px-3 text-right text-[var(--status-recommended-fg)] font-medium">
                    {data.recommended}
                  </td>
                  <td className="py-3 px-3 text-right text-[var(--text-secondary)]">
                    {yieldRate}%
                  </td>
                  <td className="py-3 px-3 text-right text-[var(--text-primary)]">
                    {data.applied}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <span
                      className={`inline-flex items-center gap-1 font-bold ${
                        data.callbackRate >= 30
                          ? "text-[var(--status-recommended-fg)]"
                          : data.callbackRate > 0
                          ? "text-[var(--status-marginal-fg)]"
                          : "text-[var(--text-muted)]"
                      }`}
                    >
                      {data.callbackRate}%
                      {data.applied > 0 && (
                        <span className="text-[10px] text-[var(--text-muted)] font-normal">
                          ({data.callbackCount}/{data.applied})
                        </span>
                      )}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-[var(--border-subtle)] bg-[var(--surface-elevated)] font-bold text-xs font-mono-tabular">
              <td className="py-3 px-4 font-sans text-[var(--text-primary)]">
                Portfolio Summary
              </td>
              <td className="py-3 px-3 text-right text-[var(--text-primary)]">
                {totals.discovered}
              </td>
              <td className="py-3 px-3 text-right text-[var(--status-recommended-fg)]">
                {totals.recommended}
              </td>
              <td className="py-3 px-3 text-right text-[var(--text-secondary)]">
                {totals.discovered > 0 ? Math.round((totals.recommended / totals.discovered) * 100) : 0}%
              </td>
              <td className="py-3 px-3 text-right text-[var(--text-primary)]">
                {totals.applied}
              </td>
              <td className="py-3 px-4 text-right text-[var(--border-focus)]">
                {totalCallbackRate}% ({totals.callbackCount}/{totals.applied})
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
