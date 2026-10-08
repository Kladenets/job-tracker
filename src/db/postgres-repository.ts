import { Pool } from "pg";
import { Application, UnifiedJobPosting } from "../types/job-posting";
import { JobPostingRepository, ExistingJobMatch } from "./repository-interface";
import { calculateDashboardMetrics } from "./metrics";
import { Conversation, StoredConversation } from "../ai/agent/conversation";

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
        jev_fit, jev_confidence,
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
        jev_fit = COALESCE(EXCLUDED.jev_fit, job_postings.jev_fit),
        jev_confidence = COALESCE(EXCLUDED.jev_confidence, job_postings.jev_confidence),
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

      posting.jev_fit != null ? posting.jev_fit : null,
      posting.jev_confidence != null ? posting.jev_confidence : null,

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

  async updatePostingContent(
    id: string,
    updates: {
      description_text?: string;
      content_hash: string;
      crawler_data?: any;
      availability?: string;
    }
  ): Promise<void> {
    const setParts: string[] = ["content_hash = $2", "last_checked_at = NOW()", "updated_at = NOW()"];
    const params: unknown[] = [id, updates.content_hash];
    let pIdx = 3;

    if (updates.description_text) {
      setParts.push(`description_text = $${pIdx++}`);
      params.push(updates.description_text);
    }
    if (updates.crawler_data) {
      setParts.push(`crawler_data = $${pIdx++}`);
      params.push(JSON.stringify(updates.crawler_data));
    }
    if (updates.availability) {
      setParts.push(`availability = $${pIdx++}`);
      params.push(updates.availability);
    }

    const query = `UPDATE job_postings SET ${setParts.join(", ")} WHERE id = $1`;
    await this.pool.query(query, params);
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
    missingSalary?: boolean;
    missingLocation?: boolean;
    sortBy?: "created_at" | "jev_confidence";
    sortOrder?: "asc" | "desc";
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

    if (filters?.missingSalary === true) {
      conditions.push(`salary_min_annual IS NULL AND salary_max_annual IS NULL`);
    }

    if (filters?.missingLocation === true) {
      conditions.push(`location IS NULL`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = filters?.limit || 50;
    const offset = filters?.offset || 0;

    let orderCol = "created_at";
    if (filters?.sortBy === "jev_confidence") {
      orderCol = "jev_confidence";
    }
    const orderDir = filters?.sortOrder?.toUpperCase() === "ASC" ? "ASC" : "DESC";

    const query = `
      SELECT * FROM job_postings
      ${whereClause}
      ORDER BY ${orderCol} ${orderDir} NULLS LAST
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

      jev_fit: row.jev_fit != null ? Boolean(row.jev_fit) : null,
      jev_confidence: row.jev_confidence != null ? parseFloat(row.jev_confidence) : null,

      crawler_data: row.crawler_data || undefined,
      ai_analysis: row.ai_analysis || null,
      user_overrides: row.user_overrides || undefined,

      created_at: new Date(row.created_at).toISOString(),
      updated_at: new Date(row.updated_at).toISOString(),
    };
  }

  async saveConversation(conversation: Conversation): Promise<Conversation> {
    const json = conversation.toJSON();
    const query = `
      INSERT INTO conversations (id, title, job_ids, messages, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        job_ids = EXCLUDED.job_ids,
        messages = EXCLUDED.messages,
        updated_at = NOW()
      RETURNING *;
    `;
    await this.pool.query(query, [
      json.id,
      json.title,
      JSON.stringify(json.job_ids),
      JSON.stringify(json.messages),
      json.created_at,
      json.updated_at,
    ]);
    return conversation;
  }

  async getConversation(id: string): Promise<Conversation | null> {
    const res = await this.pool.query("SELECT * FROM conversations WHERE id = $1", [id]);
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return Conversation.fromJSON({
      id: row.id,
      title: row.title,
      job_ids: Array.isArray(row.job_ids) ? row.job_ids : JSON.parse(row.job_ids || "[]"),
      messages: Array.isArray(row.messages) ? row.messages : JSON.parse(row.messages || "[]"),
      created_at: new Date(row.created_at).toISOString(),
      updated_at: new Date(row.updated_at).toISOString(),
    });
  }

  async listConversations(filter?: { jobId?: string; limit?: number }): Promise<Conversation[]> {
    let query = "SELECT * FROM conversations";
    const params: unknown[] = [];

    if (filter?.jobId) {
      query += " WHERE job_ids @> $1::jsonb";
      params.push(JSON.stringify([filter.jobId]));
    }

    query += " ORDER BY updated_at DESC";

    if (filter?.limit) {
      query += ` LIMIT $${params.length + 1}`;
      params.push(filter.limit);
    }

    const res = await this.pool.query(query, params);
    return res.rows.map((row) =>
      Conversation.fromJSON({
        id: row.id,
        title: row.title,
        job_ids: Array.isArray(row.job_ids) ? row.job_ids : JSON.parse(row.job_ids || "[]"),
        messages: Array.isArray(row.messages) ? row.messages : JSON.parse(row.messages || "[]"),
        created_at: new Date(row.created_at).toISOString(),
        updated_at: new Date(row.updated_at).toISOString(),
      })
    );
  }

  async deleteConversation(id: string): Promise<void> {
    await this.pool.query("DELETE FROM conversations WHERE id = $1", [id]);
  }

  // Application Tracking Methods
  async createManualApplication(posting: UnifiedJobPosting, application: Application): Promise<Application> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO job_postings (
          id, source, application_url, content_hash, title, company, description_text,
          date_discovered, job_status, availability, workplace_type, employment_type,
          seniority, currency, created_at, updated_at
        ) VALUES ($1, 'manual', $2, $3, $4, $5, $6, $7, 'discovered', 'unknown',
          'unknown', 'unknown', 'unknown', 'USD', $8, $9)`,
        [
          posting.id,
          posting.application_url || null,
          posting.content_hash,
          posting.title,
          posting.company,
          posting.description_text,
          posting.date_discovered,
          posting.created_at,
          posting.updated_at,
        ]
      );
      await client.query(
        `INSERT INTO applications (
          id, job_posting_id, status, application_url, applied_at, next_action_date,
          user_notes, stage_history, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          application.id,
          application.job_posting_id,
          application.status,
          application.application_url || null,
          application.applied_at ? new Date(application.applied_at) : null,
          application.next_action_date ? new Date(application.next_action_date) : null,
          application.user_notes || null,
          JSON.stringify(application.stage_history || []),
          application.created_at,
          application.updated_at,
        ]
      );
      await client.query("COMMIT");
      return application;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async saveApplication(app: any): Promise<any> {
    const query = `
      INSERT INTO applications (
        id, job_posting_id, status, application_url, applied_at, next_action_date, user_notes, stage_history, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW()
      )
      ON CONFLICT (job_posting_id) DO UPDATE SET
        status = EXCLUDED.status,
        application_url = EXCLUDED.application_url,
        applied_at = EXCLUDED.applied_at,
        next_action_date = EXCLUDED.next_action_date,
        user_notes = EXCLUDED.user_notes,
        stage_history = EXCLUDED.stage_history,
        updated_at = NOW()
      RETURNING *;
    `;
    const res = await this.pool.query(query, [
      app.id,
      app.job_posting_id,
      app.status || "preparing",
      app.application_url || null,
      app.applied_at ? new Date(app.applied_at) : null,
      app.next_action_date ? new Date(app.next_action_date) : null,
      app.user_notes || null,
      JSON.stringify(app.stage_history || []),
    ]);
    return res.rows[0];
  }

  async getApplication(id: string): Promise<any | null> {
    const res = await this.pool.query("SELECT * FROM applications WHERE id = $1", [id]);
    return res.rows[0] || null;
  }

  async getApplicationByJobId(jobId: string): Promise<any | null> {
    const res = await this.pool.query("SELECT * FROM applications WHERE job_posting_id = $1", [jobId]);
    return res.rows[0] || null;
  }

  async listApplications(filter?: { status?: string }): Promise<any[]> {
    let query = `
      SELECT a.*, 
             j.title, j.company, j.location, j.workplace_type, j.salary_min_annual, j.salary_max_annual, j.canonical_url, j.application_url as job_application_url
      FROM applications a
      LEFT JOIN job_postings j ON a.job_posting_id = j.id
    `;
    const params: unknown[] = [];
    if (filter?.status) {
      query += " WHERE a.status = $1";
      params.push(filter.status);
    }
    query += " ORDER BY a.updated_at DESC";
    const res = await this.pool.query(query, params);
    return res.rows.map((row) => ({
      id: row.id,
      job_posting_id: row.job_posting_id,
      status: row.status,
      application_url: row.application_url,
      applied_at: row.applied_at ? new Date(row.applied_at).toISOString() : null,
      next_action_date: row.next_action_date ? new Date(row.next_action_date).toISOString() : null,
      user_notes: row.user_notes,
      stage_history: Array.isArray(row.stage_history) ? row.stage_history : JSON.parse(row.stage_history || "[]"),
      created_at: new Date(row.created_at).toISOString(),
      updated_at: new Date(row.updated_at).toISOString(),
      job: {
        id: row.job_posting_id,
        title: row.title,
        company: row.company,
        location: row.location,
        workplace_type: row.workplace_type,
        salary_min_annual: row.salary_min_annual,
        salary_max_annual: row.salary_max_annual,
        canonical_url: row.canonical_url,
        application_url: row.job_application_url,
      },
    }));
  }

  async deleteApplication(id: string): Promise<void> {
    await this.pool.query("DELETE FROM applications WHERE id = $1", [id]);
  }

  // Discovery Run & Metrics Querying
  async getMetrics(options?: { startDate?: string; endDate?: string }) {
    const postRes = await this.pool.query("SELECT id, source, job_status, jev_fit, date_discovered, created_at FROM job_postings");
    const appRes = await this.pool.query("SELECT id, job_posting_id, status, applied_at, created_at FROM applications");

    return calculateDashboardMetrics(postRes.rows, appRes.rows, options);
  }

  async saveUserProfile(key: string, data: any): Promise<void> {
    const query = `
      INSERT INTO user_profiles (key, data, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (key) DO UPDATE
      SET data = EXCLUDED.data, updated_at = NOW();
    `;
    await this.pool.query(query, [key, JSON.stringify(data)]);
  }

  async getUserProfile(key: string): Promise<any | null> {
    const query = `
      SELECT data FROM user_profiles WHERE key = $1 LIMIT 1;
    `;
    const res = await this.pool.query(query, [key]);
    if (res.rows.length === 0) return null;
    return res.rows[0].data;
  }
}
