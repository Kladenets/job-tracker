import { translateRawJobPosting } from "../normalizers/job-translator";
import { RawJobPosting } from "../types/job";
import { UnifiedJobPosting } from "../types/job-posting";
import { getRepository } from "../db";
import { JobPostingRepository } from "../db/repository-interface";

export interface PipelineIngestResult {
  totalProcessed: number;
  newImported: number;
  duplicatesMatched: number;
  items: Array<{
    id: string;
    isNew: boolean;
    title: string;
    company: string;
    canonicalUrl?: string | null;
    status: string;
    availability: string;
  }>;
}

/**
 * Core Ingestion Pipeline:
 * 1. Takes raw items from any source (JobSpy, Greenhouse, Lever, Manual)
 * 2. Normalizes, hashes, and formats to UnifiedJobPosting
 * 3. Runs 2-tier deduplication check against the persistent database
 * 4. If new: inserts with job_status = 'discovered'
 * 5. If existing: updates availability and last_checked_at without overwriting user workflow state
 */
export async function ingestRawPostings(
  rawItems: RawJobPosting[],
  customRepo?: JobPostingRepository
): Promise<PipelineIngestResult> {
  const repository = customRepo || getRepository().repository;

  let newImported = 0;
  let duplicatesMatched = 0;
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
      // Update availability and touch last_checked_at
      await repository.updateAvailability(existing.id, "open", "Refreshed by ingestion crawl");

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
      // Insert new posting
      const saved = await repository.savePosting(normalized);

      items.push({
        id: saved.id,
        isNew: true,
        title: saved.title,
        company: saved.company,
        canonicalUrl: saved.canonical_url,
        status: saved.job_status,
        availability: saved.availability,
      });
    }
  }

  return {
    totalProcessed: rawItems.length,
    newImported,
    duplicatesMatched,
    items,
  };
}
