import { Application, UnifiedJobPosting } from "../types/job-posting";
import { JobPostingRepository, ExistingJobMatch } from "./repository-interface";
import { calculateDashboardMetrics } from "./metrics";
import { Conversation, StoredConversation } from "../ai/agent/conversation";
import fs from "fs";
import path from "path";

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
        if (Array.isArray(parsed.statusHistory)) {
          this.statusHistory = parsed.statusHistory;
        }
        if (parsed.profiles && typeof parsed.profiles === "object") {
          for (const [k, v] of Object.entries(parsed.profiles)) {
            this.profiles.set(k, v);
          }
        }
      }
    } catch (err) {
      console.warn("[FileJobRepository] Failed to read disk store:", err);
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
        postings: Array.from(this.postings.values()),
        conversations: Array.from(this.conversations.values()),
        applications: Array.from(this.applications.values()),
        statusHistory: this.statusHistory,
        profiles: Object.fromEntries(this.profiles.entries()),
      };

      fs.writeFileSync(this.dataFilePath, JSON.stringify(payload, null, 2), "utf8");
    } catch (err) {
      console.error("[FileJobRepository] Failed to persist data to disk:", err);
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
      if (updates.availability) p.availability = updates.availability as any;
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

  // Discovery Run & Metrics Querying
  async getMetrics(options?: { startDate?: string; endDate?: string }) {
    return calculateDashboardMetrics(
      Array.from(this.postings.values()),
      Array.from(this.applications.values()),
      options
    );
  }

  async saveUserProfile(key: string, data: any): Promise<void> {
    this.profiles.set(key, data);
    this.saveToDisk();
  }

  async getUserProfile(key: string): Promise<any | null> {
    return this.profiles.get(key) || null;
  }
}
