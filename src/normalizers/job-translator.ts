import { randomUUID } from "crypto";
import { RawJobPosting } from "../types/job";
import { UnifiedJobPosting } from "../types/job-posting";
import { normalizeUrl, hashContent } from "./url-normalizer";
import { normalizeCompensation } from "./compensation-normalizer";
import {
  normalizeSeniority,
  normalizeWorkplaceType,
  normalizeEmploymentType,
  cleanDescriptionText,
} from "./text-normalizer";

/**
 * Common list of common technical skills / keywords to detect in first-pass extraction.
 */
const COMMON_TECH_KEYWORDS = [
  "python", "typescript", "javascript", "react", "node.js", "nodejs", "go", "golang",
  "rust", "java", "c++", "c#", "ruby", "rails", "sql", "postgresql", "mysql", "mongodb",
  "aws", "gcp", "azure", "kubernetes", "docker", "terraform", "graphql", "rest", "fastapi",
  "next.js", "nextjs", "vue", "tailwind", "redis", "kafka", "langchain", "llm", "ai",
];

export function extractKeywords(text: string): string[] {
  const lower = text.toLowerCase();
  const matched = new Set<string>();

  for (const kw of COMMON_TECH_KEYWORDS) {
    const escaped = kw.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, "\\$1");
    const regex = new RegExp(`(^|[^a-zA-Z0-9+#])${escaped}($|[^a-zA-Z0-9+#])`, "i");
    if (regex.test(lower)) {
      matched.add(kw);
    }
  }

  return Array.from(matched);
}

/**
 * Translates any raw posting (JobSpy, Greenhouse, Lever, Manual)
 * into a valid UnifiedJobPosting entity.
 */
export function translateRawJobPosting(raw: RawJobPosting): UnifiedJobPosting {
  const now = new Date().toISOString();

  // 1. Text cleaning and hashing
  const descriptionText = cleanDescriptionText(raw.description);
  const contentHash = hashContent(descriptionText || raw.title);

  // 2. URL Normalization
  const canonicalUrl = normalizeUrl(raw.job_url_direct || raw.job_url);
  const sourceUrl = raw.job_url || canonicalUrl;

  // 3. Compensation Parsing
  const comp = normalizeCompensation({
    minAmount: raw.min_amount,
    maxAmount: raw.max_amount,
    interval: raw.interval,
    currency: raw.currency,
    text: descriptionText,
  });

  // 4. Seniority, Workplace, and Employment mapping
  const seniority = normalizeSeniority(raw.title, raw.job_level);
  const workplaceType = normalizeWorkplaceType({
    isRemote: raw.is_remote,
    location: raw.location,
    title: raw.title,
  });
  const employmentType = normalizeEmploymentType(raw.job_type);

  // 5. Detected Keywords
  const detectedTech = extractKeywords(`${raw.title} ${descriptionText}`);

  // 6. Build Crawler Observation Document (data.md section 47)
  const crawlerData = {
    version: "1.0.0",
    extracted_at: now,
    source: raw.site,
    source_job_id: raw.id ? String(raw.id) : null,
    raw_title: raw.title,
    raw_company: raw.company || null,
    raw_location: raw.location || null,
    raw_description: raw.description || null,
    raw_salary_text: comp.rawText,
    detected_technologies: detectedTech,
    detected_benefits: [],
    matched_rules: [],
  };

  return {
    id: randomUUID(),
    source: raw.site,
    source_job_id: raw.id ? String(raw.id) : null,
    source_url: sourceUrl || null,
    canonical_url: canonicalUrl || null,
    application_url: raw.job_url_direct || sourceUrl || null,
    content_hash: contentHash,

    title: raw.title.trim(),
    company: (raw.company || "Unknown Company").trim(),
    location: raw.location?.trim() || null,
    workplace_type: workplaceType,
    employment_type: employmentType,
    seniority,

    salary_min_annual: comp.minAnnual,
    salary_max_annual: comp.maxAnnual,
    currency: comp.currency,
    interval: comp.interval,
    raw_salary_text: comp.rawText,

    description_text: descriptionText,

    date_posted: raw.date_posted || null,
    date_discovered: now,
    last_checked_at: null,

    job_status: "discovered",
    availability: "open",
    availability_evidence: "Discovered during ingestion run",

    jev_fit: null,
    jev_confidence: null,

    crawler_data: crawlerData,
    ai_analysis: null,
    user_overrides: undefined,

    created_at: now,
    updated_at: now,
  };
}
