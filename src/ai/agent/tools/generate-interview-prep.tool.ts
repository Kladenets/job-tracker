import { Tool, ToolContext } from "../tool";
import { UnifiedJobPosting } from "../../../types/job-posting";

export class GenerateInterviewPrepTool implements Tool {
  readonly name = "generate_interview_prep";
  readonly description =
    "Generate tailored technical and behavioral interview preparation questions and key topics for a specific job.";

  readonly parameters = {
    type: "object" as const,
    properties: {
      job_id: {
        type: "string",
        description: "The unique UUID of the job posting to prepare for.",
      },
      focus_area: {
        type: "string",
        enum: ["system_design", "technical", "behavioral", "all"],
        description: "Specific interview focus area (default: 'all').",
      },
    },
  };

  async execute(params: unknown, context: ToolContext): Promise<string> {
    const { repository, conversation } = context;
    const args = (typeof params === "object" && params !== null ? params : {}) as {
      job_id?: string;
      focus_area?: string;
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

    const techStack = targetJob.crawler_data?.detected_technologies || ["TypeScript", "Full Stack"];

    const questions: Record<string, string[]> = {
      system_design: [
        `How would you architect a fault-tolerant backend system using ${techStack.slice(0, 2).join(" and ")}?`,
        `Describe how you approach caching, database read-replicas, and concurrency under high write load.`,
      ],
      technical: [
        `Deep dive into runtime performance optimizations you've made in ${techStack[0] || "modern software"}.`,
        `How do you design data schemas and migration strategies with minimal downtime?`,
      ],
      behavioral: [
        `Tell me about a time you had a technical disagreement with a team member about system architecture. How did you resolve it?`,
        `Describe a challenging production outage you investigated and how you prevented recurrence.`,
      ],
    };

    return JSON.stringify({
      job_id: targetJob.id,
      company: targetJob.company,
      title: targetJob.title,
      focus_area: args.focus_area || "all",
      techStackFound: techStack,
      questions,
      preparationTips: [
        `Review fundamental design tradeoffs around consistency vs availability for ${targetJob.company}'s product domain.`,
        `Prepare 2-3 specific STAR-method stories emphasizing engineering ownership and quantifiable business impact.`,
      ],
    });
  }
}
