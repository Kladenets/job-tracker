import React, { useRef, useState } from "react";
import { ApplicationStatus, ApplicationStatusSchema } from "../../types/job-posting";
import { X, Building2, Briefcase, Link as LinkIcon, Calendar, FileText } from "lucide-react";
import { useDialogFocus } from "../hooks/use-dialog-focus";

interface AddApplicationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    company: string;
    title: string;
    status: ApplicationStatus;
    application_url?: string;
    applied_at?: string;
    next_action_date?: string;
    user_notes?: string;
  }) => Promise<void>;
  isLoading?: boolean;
}

const STAGE_OPTIONS: { id: ApplicationStatus; label: string }[] = [
  { id: "preparing", label: "Preparing (Tailoring & Research)" },
  { id: "applied", label: "Applied (Submitted)" },
  { id: "recruiter_screen", label: "Recruiter Screen" },
  { id: "interviewing", label: "Technical / Team Interview" },
  { id: "assessment", label: "Assessment / Take-Home" },
  { id: "offer", label: "Offer Received" },
  { id: "accepted", label: "Offer Accepted" },
  { id: "rejected", label: "Rejected" },
  { id: "withdrawn", label: "Withdrawn" },
  { id: "inactive", label: "Inactive" },
];

const today = () => new Date().toISOString().slice(0, 10);

export function AddApplicationModal({
  isOpen,
  onClose,
  onSubmit,
  isLoading = false,
}: AddApplicationModalProps) {
  const [company, setCompany] = useState("");
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<ApplicationStatus>("applied");
  const [applicationUrl, setApplicationUrl] = useState("");
  const [appliedAt, setAppliedAt] = useState(today());
  const [nextActionDate, setNextActionDate] = useState("");
  const [userNotes, setUserNotes] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(dialogRef, { enabled: isOpen, onClose, initialFocusSelector: "#add-application-company" });

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!company.trim() || !title.trim()) {
      setFormError("Company and Job Title are required.");
      return;
    }
    setFormError(null);

    try {
      await onSubmit({
        company: company.trim(),
        title: title.trim(),
        status,
        application_url: applicationUrl.trim() || undefined,
        applied_at: status !== "preparing" && appliedAt ? new Date(appliedAt).toISOString() : undefined,
        next_action_date: nextActionDate ? new Date(nextActionDate).toISOString() : undefined,
        user_notes: userNotes.trim() || undefined,
      });
      // Reset form
      setCompany("");
      setTitle("");
      setStatus("applied");
      setAppliedAt(today());
      setApplicationUrl("");
      setNextActionDate("");
      setUserNotes("");
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create application";
      setFormError(msg);
    }
  };

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-application-modal-title"
      tabIndex={-1}
      className="fixed inset-0 z-50 flex items-start sm:items-center justify-center overflow-y-auto p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div className="relative my-auto w-full max-w-lg max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-base)] shadow-2xl p-4 sm:p-6 space-y-5">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
          <div>
            <h2 id="add-application-modal-title" className="text-base font-bold text-[var(--text-primary)]">
              Track New Application
            </h2>
            <p className="text-xs text-[var(--text-secondary)]">
              Record a new application to manage interview stages, timelines, and next actions.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {formError && (
          <div role="alert" aria-live="assertive" className="p-3 rounded-md bg-[var(--status-danger-bg)] text-[var(--status-danger-fg)] text-xs border border-[var(--status-danger-fg)]/20">
            {formError}
          </div>
        )}

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {/* Company */}
            <div className="space-y-1">
              <label htmlFor="add-application-company" className="text-xs font-semibold text-[var(--text-secondary)] flex items-center gap-1">
                <Building2 className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                Company <span className="text-[var(--status-danger-fg)]">*</span>
              </label>
              <input
                id="add-application-company"
                type="text"
                required
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="e.g. Anthropic, Stripe"
                className="w-full h-8.5 px-3 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--border-focus)] transition-colors"
              />
            </div>

            {/* Title */}
            <div className="space-y-1">
              <label htmlFor="add-application-title" className="text-xs font-semibold text-[var(--text-secondary)] flex items-center gap-1">
                <Briefcase className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                Job Title <span className="text-[var(--status-danger-fg)]">*</span>
              </label>
              <input
                id="add-application-title"
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Staff Platform Engineer"
                className="w-full h-8.5 px-3 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--border-focus)] transition-colors"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {/* Stage */}
            <div className="space-y-1">
              <label htmlFor="add-application-stage" className="text-xs font-semibold text-[var(--text-secondary)]">
                Initial Pipeline Stage
              </label>
              <select
                id="add-application-stage"
                value={status}
                onChange={(e) => {
                  const nextStatus = e.target.value as ApplicationStatus;
                  setStatus(nextStatus);
                  if (nextStatus === "preparing") setAppliedAt("");
                  else if (!appliedAt) setAppliedAt(today());
                }}
                className="w-full h-8.5 px-2.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-focus)] transition-colors cursor-pointer"
              >
                {STAGE_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Date Applied */}
            <div className="space-y-1">
              <label htmlFor="add-application-date" className="text-xs font-semibold text-[var(--text-secondary)] flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                Date Applied
              </label>
              <input
                id="add-application-date"
                type="date"
                value={appliedAt}
                disabled={status === "preparing"}
                onChange={(e) => setAppliedAt(e.target.value)}
                className="w-full h-8.5 px-2.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-focus)] transition-colors font-mono-tabular disabled:opacity-50"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {/* Application URL */}
            <div className="space-y-1">
              <label htmlFor="add-application-url" className="text-xs font-semibold text-[var(--text-secondary)] flex items-center gap-1">
                <LinkIcon className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                Posting / Portal URL
              </label>
              <input
                id="add-application-url"
                type="url"
                value={applicationUrl}
                onChange={(e) => setApplicationUrl(e.target.value)}
                placeholder="https://jobs.lever.co/..."
                className="w-full h-8.5 px-3 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--border-focus)] transition-colors"
              />
            </div>

            {/* Next Action Deadline */}
            <div className="space-y-1">
              <label htmlFor="add-application-next-action" className="text-xs font-semibold text-[var(--text-secondary)] flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                Next Action Due Date
              </label>
              <input
                id="add-application-next-action"
                type="date"
                value={nextActionDate}
                onChange={(e) => setNextActionDate(e.target.value)}
                className="w-full h-8.5 px-2.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-focus)] transition-colors font-mono-tabular"
              />
            </div>
          </div>

          {/* User Notes */}
          <div className="space-y-1">
            <label htmlFor="add-application-notes" className="text-xs font-semibold text-[var(--text-secondary)] flex items-center gap-1">
              <FileText className="h-3.5 w-3.5 text-[var(--text-muted)]" />
              Notes / Recruiter Thread / Salary Expectation
            </label>
            <textarea
              id="add-application-notes"
              rows={3}
              value={userNotes}
              onChange={(e) => setUserNotes(e.target.value)}
              placeholder="Initial recruiter outreach, expected compensation range, referral contact..."
              className="w-full p-2.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--border-focus)] transition-colors resize-none leading-relaxed"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[var(--border-subtle)]">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-4 py-1.5 rounded-md bg-[var(--action-primary-bg)] text-white text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 shadow-xs"
            >
              {isLoading ? "Saving..." : "Create Application"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
