import { RawJobPosting } from "../types/job.js";
import { SourceAdapter } from "./adapter-interface.js";
import { runJobSpyScraper } from "../bridges/jobspy-bridge.js";

export class JobSpyAdapter implements SourceAdapter {
  readonly sourceName = "jobspy";

  async fetchJobs(params: {
    searchTerm?: string;
    location?: string;
    distance?: number;
    isRemote?: boolean;
    resultsWanted?: number;
    sites?: string[];
    countryCode?: string;
    hoursOld?: number;
    signal?: AbortSignal;
  }): Promise<RawJobPosting[]> {
    const result = await runJobSpyScraper({
      searchTerm: params.searchTerm || "Software Engineer",
      location: params.location || "Doylestown, PA",
      distance: params.distance ?? 35,
      isRemote: params.isRemote ?? false,
      resultsWanted: params.resultsWanted ?? 5,
      sites: params.sites || ["indeed", "google"],
      countryCode: params.countryCode || "USA",
      hoursOld: params.hoursOld ?? 72,
    }, { signal: params.signal });

    if (!result.success && result.jobs.length === 0) {
      throw new Error(
        `JobSpy scrape failed: ${Object.values(result.errors).join("; ") || "unknown bridge failure"}`
      );
    }
    return result.jobs;
  }

  async checkAvailability(
    _sourceJobId: string,
    _extra?: Record<string, unknown>
  ): Promise<{ status: "open" | "closed" | "unknown"; evidence?: string }> {
    // JobSpy uses scraped search queries without dedicated single-job status endpoints
    return {
      status: "unknown",
      evidence: "JobSpy source requires search query refresh or page scrape check",
    };
  }
}
