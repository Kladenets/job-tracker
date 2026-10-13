import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Check, FileText, Save } from "lucide-react";
import type { ApplicationDraft } from "../../ai/application-drafts";
import type { UnifiedJobPosting } from "../../types/job-posting";

interface ApplicationDraftsPanelProps {
  jobs: UnifiedJobPosting[];
}

export function ApplicationDraftsPanel({ jobs }: ApplicationDraftsPanelProps) {
  const queryClient = useQueryClient();
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualJobId, setManualJobId] = useState("");
  const [manualQuestion, setManualQuestion] = useState("");
  const [manualAnswer, setManualAnswer] = useState("");
  const jobsById = new Map(jobs.map((job) => [job.id, job]));

  useEffect(() => {
    const refreshDrafts = () => {
      void queryClient.invalidateQueries({ queryKey: ["application-drafts"] });
    };
    window.addEventListener("application-drafts-updated", refreshDrafts);
    return () => window.removeEventListener("application-drafts-updated", refreshDrafts);
  }, [queryClient]);

  const draftsQuery = useQuery<{ success: boolean; drafts: ApplicationDraft[] }>({
    queryKey: ["application-drafts"],
    queryFn: async () => {
      const response = await fetch("/api/application-drafts");
      if (!response.ok) throw new Error(`Could not load application drafts (HTTP ${response.status}).`);
      return response.json();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, content }: { id: string; content: string }) => {
      const response = await fetch(`/api/application-drafts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save draft edits.");
      return data.draft as ApplicationDraft;
    },
    onSuccess: (draft) => {
      setEdits((current) => {
        const next = { ...current };
        delete next[draft.id];
        return next;
      });
      setMessage("Draft edits saved as a new version.");
      void queryClient.invalidateQueries({ queryKey: ["application-drafts"] });
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : "Could not save draft edits."),
  });

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/application-drafts/${id}/approve`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not approve draft.");
      return data.draft as ApplicationDraft;
    },
    onSuccess: () => {
      setMessage("Draft approved by you.");
      void queryClient.invalidateQueries({ queryKey: ["application-drafts"] });
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : "Could not approve draft."),
  });

  const createManualAnswerMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/application-drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_posting_id: manualJobId || jobs[0]?.id,
          draft_type: "application_answer",
          question: manualQuestion,
          content: manualAnswer,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save your answer.");
      return data.draft as ApplicationDraft;
    },
    onSuccess: () => {
      setManualQuestion("");
      setManualAnswer("");
      setManualOpen(false);
      setMessage("Your answer was saved as an unapproved, user-authored draft.");
      void queryClient.invalidateQueries({ queryKey: ["application-drafts"] });
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : "Could not save your answer."),
  });

  const drafts = draftsQuery.data?.drafts ?? [];

  return (
    <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-4 md:p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
            <FileText className="h-4 w-4" />
            Application Drafts
          </h2>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            Assistant drafts stay unapproved until you review and approve them. Editing creates a preserved version.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {message && <p role="status" className="text-xs text-[var(--text-secondary)]">{message}</p>}
          <button
            type="button"
            onClick={() => setManualOpen((open) => !open)}
            className="rounded-md border border-[var(--border-subtle)] px-2.5 py-1.5 text-xs font-semibold text-[var(--text-primary)]"
          >
            {manualOpen ? "Cancel answer" : "Write answer yourself"}
          </button>
        </div>
      </div>

      {manualOpen && (
        <form
          className="grid gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-base)] p-3 md:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            createManualAnswerMutation.mutate();
          }}
        >
          <label className="space-y-1 text-xs text-[var(--text-secondary)]">
            <span>Job</span>
            <select
              required
              value={manualJobId || jobs[0]?.id || ""}
              onChange={(event) => setManualJobId(event.target.value)}
              className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-2 text-[var(--text-primary)]"
            >
              {jobs.map((job) => (
                <option key={job.id} value={job.id}>{job.title} at {job.company}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-xs text-[var(--text-secondary)]">
            <span>Application question</span>
            <input
              required
              maxLength={2000}
              value={manualQuestion}
              onChange={(event) => setManualQuestion(event.target.value)}
              className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-2 text-[var(--text-primary)]"
            />
          </label>
          <label className="space-y-1 text-xs text-[var(--text-secondary)] md:col-span-2">
            <span>Your answer (kept out of AI retrieval)</span>
            <textarea
              required
              maxLength={20000}
              rows={4}
              value={manualAnswer}
              onChange={(event) => setManualAnswer(event.target.value)}
              className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-2 text-[var(--text-primary)]"
            />
          </label>
          <button
            type="submit"
            disabled={jobs.length === 0 || createManualAnswerMutation.isPending}
            className="justify-self-start rounded-md bg-[var(--action-primary-bg)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            Save as unapproved draft
          </button>
        </form>
      )}

      {draftsQuery.isLoading ? (
        <p className="text-xs text-[var(--text-muted)]">Loading drafts…</p>
      ) : draftsQuery.isError ? (
        <p role="alert" className="flex items-center gap-2 text-xs text-[var(--status-danger-fg)]">
          <AlertCircle className="h-4 w-4" />
          {draftsQuery.error instanceof Error ? draftsQuery.error.message : "Drafts could not be loaded."}
        </p>
      ) : drafts.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[var(--border-subtle)] p-4 text-xs text-[var(--text-muted)]">
          No drafts yet. Ask the AI career assistant to draft a cover letter or a non-sensitive application answer.
        </p>
      ) : (
        <div className="space-y-3">
          {drafts.map((draft) => {
            const current = draft.versions.find((version) => version.version === draft.current_version)!;
            const content = edits[draft.id] ?? current.content;
            const isDirty = content !== current.content;
            const job = jobsById.get(draft.job_posting_id);
            return (
              <article
                key={draft.id}
                className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-base)] p-3 md:p-4 space-y-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-semibold text-[var(--text-primary)]">
                      {draft.draft_type === "cover_letter" ? "Cover letter" : "Application answer"}
                      {job ? ` · ${job.title} at ${job.company}` : ""}
                    </h3>
                    {draft.question && (
                      <p className="mt-1 text-xs text-[var(--text-secondary)]">{draft.question}</p>
                    )}
                  </div>
                  <span className="rounded-full border border-[var(--border-subtle)] px-2 py-1 text-[10px] font-semibold uppercase text-[var(--text-secondary)]">
                    {draft.status === "approved" ? "Approved" : "Unapproved draft"}
                    {draft.sensitive ? " · user-only" : ""}
                  </span>
                </div>

                {current.subject_line && (
                  <p className="text-xs text-[var(--text-secondary)]">
                    Subject: <span className="text-[var(--text-primary)]">{current.subject_line}</span>
                  </p>
                )}

                <label className="block space-y-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                    Draft text
                  </span>
                  <textarea
                    aria-label={`Draft text for ${draft.draft_type === "cover_letter" ? "cover letter" : "application answer"}`}
                    value={content}
                    onChange={(event) =>
                      setEdits((previous) => ({ ...previous, [draft.id]: event.target.value }))
                    }
                    rows={Math.min(14, Math.max(5, content.split("\n").length + 1))}
                    className="w-full resize-y rounded-md border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-3 text-xs leading-relaxed text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--border-focus)]"
                  />
                </label>

                <div className="grid gap-3 text-xs md:grid-cols-2">
                  <div>
                    <h4 className="mb-1 font-semibold text-[var(--text-secondary)]">Candidate facts used</h4>
                    {current.source_facts.length ? (
                      <ul className="list-disc space-y-1 pl-4 text-[var(--text-muted)]">
                        {current.source_facts.map((fact) => (
                          <li key={fact.id}>
                            <span className="font-medium">{fact.label}:</span> {fact.value}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-[var(--text-muted)]">No candidate facts were cited.</p>
                    )}
                  </div>
                  <div>
                    <h4 className="mb-1 font-semibold text-[var(--text-secondary)]">Assumptions to verify</h4>
                    {current.assumptions.length ? (
                      <ul className="list-disc space-y-1 pl-4 text-[var(--text-muted)]">
                        {current.assumptions.map((assumption, index) => <li key={index}>{assumption}</li>)}
                      </ul>
                    ) : (
                      <p className="text-[var(--text-muted)]">None recorded.</p>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border-subtle)] pt-3">
                  <div className="text-[10px] text-[var(--text-muted)]">
                    Model: {current.model_id || "user-authored"} · Prompt: {current.prompt_version || "user-edit"}
                    {" · "}Version {current.version} · {draft.versions.length} total
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={!isDirty || updateMutation.isPending}
                      onClick={() => updateMutation.mutate({ id: draft.id, content })}
                      className="inline-flex items-center gap-1 rounded-md border border-[var(--border-subtle)] px-2.5 py-1.5 text-xs font-semibold text-[var(--text-primary)] disabled:opacity-50"
                    >
                      <Save className="h-3.5 w-3.5" />
                      Save edit
                    </button>
                    <button
                      type="button"
                      disabled={draft.status === "approved" || isDirty || approveMutation.isPending}
                      onClick={() => approveMutation.mutate(draft.id)}
                      className="inline-flex items-center gap-1 rounded-md bg-[var(--action-primary-bg)] px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      <Check className="h-3.5 w-3.5" />
                      Approve
                    </button>
                  </div>
                </div>

                {draft.versions.length > 1 && (
                  <details className="text-[10px] text-[var(--text-muted)]">
                    <summary className="cursor-pointer font-semibold">Version history</summary>
                    <ol className="mt-2 space-y-1">
                      {draft.versions.map((version) => (
                        <li key={version.version} className="rounded border border-[var(--border-subtle)] p-2">
                          <details>
                            <summary className="cursor-pointer">
                              v{version.version} · {version.author === "user" ? "user edit" : "generated"}
                              {version.approved_at ? ` · approved ${new Date(version.approved_at).toLocaleString()}` : ""}
                              {" · "}{new Date(version.created_at).toLocaleString()}
                            </summary>
                            <pre className="mt-2 whitespace-pre-wrap font-sans text-[var(--text-secondary)]">
                              {version.content}
                            </pre>
                            {!!version.source_facts.length && (
                              <p className="mt-2">
                                Source facts: {version.source_facts.map((fact) => fact.label).join(", ")}
                              </p>
                            )}
                            {!!version.assumptions.length && (
                              <p className="mt-1">Assumptions: {version.assumptions.join("; ")}</p>
                            )}
                          </details>
                        </li>
                      ))}
                    </ol>
                  </details>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
