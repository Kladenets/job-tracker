import { Tool, ToolContext } from "../tool";

export class SearchSavedJobsTool implements Tool {
  readonly name = "search_saved_jobs";
  readonly description =
    "Search the database of ingested job postings by keyword, company, workplace type (remote/hybrid/onsite), or review status.";

  readonly parameters = {
    type: "object" as const,
    properties: {
      query: {
        type: "string",
        description: "Search keyword matching job title, tech keywords, or description.",
      },
      company: {
        type: "string",
        description: "Filter specifically by company name.",
      },
      workplace_type: {
        type: "string",
        enum: ["remote", "hybrid", "onsite"],
        description: "Filter by workplace policy.",
      },
      status: {
        type: "string",
        enum: ["discovered", "saved", "reviewing", "applied", "archived"],
        description: "Filter by workflow status.",
      },
      limit: {
        type: "number",
        description: "Maximum number of results to return (default 5).",
      },
    },
  };

  async execute(params: unknown, context: ToolContext): Promise<string> {
    const { repository } = context;
    const args = (typeof params === "object" && params !== null ? params : {}) as {
      query?: string;
      company?: string;
      workplace_type?: string;
      status?: string;
      limit?: number;
    };

    const maxResults = Math.min(args.limit || 5, 20);
    const postings = await repository.listPostings({
      company: args.company,
      jobStatus: args.status,
      limit: 50, // Fetch broad pool and filter locally if needed
    });

    let results = postings;

    if (args.workplace_type) {
      results = results.filter((p) => p.workplace_type === args.workplace_type);
    }

    if (args.query) {
      const q = args.query.toLowerCase();
      results = results.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.company.toLowerCase().includes(q) ||
          p.description_text.toLowerCase().includes(q) ||
          (p.crawler_data?.detected_technologies || []).some((t) => t.toLowerCase().includes(q))
      );
    }

    const trimmed = results.slice(0, maxResults).map((p) => ({
      id: p.id,
      title: p.title,
      company: p.company,
      location: p.location || "Unknown",
      workplace_type: p.workplace_type,
      compensation: p.raw_salary_text || (p.salary_min_annual ? `$${p.salary_min_annual.toLocaleString()} - $${(p.salary_max_annual || p.salary_min_annual).toLocaleString()}` : "Not listed"),
      job_status: p.job_status,
      jev_confidence: p.jev_confidence,
    }));

    return JSON.stringify({
      totalMatches: results.length,
      returnedCount: trimmed.length,
      jobs: trimmed,
    });
  }
}
