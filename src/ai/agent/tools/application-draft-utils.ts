import { randomUUID } from "node:crypto";
import { ApplicationDraftSourceFact, buildApplicationDraftSourceFacts } from "../../application-drafts.js";
import { NewApplicationDraft } from "../../application-drafts.js";
import { ToolContext } from "../tool.js";
import { UnifiedJobPosting } from "../../../types/job-posting.js";

export function requireOwner(context: ToolContext): string | null {
  return context.role === "owner" ? null : JSON.stringify({ error: "Owner authorization is required." });
}

export async function getDraftSourceFacts(
  context: ToolContext,
  job: UnifiedJobPosting
): Promise<{
  facts: ApplicationDraftSourceFact[];
  approvedAnswers: Array<{ question: string; content: string; source_fact_id: string }>;
}> {
  const facts = await buildApplicationDraftSourceFacts(context.repository, job);
  const approvedDrafts = await context.repository.listApplicationDrafts({
    draftType: "application_answer",
    includeSensitive: false,
    hasApprovedVersion: true,
    limit: 5,
  });
  const approvedAnswers = approvedDrafts
    .filter((draft) => draft.question && draft.versions.some((version) => version.approved_at !== null))
    .map((draft) => {
      const approvedVersion = [...draft.versions]
        .reverse()
        .find((version) => version.approved_at !== null);
      if (!approvedVersion) return null;
      const id = `approved_answer.${draft.id}.v${approvedVersion.version}`;
      facts.push({
        id,
        source: "approved_answer",
        label: `Approved prior answer: ${draft.question}`,
        value: approvedVersion.content.slice(0, 1000),
      });
      return {
        question: draft.question!,
        content: approvedVersion.content.slice(0, 1000),
        source_fact_id: id,
      };
    })
    .filter((answer): answer is { question: string; content: string; source_fact_id: string } => answer !== null);
  return { facts, approvedAnswers };
}

export function selectSourceFacts(
  availableFacts: ApplicationDraftSourceFact[],
  requestedIds: string[] | undefined
): ApplicationDraftSourceFact[] {
  if (!requestedIds || requestedIds.length === 0) return [];
  const byId = new Map(availableFacts.map((fact) => [fact.id, fact]));
  const uniqueIds = Array.from(new Set(requestedIds));
  const facts = uniqueIds.map((id) => byId.get(id));
  if (facts.some((fact) => fact === undefined)) {
    throw new Error("Draft references a candidate fact that was not provided by the approved context.");
  }
  return facts.filter((fact): fact is ApplicationDraftSourceFact => fact !== undefined);
}

export function makeDraftInput(
  context: ToolContext,
  input: {
    job_posting_id: string;
    draft_type: "cover_letter" | "application_answer";
    question?: string;
    content: string;
    subject_line?: string;
    source_facts: ApplicationDraftSourceFact[];
    assumptions?: string[];
  }
): NewApplicationDraft {
  return {
    id: randomUUID(),
    job_posting_id: input.job_posting_id,
    conversation_id: context.conversation.id,
    draft_type: input.draft_type,
    question: input.question ?? null,
    content: input.content,
    subject_line: input.subject_line ?? null,
    source_facts: input.source_facts,
    assumptions: input.assumptions ?? [],
    author: "assistant",
    model_id: context.model_id,
    prompt_version: context.prompt_version,
  };
}
