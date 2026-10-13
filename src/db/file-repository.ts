import { Application, UnifiedJobPosting } from "../types/job-posting.js";
import { DiscoveryRun, JobPostingRepository, ExistingJobMatch } from "./repository-interface.js";
import { calculateDashboardMetrics } from "./metrics.js";
import { Conversation, StoredConversation } from "../ai/agent/conversation.js";
import { AiUsageRecord, AiUsageSummary, DailyAiBudget, AiBudgetExceededError } from "../ai/usage-types.js";
import fs from "fs";
import path from "path";
import { NewRecommendationFeedback, RecommendationFeedback } from "../types/job-posting.js";
import {
  ApplicationDraft,
  ApplicationDraftListOptions,
  ApplicationDraftVersion,
  NewApplicationDraft,
  NewApplicationDraftSchema,
  ApplicationDraftSchema,
} from "../ai/application-drafts.js";

/**
 * High-performance file-backed repository for local development and offline operation.
 * Persists directly to ./data/job_tracker_store.json so data survives restarts
 * even if an external PostgreSQL database is not connected.
 */
export class FileJobRepository implements JobPostingRepository {
  private dataFilePath: string;
  private postings = new Map<string, UnifiedJobPosting>();
  private conversations = new Map<string, StoredConversation>();
  private applications = new Map<string, any>();
  private applicationDrafts = new Map<string, ApplicationDraft>();
  private profiles = new Map<string, any>();
  private statusHistory: Array<{
    id: string;
    job_posting_id: string;
    previous_status: string | null;
    new_status: string;
    changed_by: string;
    reason?: string | null;
    created_at: string;
  }> = [];
  private discoveryRuns = new Map<string, DiscoveryRun>();
  private aiUsage = new Map<string, AiUsageRecord>();
  private recommendationFeedback = new Map<string, RecommendationFeedback>();

  constructor(filePath?: string) {
    this.dataFilePath = filePath || path.join(process.cwd(), "data", "job_tracker_store.json");
    this.loadFromDisk();
  }

  private loadFromDisk() {
    try {
      const dir = path.dirname(this.dataFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      if (fs.existsSync(this.dataFilePath)) {
        const raw = fs.readFileSync(this.dataFilePath, "utf8");
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.postings)) {
          for (const p of parsed.postings) {
            this.postings.set(p.id, p);
          }
        }
        if (Array.isArray(parsed.conversations)) {
          for (const c of parsed.conversations) {
            this.conversations.set(c.id, c);
          }
        }
        if (Array.isArray(parsed.applications)) {
          for (const a of parsed.applications) {
            this.applications.set(a.id, a);
          }
        }
        if (Array.isArray(parsed.applicationDrafts)) {
          for (const draft of parsed.applicationDrafts) {
            const validated = ApplicationDraftSchema.safeParse(draft);
            if (validated.success) this.applicationDrafts.set(validated.data.id, validated.data);
          }
        }
        if (Array.isArray(parsed.statusHistory)) {
          this.statusHistory = parsed.statusHistory;
        }
        if (Array.isArray(parsed.discoveryRuns)) {
          for (const run of parsed.discoveryRuns) {
            this.discoveryRuns.set(run.id, run);
          }
        }
        if (Array.isArray(parsed.aiUsage)) {
          for (const record of parsed.aiUsage) {
            this.aiUsage.set(record.id, record);
          }
          if (Array.isArray(parsed.recommendationFeedback)) {
            for (const feedback of parsed.recommendationFeedback) {
              this.recommendationFeedback.set(feedback.id, feedback);
            }
          }
        }
        if (parsed.profiles && typeof parsed.profiles === "object") {
          for (const [k, v] of Object.entries(parsed.profiles)) {
            this.profiles.set(k, v);
          }
        }
      }
    } catch (err) {
      console.warn("[FileJobRepository] Failed to read disk store:", err);
      throw err;
    }
  }

  private saveToDisk() {
    try {
      const dir = path.dirname(this.dataFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const payload = {
        updatedAt: new Date().toISOString(),
        totalPostings: this.postings.size,
        totalConversations: this.conversations.size,
        totalApplications: this.applications.size,
        totalApplicationDrafts: this.applicationDrafts.size,
        postings: Array.from(this.postings.values()),
        conversations: Array.from(this.conversations.values()),
        applications: Array.from(this.applications.values()),
        applicationDrafts: Array.from(this.applicationDrafts.values()),
        statusHistory: this.statusHistory,
        discoveryRuns: Array.from(this.discoveryRuns.values()),
        aiUsage: Array.from(this.aiUsage.values()),
        recommendationFeedback: Array.from(this.recommendationFeedback.values()),
        profiles: Object.fromEntries(this.profiles.entries()),
      };

      fs.writeFileSync(this.dataFilePath, JSON.stringify(payload, null, 2), "utf8");
    } catch (err) {
      console.error("[FileJobRepository] Failed to persist data to disk:", err);
      throw err;
    }
  }

  async findExisting(criteria: {
    source: string;
    sourceJobId?: string | null;
    canonicalUrl?: string | null;
  }): Promise<ExistingJobMatch | null> {
    const { source, sourceJobId, canonicalUrl } = criteria;

    for (const posting of this.postings.values()) {
      // Tier 1: exact source + sourceJobId
      if (sourceJobId && posting.source === source && posting.source_job_id === sourceJobId) {
        return {
          id: posting.id,
          source: posting.source,
          source_job_id: posting.source_job_id || null,
          canonical_url: posting.canonical_url || null,
          content_hash: posting.content_hash,
          job_status: posting.job_status,
          availability: posting.availability,
        };
      }

      // Tier 2: canonicalUrl match
      if (canonicalUrl && posting.canonical_url === canonicalUrl) {
        return {
          id: posting.id,
          source: posting.source,
          source_job_id: posting.source_job_id || null,
          canonical_url: posting.canonical_url || null,
          content_hash: posting.content_hash,
          job_status: posting.job_status,
          availability: posting.availability,
        };
      }
    }

    return null;
  }

  async savePosting(posting: UnifiedJobPosting): Promise<UnifiedJobPosting> {
    this.postings.set(posting.id, posting);
    this.saveToDisk();
    return posting;
  }

  async updateAvailability(id: string, availability: string, evidence?: string): Promise<void> {
    const p = this.postings.get(id);
    if (p) {
      p.availability = availability as any;
      p.availability_evidence = evidence || null;
      if (availability === "open") p.availability_check_failures = 0;
      p.last_checked_at = new Date().toISOString();
      p.updated_at = new Date().toISOString();
      this.saveToDisk();
    }
  }

  async updatePostingContent(
    id: string,
    updates: {
      description_text?: string;
      content_hash: string;
      crawler_data?: any;
      availability?: string;
    }
  ): Promise<void> {
    const p = this.postings.get(id);
    if (p) {
      p.content_hash = updates.content_hash;
      if (updates.description_text) p.description_text = updates.description_text;
      if (updates.crawler_data) p.crawler_data = updates.crawler_data;
      if (updates.availability) {
        p.availability = updates.availability as any;
        if (updates.availability === "open") p.availability_check_failures = 0;
      }
      p.last_checked_at = new Date().toISOString();
      p.updated_at = new Date().toISOString();
      this.saveToDisk();
    }
  }

  async updateStatus(id: string, newStatus: string, changedBy: string, reason?: string): Promise<void> {
    const p = this.postings.get(id);
    if (p) {
      const prev = p.job_status;
      p.job_status = newStatus as any;
      p.updated_at = new Date().toISOString();

      this.statusHistory.push({
        id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        job_posting_id: id,
        previous_status: prev,
        new_status: newStatus,
        changed_by: changedBy,
        reason: reason || null,
        created_at: new Date().toISOString(),
      });

      this.saveToDisk();
    }
  }

  async getById(id: string): Promise<UnifiedJobPosting | null> {
    return this.postings.get(id) || null;
  }

  async listPostings(filters?: {
    jobStatus?: string;
    availability?: string;
    company?: string;
    missingSalary?: boolean;
    missingLocation?: boolean;
    sortBy?: "created_at" | "jev_confidence";
    sortOrder?: "asc" | "desc";
    limit?: number;
    offset?: number;
  }): Promise<UnifiedJobPosting[]> {
    let list = Array.from(this.postings.values());

    if (filters?.jobStatus) {
      list = list.filter((p) => p.job_status === filters.jobStatus);
    }
    if (filters?.availability) {
      list = list.filter((p) => p.availability === filters.availability);
    }
    if (filters?.company) {
      const term = filters.company.toLowerCase();
      list = list.filter((p) => p.company.toLowerCase().includes(term));
    }
    if (filters?.missingSalary === true) {
      list = list.filter((p) => p.salary_min_annual == null && p.salary_max_annual == null);
    }
    if (filters?.missingLocation === true) {
      list = list.filter((p) => !p.location);
    }

    const sortDir = filters?.sortOrder?.toUpperCase() === "ASC" ? 1 : -1;

    if (filters?.sortBy === "jev_confidence") {
      list.sort((a, b) => {
        const valA = a.jev_confidence ?? -1;
        const valB = b.jev_confidence ?? -1;
        return (valA - valB) * sortDir;
      });
    } else {
      list.sort((a, b) => {
        const timeA = new Date(a.created_at).getTime();
        const timeB = new Date(b.created_at).getTime();
        return (timeA - timeB) * sortDir;
      });
    }

    const offset = filters?.offset || 0;
    const limit = filters?.limit || 50;
    return list.slice(offset, offset + limit);
  }

  async saveConversation(conversation: Conversation): Promise<Conversation> {
    this.conversations.set(conversation.id, conversation.toJSON());
    this.saveToDisk();
    return conversation;
  }

  async getConversation(id: string): Promise<Conversation | null> {
    const stored = this.conversations.get(id);
    if (!stored) return null;
    return Conversation.fromJSON(stored);
  }

  async listConversations(filter?: { jobId?: string; limit?: number }): Promise<Conversation[]> {
    let list = Array.from(this.conversations.values());

    if (filter?.jobId) {
      list = list.filter((c) => c.job_ids.includes(filter.jobId!));
    }

    list.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

    if (filter?.limit) {
      list = list.slice(0, filter.limit);
    }

    return list.map((c) => Conversation.fromJSON(c));
  }

  async deleteConversation(id: string): Promise<void> {
    this.conversations.delete(id);
    this.saveToDisk();
  }

  async reserveAiUsage(record: AiUsageRecord, budget?: DailyAiBudget): Promise<void> {
    if (this.aiUsage.has(record.id)) {
      throw new Error(`AI usage record ${record.id} already exists`);
    }
    if (budget && record.role === "owner") {
      const today = Array.from(this.aiUsage.values())
        .filter((entry) => entry.role === "owner" && entry.started_at >= budget.starts_at);
      const usedTokens = today.reduce(
        (total, entry) => total + (entry.total_tokens ?? entry.estimated_input_tokens),
        0
      );
      if (today.length >= budget.max_requests) {
        throw new AiBudgetExceededError("requests", budget.max_requests, today.length, budget.resets_at);
      }
      if (usedTokens + record.estimated_input_tokens > budget.max_tokens) {
        throw new AiBudgetExceededError("tokens", budget.max_tokens, usedTokens, budget.resets_at);
      }
    }
    this.aiUsage.set(record.id, { ...record });
    this.saveToDisk();
  }

  async finishAiUsage(
    id: string,
    result: Pick<AiUsageRecord, "completed_at" | "input_tokens" | "output_tokens" | "total_tokens" | "latency_ms" | "status" | "error_code">
  ): Promise<void> {
    const record = this.aiUsage.get(id);
    if (!record) throw new Error(`AI usage record ${id} does not exist`);
    this.aiUsage.set(id, { ...record, ...result });
    this.saveToDisk();
  }

  async getAiUsageSummary(startsAt: string): Promise<AiUsageSummary> {
    const records = Array.from(this.aiUsage.values()).filter((record) => record.started_at >= startsAt);
    const summarize = (role: "owner" | "guest") => {
      const matches = records.filter((record) => record.role === role);
      return {
        requests: matches.length,
        tokens: matches.reduce(
          (total, record) => total + (record.total_tokens ?? record.estimated_input_tokens),
          0
        ),
      };
    };
    const owner = summarize("owner");
    const guest = summarize("guest");
    return {
      owner_requests: owner.requests,
      owner_tokens: owner.tokens,
      guest_requests: guest.requests,
      guest_tokens: guest.tokens,
    };
  }

  async listRecommendationFeedback(jobPostingId: string): Promise<RecommendationFeedback[]> {
    return Array.from(this.recommendationFeedback.values())
      .filter((feedback) => feedback.job_posting_id === jobPostingId)
      .sort((left, right) =>
        left.created_at.localeCompare(right.created_at) || left.id.localeCompare(right.id)
      );
  }

  async listActiveRecommendationFeedback(jobPostingIds: string[]): Promise<RecommendationFeedback[]> {
    if (jobPostingIds.length === 0) return [];
    const requested = new Set(jobPostingIds);
    return Array.from(this.recommendationFeedback.values())
      .filter((feedback) => requested.has(feedback.job_posting_id) && !feedback.retracted_at)
      .sort((left, right) => left.created_at.localeCompare(right.created_at));
  }

  async recordRecommendationFeedback(
    input: NewRecommendationFeedback
  ): Promise<RecommendationFeedback> {
    if (!this.postings.has(input.job_posting_id)) {
      throw new Error(`Job posting ${input.job_posting_id} does not exist`);
    }
    if (this.recommendationFeedback.has(input.id)) {
      throw new Error(`Recommendation feedback ${input.id} already exists`);
    }
    const now = new Date().toISOString();
    const replaced: RecommendationFeedback[] = [];
    for (const [id, feedback] of this.recommendationFeedback) {
      if (feedback.job_posting_id !== input.job_posting_id || feedback.retracted_at) continue;
      const retracted: RecommendationFeedback = {
        ...feedback,
        retracted_at: now,
        retraction_reason: "replaced",
        replaced_by_id: input.id,
      };
      this.recommendationFeedback.set(id, retracted);
      replaced.push(retracted);
    }
    const record: RecommendationFeedback = {
      ...input,
      reason_code: input.reason_code ?? null,
      explanation: input.explanation ?? null,
      created_at: now,
      retracted_at: null,
      replaced_by_id: null,
      retraction_reason: null,
    };
    this.recommendationFeedback.set(record.id, record);
    this.saveToDisk();
    return { ...record };
  }

  async retractRecommendationFeedback(
    jobPostingId: string
  ): Promise<RecommendationFeedback | null> {
    const active = Array.from(this.recommendationFeedback.values())
      .filter((feedback) => feedback.job_posting_id === jobPostingId && !feedback.retracted_at)
      .sort((left, right) => right.created_at.localeCompare(left.created_at))[0];
    if (!active) return null;
    const retracted: RecommendationFeedback = {
      ...active,
      retracted_at: new Date().toISOString(),
      retraction_reason: "user_retracted",
    };
    this.recommendationFeedback.set(active.id, retracted);
    this.saveToDisk();
    return { ...retracted };
  }

  // Application Tracking Methods
  async createManualApplication(posting: UnifiedJobPosting, application: Application): Promise<Application> {
    const now = new Date().toISOString();
    const savedApplication: Application = {
      ...application,
      created_at: application.created_at || now,
      updated_at: now,
    };
    this.postings.set(posting.id, posting);
    this.applications.set(savedApplication.id, savedApplication);
    this.saveToDisk();
    return savedApplication;
  }

  async saveApplication(app: any): Promise<any> {
    const existing = this.applications.get(app.id);
    const now = new Date().toISOString();
    const toSave = {
      ...app,
      created_at: existing ? existing.created_at : app.created_at || now,
      updated_at: now,
      stage_history: app.stage_history || (existing ? existing.stage_history : []),
    };
    this.applications.set(toSave.id, toSave);
    this.saveToDisk();
    return toSave;
  }

  async getApplication(id: string): Promise<any | null> {
    return this.applications.get(id) || null;
  }

  async getApplicationByJobId(jobId: string): Promise<any | null> {
    for (const app of this.applications.values()) {
      if (app.job_posting_id === jobId) {
        return app;
      }
    }
    return null;
  }

  async listApplications(filter?: { status?: string }): Promise<any[]> {
    let list = Array.from(this.applications.values());
    if (filter?.status) {
      list = list.filter((a) => a.status === filter.status);
    }
    // Enrich with posting summary
    return list.map((app) => {
      const job = this.postings.get(app.job_posting_id);
      return {
        ...app,
        job: job
          ? {
              id: job.id,
              title: job.title,
              company: job.company,
              location: job.location,
              workplace_type: job.workplace_type,
              salary_min_annual: job.salary_min_annual,
              salary_max_annual: job.salary_max_annual,
              canonical_url: job.canonical_url,
              application_url: job.application_url,
            }
          : undefined,
      };
    });
  }

  async deleteApplication(id: string): Promise<void> {
    this.applications.delete(id);
    this.saveToDisk();
  }

  async createApplicationDraft(input: NewApplicationDraft): Promise<ApplicationDraft> {
    const parsed = NewApplicationDraftSchema.parse(input);
    if (!this.postings.has(parsed.job_posting_id)) {
      throw new Error(`Job posting ${parsed.job_posting_id} not found for application draft`);
    }
    if (parsed.draft_type === "application_answer" && !parsed.question?.trim()) {
      throw new Error("Application-answer drafts require the original question");
    }
    if (parsed.sensitive && parsed.author !== "user") {
      throw new Error("Sensitive application answers can only be authored by the user");
    }
    if (this.applicationDrafts.has(parsed.id)) {
      throw new Error(`Application draft ${parsed.id} already exists`);
    }

    const now = new Date().toISOString();
    const version: ApplicationDraftVersion = {
      version: 1,
      content: parsed.content,
      subject_line: parsed.subject_line ?? null,
      source_facts: parsed.source_facts,
      assumptions: parsed.assumptions,
      author: parsed.author,
      model_id: parsed.model_id ?? null,
      prompt_version: parsed.prompt_version ?? null,
      created_at: now,
      approved_at: null,
      approved_by: null,
    };
    const draft = ApplicationDraftSchema.parse({
      id: parsed.id,
      job_posting_id: parsed.job_posting_id,
      conversation_id: parsed.conversation_id ?? null,
      draft_type: parsed.draft_type,
      question: parsed.question ?? null,
      sensitive: parsed.sensitive ?? false,
      status: "draft",
      current_version: 1,
      versions: [version],
      created_at: now,
      updated_at: now,
    });
    this.applicationDrafts.set(draft.id, draft);
    this.saveToDisk();
    return draft;
  }

  async getApplicationDraft(id: string): Promise<ApplicationDraft | null> {
    const draft = this.applicationDrafts.get(id);
    return draft ? ApplicationDraftSchema.parse(draft) : null;
  }

  async listApplicationDrafts(
    options?: ApplicationDraftListOptions
  ): Promise<ApplicationDraft[]> {
    let drafts = Array.from(this.applicationDrafts.values());
    if (options?.jobPostingId) {
      drafts = drafts.filter((draft) => draft.job_posting_id === options.jobPostingId);
    }
    if (options?.draftType) {
      drafts = drafts.filter((draft) => draft.draft_type === options.draftType);
    }
    if (options?.status) {
      drafts = drafts.filter((draft) => draft.status === options.status);
    }
    if (options?.hasApprovedVersion) {
      drafts = drafts.filter((draft) =>
        draft.versions.some((version) => version.approved_at !== null)
      );
    }
    if (options?.includeSensitive !== true) {
      drafts = drafts.filter((draft) => !draft.sensitive);
    }
    drafts.sort((left, right) => right.updated_at.localeCompare(left.updated_at));
    const limit = Math.max(1, Math.min(options?.limit ?? 100, 500));
    return drafts.slice(0, limit).map((draft) => ApplicationDraftSchema.parse(draft));
  }

  async updateApplicationDraft(id: string, content: string): Promise<ApplicationDraft | null> {
    const existing = this.applicationDrafts.get(id);
    if (!existing) return null;
    if (content.trim().length === 0 || content.length > 20_000) {
      throw new Error("Draft text must contain 1 to 20,000 characters");
    }
    const current = existing.versions.find((version) => version.version === existing.current_version);
    if (!current) throw new Error(`Current version is missing for application draft ${id}`);
    const now = new Date().toISOString();
    const version: ApplicationDraftVersion = {
      version: existing.current_version + 1,
      content,
      subject_line: current.subject_line,
      source_facts: current.source_facts,
      assumptions: current.assumptions,
      author: "user",
      model_id: null,
      prompt_version: null,
      created_at: now,
      approved_at: null,
      approved_by: null,
    };
    const updated = ApplicationDraftSchema.parse({
      ...existing,
      status: "draft",
      current_version: version.version,
      versions: [...existing.versions, version],
      updated_at: now,
    });
    this.applicationDrafts.set(id, updated);
    this.saveToDisk();
    return updated;
  }

  async approveApplicationDraft(id: string): Promise<ApplicationDraft | null> {
    const existing = this.applicationDrafts.get(id);
    if (!existing) return null;
    const now = new Date().toISOString();
    const versions = existing.versions.map((version) =>
      version.version === existing.current_version
        ? { ...version, approved_at: version.approved_at ?? now, approved_by: "owner" }
        : version
    );
    const updated = ApplicationDraftSchema.parse({
      ...existing,
      status: "approved",
      versions,
      updated_at: now,
    });
    this.applicationDrafts.set(id, updated);
    this.saveToDisk();
    return updated;
  }

  // Discovery Run & Metrics Querying
  async getMetrics(options?: { startDate?: string; endDate?: string }) {
    return calculateDashboardMetrics(
      Array.from(this.postings.values()),
      Array.from(this.applications.values()),
      options
    );
  }

  async saveDiscoveryRun(run: DiscoveryRun): Promise<void> {
    this.discoveryRuns.set(run.id, { ...run });
    this.saveToDisk();
  }

  async listDiscoveryRuns(options?: {
    limit?: number;
    status?: DiscoveryRun["status"];
  }): Promise<DiscoveryRun[]> {
    let runs = Array.from(this.discoveryRuns.values());
    if (options?.status) runs = runs.filter((run) => run.status === options.status);
    runs.sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at));
    return runs.slice(0, Math.max(1, Math.min(options?.limit ?? 50, 500)));
  }

  async claimDiscoveryRun(id: string, maxAttempts: number): Promise<DiscoveryRun | null> {
    const run = this.discoveryRuns.get(id);
    if (!run || run.status !== "queued" || run.attempt_count >= maxAttempts) return null;
    const claimed: DiscoveryRun = {
      ...run,
      status: "running",
      attempt_count: run.attempt_count + 1,
      started_at: new Date().toISOString(),
      completed_at: null,
    };
    this.discoveryRuns.set(id, claimed);
    this.saveToDisk();
    return { ...claimed };
  }

  async recoverInterruptedDiscoveryRuns(staleBefore: string, maxAttempts: number): Promise<number> {
    const cutoff = Date.parse(staleBefore);
    let recovered = 0;
    for (const [id, run] of this.discoveryRuns) {
      if (run.status !== "running" || Date.parse(run.started_at) >= cutoff) continue;
      const canRetry = run.attempt_count < maxAttempts;
      this.discoveryRuns.set(id, {
        ...run,
        status: canRetry ? "queued" : "failed",
        error_message: run.error_message || `Interrupted while running; ${canRetry ? "queued for recovery" : "retry limit exhausted"}`,
        error_count: Math.max(1, run.error_count),
        completed_at: canRetry ? null : new Date().toISOString(),
      });
      recovered++;
    }
    if (recovered > 0) this.saveToDisk();
    return recovered;
  }

  async recordAvailabilityCheck(
    id: string,
    status: "open" | "closed" | "unknown",
    evidence: string,
    checkedAt = new Date().toISOString()
  ): Promise<number> {
    const posting = this.postings.get(id);
    if (!posting) return 0;
    const failures = status === "unknown"
      ? (posting.availability_check_failures ?? 0) + 1
      : 0;
    posting.availability = status;
    posting.availability_evidence = evidence;
    posting.availability_check_failures = failures;
    posting.last_checked_at = checkedAt;
    posting.updated_at = checkedAt;
    this.saveToDisk();
    return failures;
  }

  async saveUserProfile(key: string, data: any): Promise<void> {
    this.profiles.set(key, data);
    this.saveToDisk();
  }

  async getUserProfile(key: string): Promise<any | null> {
    return this.profiles.get(key) || null;
  }
}
