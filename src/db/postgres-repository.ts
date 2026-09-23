import { Pool } from "pg";
import { UnifiedJobPosting, UnifiedJobPostingSchema } from "../types/job-posting";
import { JobPostingRepository, ExistingJobMatch } from "./repository-interface";

export class PostgresJobRepository implements JobPostingRepository {
  constructor(private pool: Pool) {}

  /**
   * Fast two-tier deduplication check (crawler.md section 70)
   */
  async findExisting(criteria: {
    source: string;
    sourceJobId?: string | null;
    canonicalUrl?: string | null;
  }): Promise<ExistingJobMatch | null> {
    const { source, sourceJobId, canonicalUrl } = criteria;

    const query = `
      SELECT id, source, source_job_id, canonical_url, content_hash, job_status, availability
      FROM job_postings
      WHERE 
        ($1::text IS NOT NULL AND $2::text IS NOT NULL AND source = $1 AND source_job_id = $2)
        OR
        ($3::text IS NOT NULL AND canonical_url = $3)
      LIMIT 1;
    `;

    const res = await this.pool.query(query, [source, sourceJobId || null, canonicalUrl || null]);
    if (res.rows.length === 0) {
      return null;
    }

    const row = res.rows[0];
    return {
      id: row.id,
      source: row.source,
      source_job_id: row.source_job_id,
      canonical_url: row.canonical_url,
      content_hash: row.content_hash,
      job_status: row.job_status,
      availability: row.availability,
    };
  }

  /**
   * Inserts or updates a normalized posting
   */
  async savePosting(posting: UnifiedJobPosting): Promise<UnifiedJobPosting> {
    const query = `
      INSERT INTO job_postings (
        id, source, source_job_id, source_url, canonical_url, application_url, content_hash,
        title, company, location, workplace_type, employment_type, seniority,
        salary_min_annual, salary_max_annual, currency, interval, raw_salary_text,
        description_text, date_posted, date_discovered, last_checked_at,
        job_status, availability, availability_evidence,
        deterministic_score, ai_score,
        crawler_data, ai_analysis, user_overrides,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11, $12, $13,
        $14, $15, $16, $17, $18,
        $19, $20, $21, $22,
        $23, $24, $25,
        $26, $27,
        $28, $29, $30,
        $31, $32
      )
      ON CONFLICT (id) DO UPDATE SET
        last_checked_at = EXCLUDED.last_checked_at,
        availability = EXCLUDED.availability,
        availability_evidence = EXCLUDED.availability_evidence,
        crawler_data = EXCLUDED.crawler_data,
        updated_at = NOW()
      RETURNING *;
    `;

    const values = [
      posting.id,
      posting.source,
      posting.source_job_id || null,
      posting.source_url || null,
      posting.canonical_url || null,
      posting.application_url || null,
      posting.content_hash,

      posting.title,
      posting.company,
      posting.location || null,
      posting.workplace_type,
      posting.employment_type,
      posting.seniority,

      posting.salary_min_annual || null,
      posting.salary_max_annual || null,
      posting.currency,
      posting.interval || null,
      posting.raw_salary_text || null,

      posting.description_text,
      posting.date_posted || null,
      posting.date_discovered,
      posting.last_checked_at || null,

      posting.job_status,
      posting.availability,
      posting.availability_evidence || null,

      posting.deterministic_score || null,
      posting.ai_score || null,

      posting.crawler_data ? JSON.stringify(posting.crawler_data) : null,
      posting.ai_analysis ? JSON.stringify(posting.ai_analysis) : null,
      posting.user_overrides ? JSON.stringify(posting.user_overrides) : null,

      posting.created_at,
      posting.updated_at,
    ];

    const res = await this.pool.query(query, values);
    return this.mapRowToPosting(res.rows[0]);
  }

  async updateAvailability(id: string, availability: string, evidence?: string): Promise<void> {
    await this.pool.query(
      `UPDATE job_postings 
       SET availability = $1, availability_evidence = $2, last_checked_at = NOW(), updated_at = NOW() 
       WHERE id = $3`,
      [availability, evidence || null, id]
    );
  }

  async updateStatus(id: string, newStatus: string, changedBy: string, reason?: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const curr = await client.query("SELECT job_status FROM job_postings WHERE id = $1 FOR UPDATE", [id]);
      const prevStatus = curr.rows[0]?.job_status || null;

      await client.query(
        "UPDATE job_postings SET job_status = $1, updated_at = NOW() WHERE id = $2",
        [newStatus, id]
      );

      await client.query(
        `INSERT INTO job_status_history (id, job_posting_id, previous_status, new_status, changed_by, reason, created_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW())`,
        [id, prevStatus, newStatus, changedBy, reason || null]
      );

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async getById(id: string): Promise<UnifiedJobPosting | null> {
    const res = await this.pool.query("SELECT * FROM job_postings WHERE id = $1", [id]);
    if (res.rows.length === 0) return null;
    return this.mapRowToPosting(res.rows[0]);
  }

  async listPostings(filters?: {
    jobStatus?: string;
    availability?: string;
    company?: string;
    limit?: number;
    offset?: number;
  }): Promise<UnifiedJobPosting[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let pIdx = 1;

    if (filters?.jobStatus) {
      conditions.push(`job_status = $${pIdx++}`);
      params.push(filters.jobStatus);
    }

    if (filters?.availability) {
      conditions.push(`availability = $${pIdx++}`);
      params.push(filters.availability);
    }

    if (filters?.company) {
      conditions.push(`company ILIKE $${pIdx++}`);
      params.push(`%${filters.company}%`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = filters?.limit || 50;
    const offset = filters?.offset || 0;

    const query = `
      SELECT * FROM job_postings
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset};
    `;

    const res = await this.pool.query(query, params);
    return res.rows.map((r) => this.mapRowToPosting(r));
  }

  private mapRowToPosting(row: any): UnifiedJobPosting {
    return {
      id: row.id,
      source: row.source,
      source_job_id: row.source_job_id,
      source_url: row.source_url,
      canonical_url: row.canonical_url,
      application_url: row.application_url,
      content_hash: row.content_hash,

      title: row.title,
      company: row.company,
      location: row.location,
      workplace_type: row.workplace_type,
      employment_type: row.employment_type,
      seniority: row.seniority,

      salary_min_annual: row.salary_min_annual,
      salary_max_annual: row.salary_max_annual,
      currency: row.currency || "USD",
      interval: row.interval,
      raw_salary_text: row.raw_salary_text,

      description_text: row.description_text,

      date_posted: row.date_posted ? new Date(row.date_posted).toISOString() : null,
      date_discovered: new Date(row.date_discovered).toISOString(),
      last_checked_at: row.last_checked_at ? new Date(row.last_checked_at).toISOString() : null,

      job_status: row.job_status,
      availability: row.availability,
      availability_evidence: row.availability_evidence,

      deterministic_score: row.deterministic_score != null ? parseFloat(row.deterministic_score) : null,
      ai_score: row.ai_score != null ? parseFloat(row.ai_score) : null,

      crawler_data: row.crawler_data || undefined,
      ai_analysis: row.ai_analysis || null,
      user_overrides: row.user_overrides || undefined,

      created_at: new Date(row.created_at).toISOString(),
      updated_at: new Date(row.updated_at).toISOString(),
    };
  }
}
