import {
  Application,
  NewRecommendationFeedback,
  RecommendationFeedback,
  UnifiedJobPosting,
} from "../types/job-posting.js";
import { Conversation } from "../ai/agent/conversation.js";
import { DashboardMetrics, MetricsOptions } from "./metrics.js";
import { AiUsageRecord, AiUsageSummary, DailyAiBudget } from "../ai/usage-types.js";
import type {
  ApplicationDraft,
  ApplicationDraftListOptions,
  NewApplicationDraft,
} from "../ai/application-drafts.js";

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

export interface DiscoveryRun {
  id: string;
  batch_id: string;
  source: string;
  trigger_type: "manual" | "scheduled";
  status: "queued" | "running" | "completed" | "failed";
  total_found: number;
  new_imported: number;
  duplicates_seen: number;
  filtered_out: number;
  screened_with_jev: number;
  recommended: number;
  error_count: number;
  error_message: string | null;
  attempt_count: number;
  started_at: string;
  completed_at: string | null;
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

  // Outbound AI request accounting and atomic owner daily-budget reservations
  reserveAiUsage(record: AiUsageRecord, budget?: DailyAiBudget): Promise<void>;
  finishAiUsage(
    id: string,
    result: Pick<AiUsageRecord, "completed_at" | "input_tokens" | "output_tokens" | "total_tokens" | "latency_ms" | "status" | "error_code">
  ): Promise<void>;
  getAiUsageSummary(startsAt: string): Promise<AiUsageSummary>;

  // Explicit preference signals, separate from review and application workflow status
  listRecommendationFeedback(jobPostingId: string): Promise<RecommendationFeedback[]>;
  listActiveRecommendationFeedback(jobPostingIds: string[]): Promise<RecommendationFeedback[]>;
  recordRecommendationFeedback(input: NewRecommendationFeedback): Promise<RecommendationFeedback>;
  retractRecommendationFeedback(jobPostingId: string): Promise<RecommendationFeedback | null>;

  // Application Tracking Persistence
  createManualApplication(posting: UnifiedJobPosting, application: Application): Promise<Application>;
  saveApplication(app: any): Promise<any>;
  getApplication(id: string): Promise<any | null>;
  getApplicationByJobId(jobId: string): Promise<any | null>;
  listApplications(filter?: { status?: string }): Promise<any[]>;
  deleteApplication(id: string): Promise<void>;

  // User-reviewed application answer and cover-letter drafts
  createApplicationDraft(input: NewApplicationDraft): Promise<ApplicationDraft>;
  getApplicationDraft(id: string): Promise<ApplicationDraft | null>;
  listApplicationDrafts(options?: ApplicationDraftListOptions): Promise<ApplicationDraft[]>;
  updateApplicationDraft(id: string, content: string): Promise<ApplicationDraft | null>;
  approveApplicationDraft(id: string): Promise<ApplicationDraft | null>;

  // Discovery Run & Metrics Querying
  getMetrics(options?: MetricsOptions): Promise<DashboardMetrics>;
  saveDiscoveryRun(run: DiscoveryRun): Promise<void>;
  listDiscoveryRuns(options?: { limit?: number; status?: DiscoveryRun["status"] }): Promise<DiscoveryRun[]>;
  claimDiscoveryRun(id: string, maxAttempts: number): Promise<DiscoveryRun | null>;
  recoverInterruptedDiscoveryRuns(staleBefore: string, maxAttempts: number): Promise<number>;
  recordAvailabilityCheck(
    id: string,
    status: "open" | "closed" | "unknown",
    evidence: string,
    checkedAt?: string
  ): Promise<number>;

  // User Profile, Search Profile & Resume Persistence
  saveUserProfile(key: string, data: any): Promise<void>;
  getUserProfile(key: string): Promise<any | null>;
}
