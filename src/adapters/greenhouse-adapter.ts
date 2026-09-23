import { RawJobPosting } from "../types/job";
import { SourceAdapter } from "./adapter-interface";

export interface GreenhouseJobSummary {
  id: number;
  internal_job_id?: number;
  title: string;
  absolute_url: string;
  updated_at?: string;
  requisition_id?: string;
  company_name?: string;
  location?: {
    name?: string;
  };
  content?: string;
  departments?: Array<{ id: number; name: string }>;
  offices?: Array<{ id: number; name: string; location?: string }>;
}

export interface GreenhouseBoardResponse {
  jobs: GreenhouseJobSummary[];
}

export class GreenhouseAdapter implements SourceAdapter {
  readonly sourceName = "greenhouse";

  /**
   * Strip HTML tags and decode common entities to plain text.
   */
  private cleanHtml(html?: string): string {
    if (!html) return "";
    let decoded = html
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, " ");

    return decoded
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<br\s*[\/]?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<\/li>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  /**
   * Fetch all postings or filtered postings from a company's public Greenhouse board.
   * e.g., boardToken: "gitlab", "stripe", "airbnb", etc.
   */
  async fetchJobs(params: {
    boardToken: string;
    companyName?: string;
    includeContent?: boolean;
    searchTerm?: string;
  }): Promise<RawJobPosting[]> {
    const { boardToken, companyName, includeContent = true, searchTerm } = params;
    const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(boardToken)}/jobs?content=${includeContent ? "true" : "false"}`;

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Greenhouse API responded with HTTP ${res.status} for board '${boardToken}'`);
    }

    const data = (await res.json()) as GreenhouseBoardResponse;
    const resolvedCompany = companyName || boardToken.charAt(0).toUpperCase() + boardToken.slice(1);

    const postings: RawJobPosting[] = [];
    const termLower = searchTerm?.toLowerCase().trim();

    for (const job of data.jobs || []) {
      if (termLower) {
        const matchesTitle = job.title?.toLowerCase().includes(termLower);
        const matchesLocation = job.location?.name?.toLowerCase().includes(termLower);
        if (!matchesTitle && !matchesLocation) {
          continue;
        }
      }

      const locationStr = job.location?.name || "";
      const isRemote =
        locationStr.toLowerCase().includes("remote") ||
        job.title.toLowerCase().includes("remote");

      postings.push({
        id: String(job.id),
        site: "greenhouse",
        job_url: job.absolute_url,
        job_url_direct: job.absolute_url,
        title: job.title,
        company: job.company_name || resolvedCompany,
        location: locationStr || null,
        date_posted: job.updated_at ? new Date(job.updated_at).toISOString() : null,
        job_type: "Full-time",
        is_remote: isRemote,
        description: this.cleanHtml(job.content),
        company_industry: null,
        company_url: `https://boards.greenhouse.io/${boardToken}`,
      });
    }

    return postings;
  }

  /**
   * Directly test if a specific job on Greenhouse is still open and accepting applications.
   */
  async checkAvailability(
    sourceJobId: string,
    extra?: { boardToken?: string }
  ): Promise<{ status: "open" | "closed" | "unknown"; evidence?: string }> {
    const boardToken = extra?.boardToken;
    if (!boardToken) {
      return {
        status: "unknown",
        evidence: "Missing boardToken for Greenhouse job check",
      };
    }

    try {
      const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(boardToken)}/jobs/${encodeURIComponent(sourceJobId)}`;
      const res = await fetch(url);
      if (res.status === 200) {
        return { status: "open", evidence: "Found active job record via Greenhouse API" };
      }
      if (res.status === 404) {
        return { status: "closed", evidence: "Greenhouse API returned 404 (posting closed/removed)" };
      }
      return { status: "unknown", evidence: `Unexpected status code: ${res.status}` };
    } catch (err: unknown) {
      return { status: "unknown", evidence: `Network check failed: ${String(err)}` };
    }
  }
}
