import { z } from "zod";

/**
 * Three distinct lifecycle states as mandated by REQUIREMENTS.md:
 * 1. Job Review Status (user review workflow)
 * 2. Posting Availability (source site state)
 * 3. Application Stage (active candidate application status)
 */

export const JobWorkflowStatusSchema = z.enum([
  "discovered",
  "filtered_out",
  "pending_analysis",
  "recommended",
  "reviewing",
  "saved",
  "dismissed",
  "archived",
]);
export type JobWorkflowStatus = z.infer<typeof JobWorkflowStatusSchema>;

export const PostingAvailabilitySchema = z.enum([
  "open",
  "closed",
  "unknown",
]);
export type PostingAvailability = z.infer<typeof PostingAvailabilitySchema>;

export const ApplicationStatusSchema = z.enum([
  "preparing",
  "applied",
  "recruiter_screen",
  "interviewing",
  "assessment",
  "offer",
  "accepted",
  "rejected",
  "withdrawn",
  "inactive",
]);
export type ApplicationStatus = z.infer<typeof ApplicationStatusSchema>;

export const WorkplaceTypeSchema = z.enum([
  "remote",
  "hybrid",
  "onsite",
  "unknown",
]);
export type WorkplaceType = z.infer<typeof WorkplaceTypeSchema>;

export const EmploymentTypeSchema = z.enum([
  "full_time",
  "part_time",
  "contract",
  "internship",
  "temporary",
  "unknown",
]);
export type EmploymentType = z.infer<typeof EmploymentTypeSchema>;

export const SeniorityLevelSchema = z.enum([
  "intern",
  "entry",
  "mid",
  "senior",
  "lead",
  "manager",
  "director",
  "executive",
  "unknown",
]);
export type SeniorityLevel = z.infer<typeof SeniorityLevelSchema>;

/**
 * Flexible First-Pass Crawler Observation Document (data.md section 47)
 */
export const CrawlerDataSchema = z.object({
  version: z.string().default("1.0.0"),
  extracted_at: z.string(),
  source: z.string(),
  source_job_id: z.string().nullable().optional(),
  raw_title: z.string(),
  raw_company: z.string().nullable().optional(),
  raw_location: z.string().nullable().optional(),
  raw_description: z.string().nullable().optional(),
  raw_salary_text: z.string().nullable().optional(),
  detected_technologies: z.array(z.string()).default([]),
  detected_benefits: z.array(z.string()).default([]),
  matched_rules: z.array(z.object({
    rule_id: z.string(),
    passed: z.boolean(),
    score: z.number().optional(),
    evidence: z.string().optional(),
  })).default([]),
  raw_payload: z.record(z.string(), z.unknown()).optional(),
});
export type CrawlerData = z.infer<typeof CrawlerDataSchema>;

/**
 * AI Analysis Document (job-analyzer.md section 33 & data.md section 63)
 */
export const AiAnalysisSchema = z.object({
  version: z.string().default("1.0.0"),
  analyzed_at: z.string(),
  provider: z.string().default("gemini"),
  model_id: z.string(),
  prompt_version: z.string(),
  profile_state_hash: z.string(),
  overall_fit_score: z.number().min(0).max(100),
  recommendation: z.enum(["recommend", "consider", "reject"]),
  confidence: z.number().min(0).max(1),
  matched_qualifications: z.array(z.object({
    qualification: z.string(),
    evidence: z.string(),
    importance: z.enum(["required", "preferred"]).default("required"),
  })).default([]),
  qualification_gaps: z.array(z.object({
    gap: z.string(),
    importance: z.enum(["required", "preferred"]).default("required"),
    evidence: z.string().optional(),
  })).default([]),
  compensation_assessment: z.enum(["meets", "below", "unknown", "ambiguous"]).default("unknown"),
  location_assessment: z.string().optional(),
  seniority_assessment: z.string().optional(),
  concerns: z.array(z.string()).default([]),
  facts_requiring_verification: z.array(z.string()).default([]),
  rationale: z.string(),
  suggested_resume_focus: z.array(z.string()).default([]),
  tokens_used: z.object({
    prompt_tokens: z.number().optional(),
    completion_tokens: z.number().optional(),
    total_tokens: z.number().optional(),
  }).optional(),
});
export type AiAnalysis = z.infer<typeof AiAnalysisSchema>;

/**
 * User manual overrides (data.md section 22 - takes UI precedence without deleting automated values)
 */
export const UserOverridesSchema = z.object({
  title: z.string().optional(),
  company: z.string().optional(),
  location: z.string().optional(),
  workplace_type: WorkplaceTypeSchema.optional(),
  salary_min_annual: z.number().optional(),
  salary_max_annual: z.number().optional(),
  notes: z.string().optional(),
});
export type UserOverrides = z.infer<typeof UserOverridesSchema>;

/**
 * The Central Unified Job Posting Entity
 */
export const UnifiedJobPostingSchema = z.object({
  // Durable Primary Key
  id: z.string().uuid(),

  // Provenance & Deduplication Keys
  source: z.string(), // "jobspy" | "greenhouse" | "lever" | "manual"
  source_job_id: z.string().nullable().optional(),
  source_url: z.string().url().nullable().optional(),
  canonical_url: z.string().nullable().optional(),
  application_url: z.string().nullable().optional(),
  content_hash: z.string(), // SHA-256 of cleaned description

  // Core Extracted & Normalized Fields
  title: z.string(),
  company: z.string(),
  location: z.string().nullable().optional(),
  workplace_type: WorkplaceTypeSchema.default("unknown"),
  employment_type: EmploymentTypeSchema.default("unknown"),
  seniority: SeniorityLevelSchema.default("unknown"),

  // Compensation
  salary_min_annual: z.number().nullable().optional(),
  salary_max_annual: z.number().nullable().optional(),
  currency: z.string().default("USD"),
  interval: z.string().nullable().optional(), // "yearly" | "hourly" | etc.
  raw_salary_text: z.string().nullable().optional(),

  // Content
  description_text: z.string(), // clean plaintext/markdown without tags

  // Dates
  date_posted: z.string().nullable().optional(),
  date_discovered: z.string(),
  last_checked_at: z.string().nullable().optional(),

  // Three Independent Lifecycles
  job_status: JobWorkflowStatusSchema.default("discovered"),
  availability: PostingAvailabilitySchema.default("unknown"),
  availability_evidence: z.string().nullable().optional(),

  // Scores
  deterministic_score: z.number().nullable().optional(),
  ai_score: z.number().nullable().optional(),

  // Versioned Flexible Documents
  crawler_data: CrawlerDataSchema.optional(),
  ai_analysis: AiAnalysisSchema.nullable().optional(),
  user_overrides: UserOverridesSchema.optional(),

  created_at: z.string(),
  updated_at: z.string(),
});
export type UnifiedJobPosting = z.infer<typeof UnifiedJobPostingSchema>;

/**
 * Job Status Change History (audit log of review status transitions)
 */
export const JobStatusHistorySchema = z.object({
  id: z.string().uuid(),
  job_posting_id: z.string().uuid(),
  previous_status: JobWorkflowStatusSchema.nullable(),
  new_status: JobWorkflowStatusSchema,
  changed_by: z.enum(["crawler", "deterministic_filter", "ai", "user", "system"]),
  reason: z.string().nullable().optional(),
  created_at: z.string(),
});
export type JobStatusHistory = z.infer<typeof JobStatusHistorySchema>;

/**
 * Explicit Feedback Entity (feedback-learning.md)
 */
export const RecommendationFeedbackSchema = z.object({
  id: z.string().uuid(),
  job_posting_id: z.string().uuid(),
  vote: z.enum(["up", "down"]),
  reason_code: z.enum([
    "title",
    "seniority",
    "skills",
    "company",
    "industry",
    "compensation",
    "location",
    "workplace_type",
    "responsibilities",
    "culture",
    "duplicate_irrelevant",
    "other",
  ]).nullable().optional(),
  explanation: z.string().nullable().optional(),
  recommendation_snapshot: z.object({
    overall_fit_score: z.number().optional(),
    model_id: z.string().optional(),
    prompt_version: z.string().optional(),
  }).optional(),
  created_at: z.string(),
  retracted_at: z.string().nullable().optional(),
});
export type RecommendationFeedback = z.infer<typeof RecommendationFeedbackSchema>;

/**
 * Application Tracking Entity (data.md section 111)
 */
export const ApplicationSchema = z.object({
  id: z.string().uuid(),
  job_posting_id: z.string().uuid(),
  status: ApplicationStatusSchema.default("preparing"),
  application_url: z.string().nullable().optional(),
  applied_at: z.string().nullable().optional(),
  next_action_date: z.string().nullable().optional(),
  user_notes: z.string().nullable().optional(),
  stage_history: z.array(z.object({
    stage: ApplicationStatusSchema,
    entered_at: z.string(),
    notes: z.string().optional(),
  })).default([]),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Application = z.infer<typeof ApplicationSchema>;
