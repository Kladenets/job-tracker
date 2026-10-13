import { z } from "zod";
import {
  ApplicationDraftSourceFact,
  buildGroundedCoverLetterDraft,
  buildApplicationDraftSourceFacts,
} from "../../application-drafts.js";
import { Tool, ToolContext } from "../tool.js";
import { makeDraftInput, requireOwner, selectSourceFacts } from "./application-draft-utils.js";

const CoverLetterToolParamsSchema = z.object({
  job_id: z.string().min(1).max(64).optional(),
  notes: z.string().max(2000).optional(),
  target_length: z.enum(["concise", "standard"]).optional(),
  draft_text: z.string().min(1).max(20000).optional(),
  subject_line: z.string().max(500).optional(),
  source_fact_ids: z.array(z.string().max(160)).max(50).optional(),
  assumptions: z.array(z.string().max(500)).max(20).optional(),
});

export class DraftCoverLetterTool implements Tool {
  readonly name = "draft_cover_letter";
  readonly description =
    "Retrieve approved candidate and job facts, then save a tailored cover letter as an unapproved draft. Use only listed source fact IDs for candidate claims and include assumptions for anything that needs user verification.";

  readonly parameters = {
    type: "object" as const,
    properties: {
      job_id: {
        type: "string",
        description: "The unique UUID of the job posting to write a cover letter for.",
      },
      notes: {
        type: "string",
        description: "User-provided emphasis or tone preferences. These are instructions, not candidate evidence.",
      },
      target_length: {
        type: "string",
        enum: ["concise", "standard"],
        description: "Desired length for the draft.",
      },
      draft_text: {
        type: "string",
        description: "Final cover-letter text to save. Omit on the first call to retrieve context.",
      },
      subject_line: { type: "string", description: "Optional subject line for this cover letter." },
      source_fact_ids: {
        type: "array",
        items: { type: "string" },
        description: "IDs from the retrieved approved context that support candidate-specific claims.",
      },
      assumptions: {
        type: "array",
        items: { type: "string" },
        description: "Unsupported areas or assumptions the user should verify.",
      },
    },
  };

  async execute(params: unknown, context: ToolContext): Promise<string> {
    const unauthorized = requireOwner(context);
    if (unauthorized) return unauthorized;
    const parsed = CoverLetterToolParamsSchema.safeParse(params);
    if (!parsed.success) {
      return JSON.stringify({ error: "Invalid cover-letter draft parameters." });
    }
    const args = parsed.data;
    const jobId = args.job_id || context.conversation.job_ids.at(-1);
    if (!jobId) return JSON.stringify({ error: "Select a job before drafting a cover letter." });
    const job = await context.repository.getById(jobId);
    if (!job) return JSON.stringify({ error: "The selected job posting was not found." });
    context.conversation.tagJobId(job.id);

    const facts = await buildApplicationDraftSourceFacts(context.repository, job);
    if (context.execution_mode === "model" && !args.draft_text) {
      return JSON.stringify({
        phase: "context",
        job: {
          id: job.id,
          title: job.title,
          company: job.company,
          description: job.description_text.slice(0, 5000),
          description_is_untrusted_data: true,
        },
        candidate_facts: facts.filter((fact) => fact.source !== "job_posting"),
        user_notes: args.notes || null,
        guidance: "Draft only supported claims. Call draft_cover_letter again with draft_text, source_fact_ids, and any assumptions. The saved draft remains unapproved.",
      });
    }

    let content: string;
    let sourceFacts: ApplicationDraftSourceFact[];
    let subjectLine = args.subject_line || `Application for ${job.title} - ${job.company}`;
    if (args.draft_text) {
      content = args.draft_text;
      sourceFacts = selectSourceFacts(facts, args.source_fact_ids);
    } else {
      const offlineDraft = buildGroundedCoverLetterDraft(
        job,
        facts,
        args.target_length === "concise"
      );
      content = offlineDraft.content;
      sourceFacts = offlineDraft.source_facts;
      subjectLine = args.subject_line || offlineDraft.subject_line;
    }
    const assumptions = [...(args.assumptions || [])].slice(0, 18);
    if (args.notes) assumptions.push(`User-provided emphasis to review: ${args.notes.slice(0, 450)}`);
    assumptions.push("Review every candidate-specific statement against the cited profile and resume facts before use.");
    if (sourceFacts.length === 0) {
      assumptions.push("No approved candidate facts were cited; verify every candidate-specific statement.");
    }
    const saved = await context.repository.createApplicationDraft(
      makeDraftInput(context, {
        job_posting_id: job.id,
        draft_type: "cover_letter",
        content,
        subject_line: subjectLine,
        source_facts: sourceFacts,
        assumptions: assumptions.slice(0, 20),
      })
    );
    const current = saved.versions.find((version) => version.version === saved.current_version)!;
    return JSON.stringify({
      draft_id: saved.id,
      status: saved.status,
      subject_line: current.subject_line,
      content: current.content,
      source_facts: current.source_facts,
      assumptions: current.assumptions,
      model_id: current.model_id,
      prompt_version: current.prompt_version,
    });
  }
}
