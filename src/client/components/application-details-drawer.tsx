import React, { useState, useEffect, useRef } from "react";
import { Application, ApplicationStatus, UnifiedJobPosting } from "../../types/job-posting";
import { APPLICATION_STAGE_DEFINITIONS } from "./application-stages";
import {
  X,
  ExternalLink,
  Calendar,
  Clock,
  FileText,
  Building2,
  Briefcase,
  ChevronRight,
  Save,
  CheckCircle2,
  Trash2,
} from "lucide-react";
import { useDialogFocus } from "../hooks/use-dialog-focus";

interface ApplicationDetailsDrawerProps {
  application: Application | null;
  job: UnifiedJobPosting | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (data: {
    status?: ApplicationStatus;
    next_action_date?: string | null;
    user_notes?: string | null;
    application_url?: string | null;
  }) => Promise<void>;
  onDelete?: () => Promise<void>;
  isUpdating?: boolean;
}

export function ApplicationDetailsDrawer({
  application,
  job,
  isOpen,
  onClose,
  onUpdate,
  onDelete,
  isUpdating = false,
}: ApplicationDetailsDrawerProps) {
  const [currentStatus, setCurrentStatus] = useState<ApplicationStatus>("applied");
  const [notes, setNotes] = useState("");
  const [nextActionDate, setNextActionDate] = useState("");
  const [appUrl, setAppUrl] = useState("");
  const [isSaved, setIsSaved] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(dialogRef, { enabled: isOpen, onClose, initialFocusSelector: '[aria-label="Close drawer"]' });

  useEffect(() => {
    if (application) {
      setCurrentStatus(application.status as ApplicationStatus);
      setNotes(application.user_notes || "");
      setNextActionDate(
        application.next_action_date ? application.next_action_date.split("T")[0] : ""
      );
      setAppUrl(application.application_url || "");
      setIsSaved(false);
    }
  }, [application]);

  if (!isOpen || !application) return null;

  const handleSave = async () => {
    try {
      await onUpdate({
        status: currentStatus,
        user_notes: notes.trim() || null,
        next_action_date: nextActionDate ? new Date(nextActionDate).toISOString() : null,
        application_url: appUrl.trim() || null,
      });
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 2500);
    } catch (err) {
      console.error("Failed to save application updates:", err);
    }
  };

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="application-details-title"
      tabIndex={-1}
      className="fixed inset-0 z-50 overflow-hidden bg-black/50 backdrop-blur-xs flex justify-end animate-in fade-in duration-200"
    >
      <div className="w-full max-w-xl h-full bg-[var(--surface-base)] border-l border-[var(--border-subtle)] shadow-2xl flex flex-col overflow-y-auto animate-in slide-in-from-right duration-250">
        {/* Drawer Header */}
        <div className="p-4 sm:p-5 border-b border-[var(--border-subtle)] bg-[var(--surface-elevated)] sticky top-0 z-10 flex items-center justify-between">
          <div className="space-y-0.5 max-w-[80%]">
            <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--border-focus)] font-mono-tabular">
              Application Lifecycle
            </span>
            <h2 id="application-details-title" className="text-base font-bold text-[var(--text-primary)] truncate">
              {job?.title || "Role Application"}
            </h2>
            <p className="text-xs text-[var(--text-secondary)] truncate">
              {job?.company || "Company"} {job?.location ? `· ${job.location}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onClose}
              aria-label="Close drawer"
              className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-6 space-y-6 flex-1">
          {/* Quick Stage Selector Bar */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-[var(--text-secondary)] block">
              Active Pipeline Stage
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {APPLICATION_STAGE_DEFINITIONS.map((stage) => {
                const isActive = currentStatus === stage.id;
                return (
                  <button
                    key={stage.id}
                    type="button"
                    onClick={() => setCurrentStatus(stage.id)}
                    aria-pressed={isActive}
                    className={`px-2 py-1.5 rounded-md text-xs font-semibold text-center border transition-all cursor-pointer ${
                      isActive
                        ? "border-[var(--action-primary-bg)] bg-[var(--action-primary-bg)] text-white shadow-xs"
                        : "border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]"
                    }`}
                  >
                    {stage.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Dates & External Links */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 p-3.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)]">
            <div className="space-y-1">
              <label htmlFor="application-next-action" className="text-[11px] font-semibold text-[var(--text-secondary)] flex items-center gap-1.5">
                <Calendar className="h-3 w-3 text-[var(--text-muted)]" />
                Date Applied
              </label>
              <p className="text-xs font-mono-tabular text-[var(--text-primary)] font-medium">
                {application.applied_at
                  ? new Date(application.applied_at).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })
                  : "Not yet submitted"}
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-[var(--text-secondary)] flex items-center gap-1.5">
                <Clock className="h-3 w-3 text-[var(--border-focus)]" />
                Next Action Due
              </label>
              <input
                id="application-next-action"
                type="date"
                value={nextActionDate}
                onChange={(e) => setNextActionDate(e.target.value)}
                className="w-full h-7 px-2 rounded border border-[var(--border-subtle)] bg-[var(--surface-base)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-focus)] font-mono-tabular"
              />
            </div>

            <div className="sm:col-span-2 space-y-1 pt-1 border-t border-[var(--border-subtle)]">
              <label htmlFor="application-portal-url" className="text-[11px] font-semibold text-[var(--text-secondary)] flex items-center gap-1.5">
                <ExternalLink className="h-3 w-3 text-[var(--text-muted)]" />
                Direct Application / Portal URL
              </label>
              <div className="flex gap-2">
                <input
                  id="application-portal-url"
                  type="url"
                  value={appUrl}
                  onChange={(e) => setAppUrl(e.target.value)}
                  placeholder="https://..."
                  className="flex-1 h-7 px-2 rounded border border-[var(--border-subtle)] bg-[var(--surface-base)] text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--border-focus)]"
                />
                {appUrl && (
                  <a
                    href={appUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="h-7 px-2.5 rounded bg-[var(--surface-sunken)] border border-[var(--border-subtle)] text-[11px] font-semibold text-[var(--text-primary)] hover:border-[var(--border-focus)] inline-flex items-center gap-1"
                  >
                    <span>Open</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* User Interview & Compensation Notes */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="application-notes" className="text-xs font-semibold text-[var(--text-secondary)] flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                Interview & Preparation Notes
              </label>
              <span className="text-[10px] text-[var(--text-muted)] font-mono-tabular">
                Markdown supported
              </span>
            </div>
            <textarea
              id="application-notes"
              rows={6}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Record recruiter questions, technical debrief notes, panel interviewer names, or salary offer milestones..."
              className="w-full p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--border-focus)] transition-colors resize-y leading-relaxed font-sans"
            />
          </div>

          {/* Stage Audit History Timeline */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
              <span>Stage Audit History</span>
              <span className="text-[10px] text-[var(--text-muted)] font-mono-tabular font-normal">
                ({application.stage_history?.length || 0} transitions)
              </span>
            </h3>

            <div className="space-y-2 relative pl-4 border-l-2 border-[var(--border-subtle)] ml-2">
              {application.stage_history && application.stage_history.length > 0 ? (
                application.stage_history.map((hist, idx) => (
                  <div key={idx} className="relative group">
                    <span className="absolute -left-[1.35rem] top-1.5 h-2.5 w-2.5 rounded-full bg-[var(--surface-base)] border-2 border-[var(--border-focus)]" />
                    <div className="p-2.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-elevated)] space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-[var(--text-primary)] uppercase tracking-tight text-[11px]">
                          {hist.stage.replace("_", " ")}
                        </span>
                        <span className="text-[10px] font-mono-tabular text-[var(--text-muted)]">
                          {new Date(hist.entered_at).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      {hist.notes && (
                        <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed italic">
                          "{hist.notes}"
                        </p>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-xs text-[var(--text-muted)] italic">
                  No historical stage transitions logged yet.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Drawer Footer Actions */}
        <div className="p-4 border-t border-[var(--border-subtle)] bg-[var(--surface-elevated)] sticky bottom-0 z-10 flex items-center justify-between">
          {onDelete ? (
            <button
              type="button"
              onClick={() => {
                if (window.confirm("Delete this application? This cannot be undone.")) {
                  void onDelete();
                }
              }}
              className="px-3 py-1.5 rounded-md text-xs font-semibold text-[var(--status-danger-fg)] hover:bg-[var(--status-danger-bg)] border border-transparent hover:border-[var(--status-danger-fg)]/20 transition-colors flex items-center gap-1 cursor-pointer"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Delete</span>
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors cursor-pointer"
            >
              Close
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isUpdating}
              className="px-4 py-1.5 rounded-md bg-[var(--action-primary-bg)] text-white text-xs font-semibold hover:opacity-90 transition-opacity flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-xs"
            >
              {isSaved ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-200" />
                  <span>Saved!</span>
                </>
              ) : (
                <>
                  <Save className="h-3.5 w-3.5" />
                  <span>{isUpdating ? "Saving..." : "Save Changes"}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
