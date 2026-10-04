import React from "react";
import { Application, ApplicationStatus, UnifiedJobPosting } from "../../types/job-posting";
import {
  Building2,
  Calendar,
  Clock,
  ExternalLink,
  FileText,
  AlertTriangle,
  ChevronRight,
  Sparkles,
} from "lucide-react";

interface ApplicationCardProps {
  application: Application;
  job?: UnifiedJobPosting | null;
  onClick: () => void;
  onAskAI?: () => void;
  onStageChange: (newStage: ApplicationStatus) => void;
  isDragging?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
}

const STAGE_LABELS: Record<string, string> = {
  preparing: "Preparing",
  applied: "Applied",
  recruiter_screen: "Recruiter Screen",
  interviewing: "Interviewing",
  assessment: "Assessment",
  offer: "Offer",
  accepted: "Accepted",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
  inactive: "Inactive",
};

export function ApplicationCard({
  application,
  job,
  onClick,
  onAskAI,
  onStageChange,
  isDragging = false,
  onDragStart,
  onDragEnd,
}: ApplicationCardProps) {
  // Compute relative days since applied
  const getAppliedRelativeText = () => {
    if (!application.applied_at) return "Not applied";
    const appliedTime = new Date(application.applied_at).getTime();
    const diffDays = Math.floor((Date.now() - appliedTime) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return "Applied today";
    if (diffDays === 1) return "Applied 1d ago";
    return `Applied ${diffDays}d ago`;
  };

  // Compute Next Action urgency
  const getNextActionStatus = () => {
    if (!application.next_action_date) return null;
    const dueDate = new Date(application.next_action_date).getTime();
    const now = Date.now();
    const diffDays = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return {
        text: `Overdue (${Math.abs(diffDays)}d)`,
        urgency: "overdue",
        colorClass: "text-[var(--status-danger-fg)] bg-[var(--status-danger-bg)] border-[var(--status-danger-fg)]/20",
      };
    } else if (diffDays <= 2) {
      return {
        text: diffDays === 0 ? "Due today" : `Due in ${diffDays}d`,
        urgency: "soon",
        colorClass: "text-[var(--status-marginal-fg)] bg-[var(--status-marginal-bg)] border-[var(--status-marginal-fg)]/20",
      };
    } else {
      return {
        text: `Due ${new Date(application.next_action_date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`,
        urgency: "normal",
        colorClass: "text-[var(--text-secondary)] bg-[var(--surface-sunken)] border-[var(--border-subtle)]",
      };
    }
  };

  const nextAction = getNextActionStatus();

  return (
    <div
      role="article"
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`@container group relative rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-base)] p-3.5 space-y-2.5 shadow-xs hover:shadow-md hover:border-[var(--border-focus)]/50 transition-all spring-transition cursor-grab active:cursor-grabbing ${
        isDragging ? "opacity-40 scale-95 border-dashed border-[var(--border-focus)]" : ""
      }`}
    >
      {/* Top Header: Company, Title & Direct Link */}
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-0.5 min-w-0 flex-1 cursor-pointer" onClick={onClick}>
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--text-secondary)] truncate">
            <Building2 className="h-3 w-3 text-[var(--text-muted)] shrink-0" />
            <span className="truncate">{job?.company || "Company"}</span>
          </div>
          <h4 className="text-xs font-bold text-[var(--text-primary)] group-hover:text-[var(--border-focus)] transition-colors truncate">
            {job?.title || "Role Title"}
          </h4>
        </div>

        {/* External Link */}
        {application.application_url && (
          <a
            href={application.application_url}
            target="_blank"
            rel="noopener noreferrer"
            title="Open direct job posting / portal"
            aria-label="Open job posting"
            className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>

      {/* Applied date & Next action row */}
      <div className="flex flex-wrap items-center justify-between gap-1.5 pt-1 border-t border-[var(--border-subtle)] text-[10px] font-mono-tabular">
        <span className="text-[var(--text-muted)]">{getAppliedRelativeText()}</span>

        {nextAction && (
          <span
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-medium font-mono-tabular ${nextAction.colorClass}`}
          >
            {nextAction.urgency === "overdue" && <AlertTriangle className="h-2.5 w-2.5" />}
            {nextAction.urgency === "soon" && <Clock className="h-2.5 w-2.5" />}
            <span>{nextAction.text}</span>
          </span>
        )}
      </div>

      {/* User Notes Preview (if available) */}
      {application.user_notes && (
        <p
          onClick={onClick}
          className="text-[11px] text-[var(--text-secondary)] line-clamp-2 bg-[var(--surface-elevated)] p-2 rounded border border-[var(--border-subtle)] leading-relaxed italic cursor-pointer"
        >
          "{application.user_notes}"
        </p>
      )}

      {/* Bottom Actions Cluster */}
      <div className="flex items-center justify-between pt-1 text-xs">
        {/* Stage select dropdown for accessible keyboard / mobile changes */}
        <select
          value={application.status}
          onChange={(e) => onStageChange(e.target.value as ApplicationStatus)}
          aria-label="Change stage"
          className="h-6 px-1.5 rounded border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[10px] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-focus)] transition-colors cursor-pointer"
          onClick={(e) => e.stopPropagation()}
        >
          {Object.entries(STAGE_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-1">
          {onAskAI && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onAskAI();
              }}
              title="Ask AI about interview prep"
              className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--border-focus)] hover:bg-[var(--surface-sunken)] transition-colors cursor-pointer"
            >
              <Sparkles className="h-3 w-3" />
            </button>
          )}

          <button
            type="button"
            onClick={onClick}
            title="View details & stage history"
            className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors cursor-pointer flex items-center gap-0.5 text-[10px] font-medium"
          >
            <span>Notes</span>
            <ChevronRight className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}
