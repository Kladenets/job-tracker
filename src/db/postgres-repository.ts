import { Pool } from "pg";
import { Application, UnifiedJobPosting } from "../types/job-posting.js";
import { DiscoveryRun, JobPostingRepository, ExistingJobMatch } from "./repository-interface.js";
import { calculateDashboardMetrics } from "./metrics.js";
import { Conversation, StoredConversation } from "../ai/agent/conversation.js";
import { AiUsageRecord, AiUsageSummary, DailyAiBudget, AiBudgetExceededError } from "../ai/usage-types.js";
import {
  NewRecommendationFeedback,
  RecommendationFeedback,
  RecommendationFeedbackSchema,
} from "../types/job-posting.js";
import {
  ApplicationDraft,
  ApplicationDraftListOptions,
  ApplicationDraftSourceFact,
  ApplicationDraftVersion,
  NewApplicationDraft,
  NewApplicationDraftSchema,
  ApplicationDraftSchema,
} from "../ai/application-drafts.js";

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
        job_status, availability, availability_evidence, availability_check_failures,
        jev_fit, jev_confidence,
        crawler_data, ai_analysis, user_overrides,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11, $12, $13,
        $14, $15, $16, $17, $18,
        $19, $20, $21, $22,
        $23, $24, $25, $26,
        $27, $28,
        $29, $30, $31,
        $32, $33
      )
      ON CONFLICT (id) DO UPDATE SET
        last_checked_at = EXCLUDED.last_checked_at,
        availability = EXCLUDED.availability,
        availability_evidence = EXCLUDED.availability_evidence,
        availability_check_failures = EXCLUDED.availability_check_failures,
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
      posting.availability_check_failures ?? 0,

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
       SET availability = $1, availability_evidence = $2,
           availability_check_failures = CASE WHEN $1 = 'open' THEN 0 ELSE availability_check_failures END,
           last_checked_at = NOW(), updated_at = NOW()
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
      if (updates.availability === "open") setParts.push("availability_check_failures = 0");
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
      availability_check_failures: Number(row.availability_check_failures ?? 0),

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

  async reserveAiUsage(record: AiUsageRecord, budget?: DailyAiBudget): Promise<void> {
    if (!budget || record.role !== "owner") {
      await this.insertAiUsageRecord(record);
      return;
    }

    const client = await this.pool.connect();
    let committed = false;
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock($1)", [741029382]);
      const usage = await client.query(
        `SELECT COUNT(*)::integer AS requests,
                COALESCE(SUM(COALESCE(total_tokens, estimated_input_tokens)), 0)::integer AS tokens
         FROM ai_usage
         WHERE role = 'owner' AND started_at >= $1`,
        [budget.starts_at]
      );
      const requests = Number(usage.rows[0]?.requests ?? 0);
      const tokens = Number(usage.rows[0]?.tokens ?? 0);
      if (requests >= budget.max_requests) {
        throw new AiBudgetExceededError("requests", budget.max_requests, requests, budget.resets_at);
      }
      if (tokens + record.estimated_input_tokens > budget.max_tokens) {
        throw new AiBudgetExceededError("tokens", budget.max_tokens, tokens, budget.resets_at);
      }
      await this.insertAiUsageRecord(record, client);
      await client.query("COMMIT");
      committed = true;
    } catch (error) {
      if (!committed) await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private async insertAiUsageRecord(record: AiUsageRecord, client: Pool | import("pg").PoolClient = this.pool): Promise<void> {
    await client.query(
      `INSERT INTO ai_usage (
        id, role, provider, model, prompt_version, started_at, completed_at,
        estimated_input_tokens, input_tokens, output_tokens, total_tokens,
        latency_ms, status, error_code
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [
        record.id,
        record.role,
        record.provider,
        record.model,
        record.prompt_version,
        record.started_at,
        record.completed_at,
        record.estimated_input_tokens,
        record.input_tokens,
        record.output_tokens,
        record.total_tokens,
        record.latency_ms,
        record.status,
        record.error_code,
      ]
    );
  }

  async finishAiUsage(
    id: string,
    result: Pick<AiUsageRecord, "completed_at" | "input_tokens" | "output_tokens" | "total_tokens" | "latency_ms" | "status" | "error_code">
  ): Promise<void> {
    const updated = await this.pool.query(
      `UPDATE ai_usage
       SET completed_at = $2, input_tokens = $3, output_tokens = $4, total_tokens = $5,
           latency_ms = $6, status = $7, error_code = $8
       WHERE id = $1`,
      [
        id,
        result.completed_at,
        result.input_tokens,
        result.output_tokens,
        result.total_tokens,
        result.latency_ms,
        result.status,
        result.error_code,
      ]
    );
    if (updated.rowCount !== 1) throw new Error(`AI usage record ${id} does not exist`);
  }

  async getAiUsageSummary(startsAt: string): Promise<AiUsageSummary> {
    const result = await this.pool.query(
      `SELECT role, COUNT(*)::integer AS requests,
              COALESCE(SUM(COALESCE(total_tokens, estimated_input_tokens)), 0)::integer AS tokens
       FROM ai_usage
       WHERE started_at >= $1
       GROUP BY role`,
      [startsAt]
    );
    const summary: AiUsageSummary = {
      owner_requests: 0,
      owner_tokens: 0,
      guest_requests: 0,
      guest_tokens: 0,
    };
    for (const row of result.rows) {
      if (row.role === "owner") {
        summary.owner_requests = Number(row.requests);
        summary.owner_tokens = Number(row.tokens);
      } else if (row.role === "guest") {
        summary.guest_requests = Number(row.requests);
        summary.guest_tokens = Number(row.tokens);
      }
    }
    return summary;
  }

  async listRecommendationFeedback(jobPostingId: string): Promise<RecommendationFeedback[]> {
    const result = await this.pool.query(
      `SELECT * FROM recommendation_feedback
       WHERE job_posting_id = $1
       ORDER BY created_at ASC, id ASC`,
      [jobPostingId]
    );
    return result.rows.map((row) => this.mapRecommendationFeedbackRow(row));
  }

  async listActiveRecommendationFeedback(jobPostingIds: string[]): Promise<RecommendationFeedback[]> {
    if (jobPostingIds.length === 0) return [];
    const result = await this.pool.query(
      `SELECT * FROM recommendation_feedback
       WHERE job_posting_id = ANY($1::uuid[]) AND retracted_at IS NULL
       ORDER BY created_at ASC, id ASC`,
      [jobPostingIds]
    );
    return result.rows.map((row) => this.mapRecommendationFeedbackRow(row));
  }

  async recordRecommendationFeedback(
    input: NewRecommendationFeedback
  ): Promise<RecommendationFeedback> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const posting = await client.query(
        "SELECT id FROM job_postings WHERE id = $1 FOR UPDATE",
        [input.job_posting_id]
      );
      if (posting.rows.length === 0) {
        throw new Error(`Job posting ${input.job_posting_id} does not exist`);
      }
      const replaced = await client.query(
        `UPDATE recommendation_feedback
         SET retracted_at = NOW(), retraction_reason = 'replaced'
         WHERE job_posting_id = $1 AND retracted_at IS NULL
         RETURNING id`,
        [input.job_posting_id]
      );
      const inserted = await client.query(
        `INSERT INTO recommendation_feedback (
          id, job_posting_id, vote, reason_code, explanation, recommendation_snapshot, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
        RETURNING *`,
        [
          input.id,
          input.job_posting_id,
          input.vote,
          input.reason_code ?? null,
          input.explanation ?? null,
          JSON.stringify(input.recommendation_snapshot),
        ]
      );
      if (replaced.rows.length > 0) {
        await client.query(
          "UPDATE recommendation_feedback SET replaced_by_id = $2 WHERE id = ANY($1::uuid[])",
          [replaced.rows.map((row) => row.id), input.id]
        );
      }
      await client.query("COMMIT");
      return this.mapRecommendationFeedbackRow(inserted.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async retractRecommendationFeedback(
    jobPostingId: string
  ): Promise<RecommendationFeedback | null> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const posting = await client.query(
        "SELECT id FROM job_postings WHERE id = $1 FOR UPDATE",
        [jobPostingId]
      );
      if (posting.rows.length === 0) {
        await client.query("COMMIT");
        return null;
      }
      const result = await client.query(
        `UPDATE recommendation_feedback
         SET retracted_at = NOW(), retraction_reason = 'user_retracted'
         WHERE id = (
           SELECT id FROM recommendation_feedback
           WHERE job_posting_id = $1 AND retracted_at IS NULL
           ORDER BY created_at DESC, id DESC
           LIMIT 1
           FOR UPDATE
         )
         RETURNING *`,
        [jobPostingId]
      );
      await client.query("COMMIT");
      return result.rows[0] ? this.mapRecommendationFeedbackRow(result.rows[0]) : null;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private mapRecommendationFeedbackRow(row: {
    id: string;
    job_posting_id: string;
    vote: string;
    reason_code: string | null;
    explanation: string | null;
    recommendation_snapshot: unknown;
    created_at: Date | string;
    retracted_at: Date | string | null;
    replaced_by_id: string | null;
    retraction_reason: string | null;
  }): RecommendationFeedback {
    const snapshot = typeof row.recommendation_snapshot === "string"
      ? JSON.parse(row.recommendation_snapshot)
      : row.recommendation_snapshot;
    return RecommendationFeedbackSchema.parse({
      id: row.id,
      job_posting_id: row.job_posting_id,
      vote: row.vote,
      reason_code: row.reason_code,
      explanation: row.explanation,
      recommendation_snapshot: snapshot,
      created_at: new Date(row.created_at).toISOString(),
      retracted_at: row.retracted_at ? new Date(row.retracted_at).toISOString() : null,
      replaced_by_id: row.replaced_by_id,
      retraction_reason: row.retraction_reason,
    });
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

  async createApplicationDraft(input: NewApplicationDraft): Promise<ApplicationDraft> {
    const parsed = NewApplicationDraftSchema.parse(input);
    if (parsed.draft_type === "application_answer" && !parsed.question?.trim()) {
      throw new Error("Application-answer drafts require the original question");
    }
    if (parsed.sensitive && parsed.author !== "user") {
      throw new Error("Sensitive application answers can only be authored by the user");
    }
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const existingJob = await client.query("SELECT 1 FROM job_postings WHERE id = $1", [
        parsed.job_posting_id,
      ]);
      if (existingJob.rows.length === 0) {
        throw new Error(`Job posting ${parsed.job_posting_id} not found for application draft`);
      }
      await client.query(
        `INSERT INTO application_drafts (
           id, job_posting_id, conversation_id, draft_type, question, sensitive, status,
           current_version, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, 'draft', 1, NOW(), NOW())`,
        [
          parsed.id,
          parsed.job_posting_id,
          parsed.conversation_id ?? null,
          parsed.draft_type,
          parsed.question ?? null,
          parsed.sensitive ?? false,
        ]
      );
      await client.query(
        `INSERT INTO application_draft_versions (
           draft_id, version, content, subject_line, source_facts, assumptions, author,
           model_id, prompt_version
         ) VALUES ($1, 1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8)`,
        [
          parsed.id,
          parsed.content,
          parsed.subject_line ?? null,
          JSON.stringify(parsed.source_facts),
          JSON.stringify(parsed.assumptions),
          parsed.author,
          parsed.model_id ?? null,
          parsed.prompt_version ?? null,
        ]
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    const draft = await this.getApplicationDraft(parsed.id);
    if (!draft) throw new Error(`Application draft ${parsed.id} was not persisted`);
    return draft;
  }

  async getApplicationDraft(id: string): Promise<ApplicationDraft | null> {
    const draftResult = await this.pool.query(
      `SELECT id, job_posting_id, conversation_id, draft_type, question, sensitive, status,
              current_version, created_at, updated_at
       FROM application_drafts WHERE id = $1`,
      [id]
    );
    const row = draftResult.rows[0];
    if (!row) return null;
    const versionResult = await this.pool.query(
      `SELECT version, content, subject_line, source_facts, assumptions, author, model_id,
              prompt_version, created_at, approved_at, approved_by
       FROM application_draft_versions WHERE draft_id = $1 ORDER BY version`,
      [id]
    );
    return this.mapApplicationDraft(row, versionResult.rows);
  }

  async listApplicationDrafts(
    options?: ApplicationDraftListOptions
  ): Promise<ApplicationDraft[]> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    if (options?.jobPostingId) {
      values.push(options.jobPostingId);
      conditions.push(`job_posting_id = $${values.length}`);
    }
    if (options?.draftType) {
      values.push(options.draftType);
      conditions.push(`draft_type = $${values.length}`);
    }
    if (options?.status) {
      values.push(options.status);
      conditions.push(`status = $${values.length}`);
    }
    if (options?.includeSensitive !== true) conditions.push("sensitive = FALSE");
    if (options?.hasApprovedVersion) {
      conditions.push(
        "EXISTS (SELECT 1 FROM application_draft_versions v WHERE v.draft_id = application_drafts.id AND v.approved_at IS NOT NULL)"
      );
    }
    values.push(Math.max(1, Math.min(options?.limit ?? 100, 500)));
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const draftsResult = await this.pool.query(
      `SELECT id, job_posting_id, conversation_id, draft_type, question, sensitive, status,
              current_version, created_at, updated_at
       FROM application_drafts ${where}
       ORDER BY updated_at DESC LIMIT $${values.length}`,
      values
    );
    if (draftsResult.rows.length === 0) return [];
    const ids = draftsResult.rows.map((row) => row.id);
    const versionsResult = await this.pool.query(
      `SELECT draft_id, version, content, subject_line, source_facts, assumptions, author,
              model_id, prompt_version, created_at, approved_at, approved_by
       FROM application_draft_versions
       WHERE draft_id = ANY($1::uuid[])
       ORDER BY draft_id, version`,
      [ids]
    );
    const versionsByDraft = new Map<string, typeof versionsResult.rows>();
    for (const version of versionsResult.rows) {
      const versions = versionsByDraft.get(version.draft_id) || [];
      versions.push(version);
      versionsByDraft.set(version.draft_id, versions);
    }
    return draftsResult.rows.map((row) =>
      this.mapApplicationDraft(row, versionsByDraft.get(row.id) || [])
    );
  }

  async updateApplicationDraft(id: string, content: string): Promise<ApplicationDraft | null> {
    if (content.trim().length === 0 || content.length > 20_000) {
      throw new Error("Draft text must contain 1 to 20,000 characters");
    }
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const draftResult = await client.query(
        `SELECT current_version FROM application_drafts WHERE id = $1 FOR UPDATE`,
        [id]
      );
      const row = draftResult.rows[0];
      if (!row) {
        await client.query("ROLLBACK");
        return null;
      }
      const currentVersion = Number(row.current_version);
      const newVersion = currentVersion + 1;
      const source = await client.query(
        `SELECT subject_line, source_facts, assumptions
         FROM application_draft_versions WHERE draft_id = $1 AND version = $2`,
        [id, currentVersion]
      );
      if (!source.rows[0]) throw new Error(`Current version is missing for application draft ${id}`);
      const current = source.rows[0];
      await client.query(
        `INSERT INTO application_draft_versions (
           draft_id, version, content, subject_line, source_facts, assumptions, author,
           model_id, prompt_version, created_at
         ) VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, 'user', NULL, NULL, NOW())`,
        [
          id,
          newVersion,
          content,
          current.subject_line,
          JSON.stringify(this.parseJsonArray<ApplicationDraftSourceFact>(current.source_facts)),
          JSON.stringify(this.parseJsonArray<string>(current.assumptions)),
        ]
      );
      await client.query(
        `UPDATE application_drafts SET current_version = $2, status = 'draft', updated_at = NOW()
         WHERE id = $1`,
        [id, newVersion]
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    return this.getApplicationDraft(id);
  }

  async approveApplicationDraft(id: string): Promise<ApplicationDraft | null> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const draftResult = await client.query(
        `SELECT current_version FROM application_drafts WHERE id = $1 FOR UPDATE`,
        [id]
      );
      const row = draftResult.rows[0];
      if (!row) {
        await client.query("ROLLBACK");
        return null;
      }
      await client.query(
        `UPDATE application_draft_versions
         SET approved_at = COALESCE(approved_at, NOW()), approved_by = 'owner'
         WHERE draft_id = $1 AND version = $2`,
        [id, row.current_version]
      );
      await client.query(
        `UPDATE application_drafts SET status = 'approved', updated_at = NOW() WHERE id = $1`,
        [id]
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    return this.getApplicationDraft(id);
  }

  // Discovery Run & Metrics Querying
  async getMetrics(options?: { startDate?: string; endDate?: string }) {
    const postRes = await this.pool.query("SELECT id, source, job_status, jev_fit, date_discovered, created_at FROM job_postings");
    const appRes = await this.pool.query("SELECT id, job_posting_id, status, applied_at, created_at FROM applications");

    return calculateDashboardMetrics(postRes.rows, appRes.rows, options);
  }

  async saveDiscoveryRun(run: DiscoveryRun): Promise<void> {
    await this.pool.query(
      `INSERT INTO discovery_runs (
         id, batch_id, source, trigger_type, status, total_found, new_imported,
         duplicates_seen, filtered_out, screened_with_jev, recommended, error_count, error_message,
         attempt_count, started_at, completed_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       ON CONFLICT (id) DO UPDATE SET
         status = EXCLUDED.status,
         total_found = EXCLUDED.total_found,
         new_imported = EXCLUDED.new_imported,
         duplicates_seen = EXCLUDED.duplicates_seen,
         filtered_out = EXCLUDED.filtered_out,
         screened_with_jev = EXCLUDED.screened_with_jev,
         recommended = EXCLUDED.recommended,
         error_count = EXCLUDED.error_count,
         error_message = EXCLUDED.error_message,
         attempt_count = EXCLUDED.attempt_count,
         started_at = EXCLUDED.started_at,
         completed_at = EXCLUDED.completed_at`,
      [
        run.id,
        run.batch_id,
        run.source,
        run.trigger_type,
        run.status,
        run.total_found,
        run.new_imported,
        run.duplicates_seen,
        run.filtered_out,
        run.screened_with_jev,
        run.recommended,
        run.error_count,
        run.error_message,
        run.attempt_count,
        run.started_at,
        run.completed_at,
      ]
    );
  }

  async listDiscoveryRuns(options?: {
    limit?: number;
    status?: DiscoveryRun["status"];
  }): Promise<DiscoveryRun[]> {
    const limit = Math.max(1, Math.min(options?.limit ?? 50, 500));
    const params: unknown[] = [];
    let statusClause = "";
    if (options?.status) {
      params.push(options.status);
      statusClause = "WHERE status = $1";
    }
    params.push(limit);
    const result = await this.pool.query(
      `SELECT id, batch_id, source, trigger_type, status, total_found, new_imported,
              duplicates_seen, filtered_out, screened_with_jev, recommended, error_count, error_message,
              attempt_count, started_at, completed_at
       FROM discovery_runs ${statusClause}
       ORDER BY started_at DESC LIMIT $${params.length}`,
      params
    );
    return result.rows.map((row) => this.mapDiscoveryRun(row));
  }

  async claimDiscoveryRun(id: string, maxAttempts: number): Promise<DiscoveryRun | null> {
    const result = await this.pool.query(
      `UPDATE discovery_runs
       SET status = 'running', attempt_count = attempt_count + 1,
           started_at = NOW(), completed_at = NULL
       WHERE id = $1 AND status = 'queued' AND attempt_count < $2
       RETURNING id, batch_id, source, trigger_type, status, total_found, new_imported,
                 duplicates_seen, filtered_out, screened_with_jev, recommended, error_count, error_message,
                 attempt_count, started_at, completed_at`,
      [id, maxAttempts]
    );
    return result.rows[0] ? this.mapDiscoveryRun(result.rows[0]) : null;
  }

  async recoverInterruptedDiscoveryRuns(staleBefore: string, maxAttempts: number): Promise<number> {
    const result = await this.pool.query(
      `UPDATE discovery_runs
       SET status = CASE WHEN attempt_count < $2 THEN 'queued' ELSE 'failed' END,
           error_message = COALESCE(
             error_message,
             CASE WHEN attempt_count < $2
               THEN 'Interrupted while running; queued for recovery'
               ELSE 'Interrupted while running; retry limit exhausted'
             END
           ),
           error_count = GREATEST(error_count, 1),
           completed_at = CASE WHEN attempt_count < $2 THEN NULL ELSE NOW() END
       WHERE status = 'running' AND started_at < $1`,
      [new Date(staleBefore), maxAttempts]
    );
    return result.rowCount ?? 0;
  }

  async recordAvailabilityCheck(
    id: string,
    status: "open" | "closed" | "unknown",
    evidence: string,
    checkedAt = new Date().toISOString()
  ): Promise<number> {
    const result = await this.pool.query(
      `UPDATE job_postings
       SET availability = $1,
           availability_evidence = $2,
           availability_check_failures = CASE WHEN $1 = 'unknown'
             THEN availability_check_failures + 1 ELSE 0 END,
           last_checked_at = $3,
           updated_at = $3
       WHERE id = $4
       RETURNING availability_check_failures`,
      [status, evidence, new Date(checkedAt), id]
    );
    return result.rows[0]?.availability_check_failures ?? 0;
  }

  private mapDiscoveryRun(row: any): DiscoveryRun {
    return {
      id: row.id,
      batch_id: row.batch_id,
      source: row.source,
      trigger_type: row.trigger_type,
      status: row.status,
      total_found: Number(row.total_found ?? 0),
      new_imported: Number(row.new_imported ?? 0),
      duplicates_seen: Number(row.duplicates_seen ?? 0),
      filtered_out: Number(row.filtered_out ?? 0),
      screened_with_jev: Number(row.screened_with_jev ?? 0),
      recommended: Number(row.recommended ?? 0),
      error_count: Number(row.error_count ?? 0),
      error_message: row.error_message,
      attempt_count: Number(row.attempt_count ?? 0),
      started_at: new Date(row.started_at).toISOString(),
      completed_at: row.completed_at ? new Date(row.completed_at).toISOString() : null,
    };
  }

  private parseJsonArray<T>(value: unknown): T[] {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  }

  private mapApplicationDraft(row: any, versionRows: any[]): ApplicationDraft {
    const versions: ApplicationDraftVersion[] = versionRows.map((version) => ({
      version: Number(version.version),
      content: version.content,
      subject_line: version.subject_line,
      source_facts: this.parseJsonArray<ApplicationDraftSourceFact>(version.source_facts),
      assumptions: this.parseJsonArray<string>(version.assumptions),
      author: version.author,
      model_id: version.model_id,
      prompt_version: version.prompt_version,
      created_at: new Date(version.created_at).toISOString(),
      approved_at: version.approved_at ? new Date(version.approved_at).toISOString() : null,
      approved_by: version.approved_by,
    }));
    return ApplicationDraftSchema.parse({
      id: row.id,
      job_posting_id: row.job_posting_id,
      conversation_id: row.conversation_id,
      draft_type: row.draft_type,
      question: row.question,
      sensitive: row.sensitive,
      status: row.status,
      current_version: Number(row.current_version),
      versions,
      created_at: new Date(row.created_at).toISOString(),
      updated_at: new Date(row.updated_at).toISOString(),
    });
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
