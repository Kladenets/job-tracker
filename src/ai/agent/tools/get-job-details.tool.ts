import { Tool, ToolContext } from "../tool";
import { UnifiedJobPosting } from "../../../types/job-posting";

export class GetJobDetailsTool implements Tool {
  readonly name = "get_job_details";
  readonly description =
    "Retrieve the full details and description of a job posting by its ID or by a company/title search query.";

  readonly parameters = {
    type: "object" as const,
    properties: {
      job_id: {
        type: "string",
        description: "The unique UUID of the job posting to retrieve.",
      },
      query: {
        type: "string",
        description: "Alternative search term (e.g. company name or job title) if UUID is not known.",
      },
    },
  };

  async execute(params: unknown, context: ToolContext): Promise<string> {
    const { repository, conversation } = context;
    const args = (typeof params === "object" && params !== null ? params : {}) as {
      job_id?: string;
      query?: string;
    };

    let targetJob: UnifiedJobPosting | null = null;

    if (args.job_id) {
      targetJob = await repository.getById(args.job_id);
    } else if (args.query) {
      const list = await repository.listPostings({ company: args.query, limit: 5 });
      if (list.length > 0) {
        targetJob = list[0];
      }
    } else if (conversation.job_ids.length > 0) {
      // Default to the most recently tagged job in this conversation
      const lastJobId = conversation.job_ids[conversation.job_ids.length - 1];
      targetJob = await repository.getById(lastJobId);
    }

    if (!targetJob) {
      return JSON.stringify({
        error: "Job posting not found",
        searchedFor: args,
      });
    }

    // Automatically tag this job ID to the conversation
    conversation.tagJobId(targetJob.id);

    return JSON.stringify({
      id: targetJob.id,
      title: targetJob.title,
      company: targetJob.company,
      location: targetJob.location || "Unknown / Not specified",
      workplace_type: targetJob.workplace_type,
      seniority: targetJob.seniority,
      compensation: targetJob.raw_salary_text || (targetJob.salary_min_annual ? `$${targetJob.salary_min_annual.toLocaleString()} - $${(targetJob.salary_max_annual || targetJob.salary_min_annual).toLocaleString()} ${targetJob.currency}` : "Not listed"),
      date_posted: targetJob.date_posted,
      job_status: targetJob.job_status,
      availability: targetJob.availability,
      source: targetJob.source,
      canonical_url: targetJob.canonical_url,
      application_url: targetJob.application_url,
      detected_technologies: targetJob.crawler_data?.detected_technologies || [],
      description: targetJob.description_text,
    });
  }
}
