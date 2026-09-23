import { UnifiedJobPosting } from "../types/job-posting";

export interface ExistingJobMatch {
  id: string;
  source: string;
  source_job_id: string | null;
  canonical_url: string | null;
  content_hash: string;
  job_status: string;
  availability: string;
}

export interface IngestionResult {
  isNew: boolean;
  job: UnifiedJobPosting;
  reason?: string;
}

export interface JobPostingRepository {
  findExisting(criteria: {
    source: string;
    sourceJobId?: string | null;
    canonicalUrl?: string | null;
  }): Promise<ExistingJobMatch | null>;

  savePosting(posting: UnifiedJobPosting): Promise<UnifiedJobPosting>;
  updateAvailability(id: string, availability: string, evidence?: string): Promise<void>;
  updateStatus(id: string, newStatus: string, changedBy: string, reason?: string): Promise<void>;
  getById(id: string): Promise<UnifiedJobPosting | null>;
  listPostings(filters?: {
    jobStatus?: string;
    availability?: string;
    company?: string;
    limit?: number;
    offset?: number;
  }): Promise<UnifiedJobPosting[]>;
}
