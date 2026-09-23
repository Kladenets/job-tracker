import { UnifiedJobPosting } from "../types/job-posting";
import { JobPostingRepository, ExistingJobMatch } from "./repository-interface";
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
        if (Array.isArray(parsed.statusHistory)) {
          this.statusHistory = parsed.statusHistory;
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
        postings: Array.from(this.postings.values()),
        statusHistory: this.statusHistory,
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

    list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const offset = filters?.offset || 0;
    const limit = filters?.limit || 50;
    return list.slice(offset, offset + limit);
  }
}
