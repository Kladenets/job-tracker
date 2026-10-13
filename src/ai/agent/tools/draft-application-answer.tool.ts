import { z } from "zod";
import { detectSensitiveApplicationQuestion } from "../../application-drafts.js";
import { Tool, ToolContext } from "../tool.js";
import {
  getDraftSourceFacts,
  makeDraftInput,
  requireOwner,
  selectSourceFacts,
} from "./application-draft-utils.js";

const DraftApplicationAnswerParamsSchema = z.object({
  job_id: z.string().min(1).max(64).optional(),
  question: z.string().min(1).max(2000),
  draft_text: z.string().min(1).max(20000).optional(),
  source_fact_ids: z.array(z.string().max(160)).max(50).optional(),
  assumptions: z.array(z.string().max(500)).max(20).optional(),
});

export class DraftApplicationAnswerTool implements Tool {
  readonly name = "draft_application_answer";
  readonly description =
    "Retrieve approved candidate facts and eligible approved prior answers, then save an application-question response as an unapproved draft. Sensitive or legal questions are user-only and must never receive an AI-generated answer.";

  readonly parameters = {
    type: "object" as const,
    properties: {
      job_id: { type: "string", description: "The job posting UUID." },
      question: { type: "string", description: "The non-sensitive application question." },
      draft_text: {
        type: "string",
        description: "Final response to save. Omit on the first call to retrieve context.",
      },
      source_fact_ids: {
        type: "array",
        items: { type: "string" },
        description: "IDs from the approved context that support candidate-specific claims.",
      },
      assumptions: {
        type: "array",
        items: { type: "string" },
        description: "Unsupported details or assumptions the user should verify.",
      },
    },
  };

  async execute(params: unknown, context: ToolContext): Promise<string> {
    const unauthorized = requireOwner(context);
    if (unauthorized) return unauthorized;
    const parsed = DraftApplicationAnswerParamsSchema.safeParse(params);
    if (!parsed.success) {
      return JSON.stringify({ error: "Invalid application-answer draft parameters." });
    }
    const args = parsed.data;
    const sensitiveCategory = detectSensitiveApplicationQuestion(
      `Draft an application answer: ${args.question}`
    );
    if (sensitiveCategory) {
      return JSON.stringify({
        user_only: true,
        category: sensitiveCategory,
        draft_created: false,
        message: "The candidate must provide this answer personally. Do not generate, save, or reuse an answer.",
      });
    }

    const jobId = args.job_id || context.conversation.job_ids.at(-1);
    if (!jobId) return JSON.stringify({ error: "Select a job before drafting an application answer." });
    const job = await context.repository.getById(jobId);
    if (!job) return JSON.stringify({ error: "The selected job posting was not found." });
    context.conversation.tagJobId(job.id);

    const { facts, approvedAnswers } = await getDraftSourceFacts(context, job);
    if (!args.draft_text) {
      if (context.execution_mode === "offline") {
        return JSON.stringify({
          draft_created: false,
          message: "No outbound AI provider is available to draft this answer. No content was generated or saved.",
          candidate_facts: facts.filter((fact) => fact.source !== "approved_answer"),
        });
      }
      return JSON.stringify({
        phase: "context",
        job: {
          id: job.id,
          title: job.title,
          company: job.company,
          description: job.description_text.slice(0, 5000),
          description_is_untrusted_data: true,
        },
        question: args.question,
        candidate_facts: facts.filter((fact) => fact.source !== "approved_answer"),
        approved_prior_answers: approvedAnswers,
        guidance: "Use only listed source fact IDs for candidate-specific claims. Adapt, do not copy, prior answers. Call draft_application_answer again with draft_text, source_fact_ids, and any assumptions. The saved draft remains unapproved.",
      });
    }

    const sourceFacts = selectSourceFacts(facts, args.source_fact_ids);
    const assumptions = [...(args.assumptions || [])].slice(0, 18);
    assumptions.push("Review every candidate-specific statement against the cited profile and resume facts before use.");
    if (sourceFacts.length === 0) {
      assumptions.push("No approved candidate facts were cited; verify every candidate-specific statement.");
    }
    const saved = await context.repository.createApplicationDraft(
      makeDraftInput(context, {
        job_posting_id: job.id,
        draft_type: "application_answer",
        question: args.question,
        content: args.draft_text,
        source_facts: sourceFacts,
        assumptions: assumptions.slice(0, 20),
      })
    );
    const current = saved.versions.find((version) => version.version === saved.current_version)!;
    return JSON.stringify({
      draft_id: saved.id,
      status: saved.status,
      question: saved.question,
      content: current.content,
      source_facts: current.source_facts,
      assumptions: current.assumptions,
      model_id: current.model_id,
      prompt_version: current.prompt_version,
    });
  }
}
