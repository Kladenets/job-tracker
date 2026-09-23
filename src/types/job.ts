import { z } from "zod";

/**
 * Common schema for raw job postings extracted from any source.
 */
export const RawJobPostingSchema = z.object({
  id: z.string(),
  site: z.string(),
  job_url: z.string().nullable().optional(),
  job_url_direct: z.string().nullable().optional(),
  title: z.string(),
  company: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  date_posted: z.string().nullable().optional(),
  job_type: z.string().nullable().optional(),
  salary_source: z.string().nullable().optional(),
  interval: z.string().nullable().optional(),
  min_amount: z.number().nullable().optional(),
  max_amount: z.number().nullable().optional(),
  currency: z.string().nullable().optional(),
  is_remote: z.boolean().nullable().optional(),
  job_level: z.string().nullable().optional(),
  job_function: z.string().nullable().optional(),
  listing_type: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  company_industry: z.string().nullable().optional(),
  company_url: z.string().nullable().optional(),
  company_logo: z.string().nullable().optional(),
});

export type RawJobPosting = z.infer<typeof RawJobPostingSchema>;

/**
 * Parameters for invoking the JobSpy bridge.
 */
export const JobSpyQuerySchema = z.object({
  searchTerm: z.string().default("Software Engineer"),
  location: z.string().default("Doylestown, PA"),
  distance: z.number().default(35),
  isRemote: z.boolean().default(false),
  resultsWanted: z.number().min(1).max(50).default(5),
  sites: z.array(z.string()).default(["indeed", "google"]),
  countryCode: z.string().default("USA"),
  hoursOld: z.number().default(72),
});

export type JobSpyQuery = z.infer<typeof JobSpyQuerySchema>;

/**
 * Result returned by the JobSpy bridge.
 */
export const JobSpyBridgeResultSchema = z.object({
  success: z.boolean(),
  requested_sites: z.array(z.string()),
  total_found: z.number(),
  errors: z.record(z.string(), z.string()).default({}),
  jobs: z.array(RawJobPostingSchema).default([]),
});

export type JobSpyBridgeResult = z.infer<typeof JobSpyBridgeResultSchema>;
