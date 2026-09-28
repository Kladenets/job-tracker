import { UnifiedJobPosting } from "../types/job-posting";
import { Conversation } from "../ai/agent/conversation";

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
  updatePostingContent(
    id: string,
    updates: {
      description_text?: string;
      content_hash: string;
      crawler_data?: any;
      availability?: string;
    }
  ): Promise<void>;
  updateStatus(id: string, newStatus: string, changedBy: string, reason?: string): Promise<void>;
  getById(id: string): Promise<UnifiedJobPosting | null>;
  listPostings(filters?: {
    jobStatus?: string;
    availability?: string;
    company?: string;
    missingSalary?: boolean;
    missingLocation?: boolean;
    sortBy?: "created_at" | "jev_confidence";
    sortOrder?: "asc" | "desc";
    limit?: number;
    offset?: number;
  }): Promise<UnifiedJobPosting[]>;

  // Conversation & AI Agent History Persistence
  saveConversation(conversation: Conversation): Promise<Conversation>;
  getConversation(id: string): Promise<Conversation | null>;
  listConversations(filter?: { jobId?: string; limit?: number }): Promise<Conversation[]>;
  deleteConversation(id: string): Promise<void>;

  // Application Tracking Persistence
  saveApplication(app: any): Promise<any>;
  getApplication(id: string): Promise<any | null>;
  getApplicationByJobId(jobId: string): Promise<any | null>;
  listApplications(filter?: { status?: string }): Promise<any[]>;
  deleteApplication(id: string): Promise<void>;

  // Discovery Run & Metrics Querying
  getMetrics(options?: { startDate?: string; endDate?: string }): Promise<any>;
}
