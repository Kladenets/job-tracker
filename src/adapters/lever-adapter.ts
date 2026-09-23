import { RawJobPosting } from "../types/job";
import { SourceAdapter } from "./adapter-interface";

export interface LeverPostingCategory {
  commitment?: string;
  department?: string;
  team?: string;
  location?: string;
  allLocations?: string[];
}

export interface LeverPostingItem {
  id: string;
  text: string;
  createdAt: number;
  descriptionPlain?: string;
  description?: string;
  additionalPlain?: string;
  hostedUrl: string;
  applyUrl: string;
  workplaceType?: "remote" | "hybrid" | "onsite" | string;
  categories?: LeverPostingCategory;
  country?: string;
}

export class LeverAdapter implements SourceAdapter {
  readonly sourceName = "lever";

  /**
   * Fetch public job postings from Lever for a company.
   * e.g., company: "palantir", "figma", "spotify", etc.
   */
  async fetchJobs(params: {
    company: string;
    searchTerm?: string;
    group?: string;
  }): Promise<RawJobPosting[]> {
    const { company, searchTerm } = params;
    const url = `https://api.lever.co/v0/postings/${encodeURIComponent(company)}?mode=json`;

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Lever API responded with HTTP ${res.status} for company '${company}'`);
    }

    const data = (await res.json()) as LeverPostingItem[];
    if (!Array.isArray(data)) {
      throw new Error(`Invalid response structure from Lever for company '${company}'`);
    }

    const resolvedCompany = company.charAt(0).toUpperCase() + company.slice(1);
    const postings: RawJobPosting[] = [];
    const termLower = searchTerm?.toLowerCase().trim();

    for (const job of data) {
      if (termLower) {
        const matchesTitle = job.text?.toLowerCase().includes(termLower);
        const matchesLoc = job.categories?.location?.toLowerCase().includes(termLower);
        const matchesTeam = job.categories?.team?.toLowerCase().includes(termLower);
        if (!matchesTitle && !matchesLoc && !matchesTeam) {
          continue;
        }
      }

      const locationStr = job.categories?.location || "";
      const isRemote =
        job.workplaceType === "remote" ||
        locationStr.toLowerCase().includes("remote") ||
        job.text.toLowerCase().includes("remote");

      // Full plain text description combined from intro, body, and additional notes
      const fullDescription = [
        job.descriptionPlain || "",
        job.additionalPlain || "",
      ]
        .filter(Boolean)
        .join("\n\n---\n\n")
        .trim();

      postings.push({
        id: job.id,
        site: "lever",
        job_url: job.hostedUrl,
        job_url_direct: job.applyUrl || job.hostedUrl,
        title: job.text,
        company: resolvedCompany,
        location: locationStr || null,
        date_posted: job.createdAt ? new Date(job.createdAt).toISOString() : null,
        job_type: job.categories?.commitment || "Full-time",
        is_remote: isRemote,
        description: fullDescription,
        company_industry: job.categories?.team || null,
        company_url: `https://jobs.lever.co/${company}`,
      });
    }

    return postings;
  }

  /**
   * Check if a specific posting on Lever is still open.
   */
  async checkAvailability(
    sourceJobId: string,
    extra?: { company?: string }
  ): Promise<{ status: "open" | "closed" | "unknown"; evidence?: string }> {
    const company = extra?.company;
    if (!company) {
      return {
        status: "unknown",
        evidence: "Missing company for Lever job check",
      };
    }

    try {
      const url = `https://api.lever.co/v0/postings/${encodeURIComponent(company)}/${encodeURIComponent(sourceJobId)}`;
      const res = await fetch(url);
      if (res.status === 200) {
        return { status: "open", evidence: "Found active job record via Lever API" };
      }
      if (res.status === 404) {
        return { status: "closed", evidence: "Lever API returned 404 (posting closed/unlisted)" };
      }
      return { status: "unknown", evidence: `Unexpected status code: ${res.status}` };
    } catch (err: unknown) {
      return { status: "unknown", evidence: `Network check failed: ${String(err)}` };
    }
  }
}
