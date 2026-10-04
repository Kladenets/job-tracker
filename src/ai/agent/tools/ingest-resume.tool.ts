import { Tool, ToolContext } from "../tool";
import { normalizeStructuredResume, persistResumeAndProfile } from "../../../utils/resume-sync";

export class IngestResumeTool implements Tool {
  readonly name = "ingest_resume";
  readonly description =
    "Parse and ingest structured resume information from raw text, JSON, or markdown to update the candidate profile and work history.";

  readonly parameters = {
    type: "object" as const,
    properties: {
      raw_text: {
        type: "string",
        description: "The raw text, markdown, or JSON string of the resume.",
      },
      source_name: {
        type: "string",
        description: "Optional label for the resume source (e.g. 'manual upload', 'github gist', 'portfolio site').",
      },
    },
    required: ["raw_text"],
  };

  async execute(params: unknown, _context: ToolContext): Promise<string> {
    const args = (typeof params === "object" && params !== null ? params : {}) as {
      raw_text?: string;
      source_name?: string;
    };

    if (!args.raw_text || args.raw_text.trim().length === 0) {
      return "Error: No resume text provided to ingest.";
    }

    try {
      let parsedJson: any = null;
      try {
        parsedJson = JSON.parse(args.raw_text);
      } catch {
        // Not direct JSON; create basic fallback representation
        parsedJson = {
          basics: {
            name: "Candidate",
            summary: args.raw_text.slice(0, 300),
          },
        };
      }

      const structured = normalizeStructuredResume(parsedJson);
      const result = persistResumeAndProfile(structured, {
        type: "file_upload",
        fileName: args.source_name || "Agent Ingested Resume",
      });

      return JSON.stringify({
        success: true,
        message: "Resume ingested and candidate profile updated.",
        candidate: {
          fullName: result.profile.fullName,
          targetTitle: result.profile.targetTitle,
          yearsExperience: result.profile.yearsExperience,
          skillsCount: result.profile.skills.length,
          rolesCount: structured.work?.length || 0,
        },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return `Failed to ingest resume: ${msg}`;
    }
  }
}
