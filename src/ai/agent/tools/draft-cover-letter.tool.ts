import { Tool, ToolContext } from "../tool";
import { UnifiedJobPosting } from "../../../types/job-posting";

export class DraftCoverLetterTool implements Tool {
  readonly name = "draft_cover_letter";
  readonly description =
    "Draft a professional, tailored, and truthful cover letter for a specific job, grounded in the candidate's actual skills.";

  readonly parameters = {
    type: "object" as const,
    properties: {
      job_id: {
        type: "string",
        description: "The unique UUID of the job posting to write a cover letter for.",
      },
      notes: {
        type: "string",
        description: "Specific emphasis points, tone preferences, or career highlights to emphasize.",
      },
      target_length: {
        type: "string",
        enum: ["concise", "standard"],
        description: "Desired length: 'concise' (2-3 paragraphs) or 'standard' (3-4 paragraphs).",
      },
    },
  };

  async execute(params: unknown, context: ToolContext): Promise<string> {
    const { repository, profile, conversation } = context;
    const args = (typeof params === "object" && params !== null ? params : {}) as {
      job_id?: string;
      notes?: string;
      target_length?: string;
    };

    let targetJob: UnifiedJobPosting | null = null;

    if (args.job_id) {
      targetJob = await repository.getById(args.job_id);
    } else if (conversation.job_ids.length > 0) {
      const lastJobId = conversation.job_ids[conversation.job_ids.length - 1];
      targetJob = await repository.getById(lastJobId);
    }

    if (!targetJob) {
      return JSON.stringify({
        error: "Job posting not found. Please provide a job_id or fetch job details first.",
      });
    }

    conversation.tagJobId(targetJob.id);

    const relevantSkills = profile.candidate.skills.slice(0, 4);
    const subjectLine = `Application for ${targetJob.title} - ${targetJob.company}`;

    const draft = [
      `Dear Hiring Team at ${targetJob.company},`,
      ``,
      `I am writing to express my strong enthusiasm for the ${targetJob.title} role. With a solid foundation in ${relevantSkills.join(", ")}, I have built and delivered reliable, scalable systems that solve complex domain challenges.`,
      ``,
      args.notes
        ? `Regarding your team's specific goals: ${args.notes}. In my previous work, I have focused on maintaining high engineering standards and shipping performant software.`
        : `What particularly excites me about ${targetJob.company} is the opportunity to apply modern software engineering practices to your product roadmap while collaborating closely with a high-performing engineering group.`,
      ``,
      `I would welcome the opportunity to discuss how my technical background and problem-solving approach align with the ${targetJob.title} position. Thank you for your time and consideration.`,
      ``,
      `Sincerely,`,
      `Candidate`,
    ].join("\n");

    return JSON.stringify({
      job_id: targetJob.id,
      company: targetJob.company,
      title: targetJob.title,
      suggestedSubjectLine: subjectLine,
      coverLetterText: draft,
      keyHighlightsUsed: relevantSkills,
    });
  }
}
