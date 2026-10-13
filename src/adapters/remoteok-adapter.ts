import { RawJobPosting } from "../types/job.js";
import {
  isRecord,
  normalizeDate,
  numberValue,
  SourceHttpClient,
  stringValue,
  validHttpUrl,
} from "./http-client.js";
import { SourceAdapter } from "./adapter-interface.js";

const REMOTEOK_API = "https://remoteok.com/api";

function parsePayload(text: string): Record<string, unknown>[] {
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch (error) {
    throw new Error(`RemoteOK returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!Array.isArray(payload)) throw new Error("RemoteOK returned an invalid job-list response");
  return payload.filter(isRecord);
}

function toPosting(item: Record<string, unknown>): RawJobPosting | null {
  const id = stringValue(item.id) || stringValue(item.slug);
  const title = stringValue(item.position) || stringValue(item.title);
  if (!id || !title) return null;

  const rawTags = Array.isArray(item.tags)
    ? item.tags.map(stringValue).filter((tag): tag is string => Boolean(tag))
    : [];
  const description = stringValue(item.description) || "";
  const descriptionWithTags = rawTags.length > 0
    ? `${description}\n\nSkills/tags: ${rawTags.join(", ")}`
    : description;
  const postingUrl = validHttpUrl(item.url)
    || (stringValue(item.slug)
      ? `https://remoteok.com/remote-jobs/${encodeURIComponent(String(item.slug))}`
      : `https://remoteok.com/remote-jobs/${encodeURIComponent(id)}`);
  const applicationUrl = validHttpUrl(item.apply_url) || postingUrl;
  const salaryMin = numberValue(item.salary_min);
  const salaryMax = numberValue(item.salary_max);

  return {
    id,
    site: "remoteok",
    job_url: postingUrl,
    job_url_direct: applicationUrl,
    title,
    company: stringValue(item.company) || "Unknown Company",
    location: stringValue(item.location) || "Remote",
    date_posted: normalizeDate(item.date),
    job_type: stringValue(item.job_type),
    salary_source: salaryMin !== undefined || salaryMax !== undefined ? "RemoteOK" : undefined,
    interval: salaryMin !== undefined || salaryMax !== undefined ? "yearly" : undefined,
    min_amount: salaryMin,
    max_amount: salaryMax,
    currency: stringValue(item.salary_currency) || stringValue(item.currency),
    is_remote: true,
    description: descriptionWithTags,
    company_url: validHttpUrl(item.company_url),
  };
}

export class RemoteOkAdapter implements SourceAdapter {
  readonly sourceName = "remoteok";
  private readonly http: SourceHttpClient;

  constructor(options: ConstructorParameters<typeof SourceHttpClient>[1] = {}) {
    this.http = new SourceHttpClient("RemoteOK", options);
  }

  async fetchJobs(params: Record<string, unknown> = {}): Promise<RawJobPosting[]> {
    const text = await this.http.getText(REMOTEOK_API, {
      signal: params.signal instanceof AbortSignal ? params.signal : undefined,
      headers: { "User-Agent": "JobTracker/1.0 (public job discovery)" },
    });
    return parsePayload(text)
      .map(toPosting)
      .filter((posting): posting is RawJobPosting => posting !== null);
  }

  async checkAvailability(
    sourceJobId: string,
    extra?: Record<string, unknown>
  ): Promise<{ status: "open" | "closed" | "unknown"; evidence?: string }> {
    try {
      const text = await this.http.getText(REMOTEOK_API, {
        signal: extra?.signal instanceof AbortSignal ? extra.signal : undefined,
      });
      const found = parsePayload(text).some((job) =>
        [stringValue(job.id), stringValue(job.slug)].includes(sourceJobId)
      );
      return found
        ? { status: "open", evidence: "RemoteOK API currently lists this source job ID" }
        : { status: "unknown", evidence: "RemoteOK listing did not contain the posting; absence alone is inconclusive" };
    } catch (error) {
      return {
        status: "unknown",
        evidence: `RemoteOK availability request failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}
