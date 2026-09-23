import { RawJobPosting } from "../types/job";

export interface SourceAdapter {
  readonly sourceName: string;
  fetchJobs(params: Record<string, unknown>): Promise<RawJobPosting[]>;
  checkAvailability(sourceJobId: string, extra?: Record<string, unknown>): Promise<{
    status: "open" | "closed" | "unknown";
    evidence?: string;
  }>;
}
