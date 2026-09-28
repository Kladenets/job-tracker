import { translateRawJobPosting } from "../normalizers/job-translator";
import { RawJobPosting } from "../types/job";
import { UnifiedJobPosting } from "../types/job-posting";
import { getRepository } from "../db";
import { JobPostingRepository } from "../db/repository-interface";
import { evaluateDeterministicFilter } from "./deterministic-filter";
import { jevClassifier, FitClassifier } from "../ai/jev-classifier";
import { SearchProfile, loadSearchProfile } from "../config/search-profile";

export interface PipelineIngestResult {
  totalProcessed: number;
  newImported: number;
  filteredOut: number;
  screenedWithJev: number;
  duplicatesMatched: number;
  items: Array<{
    id: string;
    isNew: boolean;
    title: string;
    company: string;
    canonicalUrl?: string | null;
    status: string;
    availability: string;
    jevFit?: boolean | null;
    jevConfidence?: number | null;
  }>;
}

export interface IngestOptions {
  customRepo?: JobPostingRepository;
  customProfile?: SearchProfile;
  customClassifier?: FitClassifier;
}

/**
 * Core Ingestion Pipeline:
 * 1. Takes raw items from any source (JobSpy, Greenhouse, Lever, Manual)
 * 2. Normalizes, hashes, and formats to UnifiedJobPosting (retaining nulls for missing fields)
 * 3. Runs 2-tier deduplication check against the persistent database
 *    - If existing: updates availability and content if hash changed without overwriting user workflow state
 * 4. If new:
 *    - Runs deterministic hard qualification filter
 *    - If failed: sets job_status = 'filtered_out' and records failing rule & evidence
 *    - If passed: runs TypeSafe AI (JEV) fit classifier to compute boolean fit & confidence score
 * 5. Persists to database
 */
export async function ingestRawPostings(
  rawItems: RawJobPosting[],
  options?: IngestOptions
): Promise<PipelineIngestResult> {
  const repository = options?.customRepo || getRepository().repository;
  const profile = options?.customProfile || loadSearchProfile();
  const classifier = options?.customClassifier || jevClassifier;

  let newImported = 0;
  let duplicatesMatched = 0;
  let filteredOut = 0;
  let screenedWithJev = 0;
  const items: PipelineIngestResult["items"] = [];

  for (const raw of rawItems) {
    // 1. Translate & Normalize
    const normalized = translateRawJobPosting(raw);

    // 2. Fast 2-tier Deduplication Check
    const existing = await repository.findExisting({
      source: normalized.source,
      sourceJobId: normalized.source_job_id,
      canonicalUrl: normalized.canonical_url,
    });

    if (existing) {
      duplicatesMatched++;

      // Content Change Detection
      if (normalized.content_hash !== existing.content_hash) {
        await repository.updatePostingContent(existing.id, {
          description_text: normalized.description_text,
          content_hash: normalized.content_hash,
          crawler_data: normalized.crawler_data,
          availability: "open",
        });
      } else {
        await repository.updateAvailability(existing.id, "open", "Refreshed by ingestion crawl");
      }

      items.push({
        id: existing.id,
        isNew: false,
        title: normalized.title,
        company: normalized.company,
        canonicalUrl: existing.canonical_url,
        status: existing.job_status,
        availability: "open",
      });
    } else {
      newImported++;

      // 3. Deterministic Hard Qualification Filter
      const deterministicResult = evaluateDeterministicFilter(normalized, profile);

      if (!deterministicResult.passed) {
        filteredOut++;
        normalized.job_status = "filtered_out";
        if (normalized.crawler_data) {
          normalized.crawler_data.matched_rules = deterministicResult.matchedRules.map((r) => ({
            rule_id: r.rule_id,
            passed: r.passed,
            evidence: r.evidence,
          }));
        }
      } else {
        // 4. Automated Screening via TypeSafe AI (JEV)
        if (profile.jevScreening.enabled) {
          try {
            const jevResult = await classifier.classify(normalized, profile);
            screenedWithJev++;
            normalized.jev_fit = jevResult.fit;
            normalized.jev_confidence = jevResult.confidence;
          } catch (err) {
            console.warn(`[IngestionPipeline] JEV screening failed for ${normalized.title}:`, err);
          }
        }
      }

      // 5. Persist Posting
      const saved = await repository.savePosting(normalized);

      items.push({
        id: saved.id,
        isNew: true,
        title: saved.title,
        company: saved.company,
        canonicalUrl: saved.canonical_url,
        status: saved.job_status,
        availability: saved.availability,
        jevFit: saved.jev_fit,
        jevConfidence: saved.jev_confidence,
      });
    }
  }

  return {
    totalProcessed: rawItems.length,
    newImported,
    filteredOut,
    screenedWithJev,
    duplicatesMatched,
    items,
  };
}
