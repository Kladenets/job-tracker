import React from "react";
import { Application, ApplicationStatus, UnifiedJobPosting } from "../../types/job-posting";
import {
  Building2,
  ExternalLink,
  Calendar,
  Clock,
  ChevronRight,
  AlertTriangle,
  Sparkles,
} from "lucide-react";

interface ApplicationTableProps {
  applications: Application[];
  jobsMap: Map<string, UnifiedJobPosting>;
  onSelectApplication: (app: Application) => void;
  onStageChange: (appId: string, newStage: ApplicationStatus) => void;
  onAskAI: (job: UnifiedJobPosting) => void;
}

const STAGE_LABELS: Record<string, { label: string; colorClass: string }> = {
  preparing: { label: "Preparing", colorClass: "bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/20" },
  applied: { label: "Applied", colorClass: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20" },
  recruiter_screen: { label: "Recruiter Screen", colorClass: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20" },
  interviewing: { label: "Interviewing", colorClass: "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20" },
  assessment: { label: "Assessment", colorClass: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/20" },
  offer: { label: "Offer", colorClass: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20" },
  accepted: { label: "Accepted", colorClass: "bg-emerald-600/15 text-emerald-800 dark:text-emerald-200 border-emerald-600/30" },
  rejected: { label: "Rejected", colorClass: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20" },
  withdrawn: { label: "Withdrawn", colorClass: "bg-zinc-500/10 text-zinc-700 dark:text-zinc-300 border-zinc-500/20" },
  inactive: { label: "Inactive", colorClass: "bg-zinc-500/10 text-zinc-700 dark:text-zinc-300 border-zinc-500/20" },
};

export function ApplicationTable({
  applications,
  jobsMap,
  onSelectApplication,
  onStageChange,
  onAskAI,
}: ApplicationTableProps) {
  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-base)] shadow-xs overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
              <th className="py-3 px-4">Role & Company</th>
              <th className="py-3 px-3">Stage</th>
              <th className="py-3 px-3">Date Applied</th>
              <th className="py-3 px-3">Next Action</th>
              <th className="py-3 px-3">Notes</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)] text-xs">
            {applications.map((app) => {
              const job = jobsMap.get(app.job_posting_id) || null;
              const stageBadge = STAGE_LABELS[app.status] || {
                label: app.status,
                colorClass: "bg-zinc-500/10 text-zinc-700 border-zinc-500/20",
              };

              // Compute deadline urgency
              let deadlineText: React.ReactNode = "None set";
              if (app.next_action_date) {
                const dueDate = new Date(app.next_action_date).getTime();
                const diffDays = Math.ceil((dueDate - Date.now()) / (1000 * 60 * 60 * 24));
                if (diffDays < 0) {
                  deadlineText = (
                    <span className="inline-flex items-center gap-1 text-[var(--status-danger-fg)] font-semibold font-mono-tabular">
                      <AlertTriangle className="h-3 w-3" />
                      <span>Overdue ({Math.abs(diffDays)}d)</span>
                    </span>
                  );
                } else if (diffDays <= 2) {
                  deadlineText = (
                    <span className="inline-flex items-center gap-1 text-[var(--status-marginal-fg)] font-semibold font-mono-tabular">
                      <Clock className="h-3 w-3" />
                      <span>{diffDays === 0 ? "Due today" : `Due in ${diffDays}d`}</span>
                    </span>
                  );
                } else {
                  deadlineText = (
                    <span className="text-[var(--text-secondary)] font-mono-tabular">
                      {new Date(app.next_action_date).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  );
                }
              }

              return (
                <tr
                  key={app.id}
                  onClick={() => onSelectApplication(app)}
                  className="hover:bg-[var(--surface-elevated)] transition-colors cursor-pointer group"
                >
                  {/* Role & Company */}
                  <td className="py-3 px-4">
                    <div className="space-y-0.5 max-w-xs">
                      <p className="font-bold text-[var(--text-primary)] group-hover:text-[var(--border-focus)] transition-colors truncate">
                        {job?.title || "Role Title"}
                      </p>
                      <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)] truncate">
                        <Building2 className="h-3 w-3 shrink-0" />
                        <span className="truncate">{job?.company || "Company"}</span>
                        {job?.location && <span>· {job.location}</span>}
                      </div>
                    </div>
                  </td>

                  {/* Stage Dropdown */}
                  <td className="py-3 px-3" onClick={(e) => e.stopPropagation()}>
                    <select
                      value={app.status}
                      onChange={(e) => onStageChange(app.id, e.target.value as ApplicationStatus)}
                      aria-label="Change stage"
                      className={`h-7 px-2 rounded-md border text-[11px] font-semibold transition-colors cursor-pointer ${stageBadge.colorClass}`}
                    >
                      {Object.entries(STAGE_LABELS).map(([key, val]) => (
                        <option key={key} value={key}>
                          {val.label}
                        </option>
                      ))}
                    </select>
                  </td>

                  {/* Date Applied */}
                  <td className="py-3 px-3 text-[11px] font-mono-tabular text-[var(--text-muted)]">
                    {app.applied_at
                      ? new Date(app.applied_at).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })
                      : "—"}
                  </td>

                  {/* Next Action Deadline */}
                  <td className="py-3 px-3 text-[11px] font-mono-tabular">
                    {deadlineText}
                  </td>

                  {/* Notes snippet */}
                  <td className="py-3 px-3 max-w-xs">
                    <p className="text-[11px] text-[var(--text-secondary)] truncate">
                      {app.user_notes || "—"}
                    </p>
                  </td>

                  {/* Row Actions */}
                  <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      {app.application_url && (
                        <a
                          href={app.application_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Open application link"
                          className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}

                      {job && (
                        <button
                          type="button"
                          onClick={() => onAskAI(job)}
                          title="Ask AI about interview prep"
                          className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--border-focus)] hover:bg-[var(--surface-sunken)] transition-colors cursor-pointer"
                        >
                          <Sparkles className="h-3.5 w-3.5" />
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => onSelectApplication(app)}
                        title="View details drawer"
                        className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors cursor-pointer"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
