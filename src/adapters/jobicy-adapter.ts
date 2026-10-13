import { RawJobPosting } from "../types/job.js";
import {
  cleanHtmlText,
  isRecord,
  normalizeDate,
  numberValue,
  SourceHttpClient,
  stringValue,
  validHttpUrl,
} from "./http-client.js";
import { SourceAdapter } from "./adapter-interface.js";

const JOBICY_API = "https://jobicy.com/api/v2/remote-jobs";

function parseJobs(text: string): Record<string, unknown>[] {
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch (error) {
    throw new Error(`Jobicy returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!isRecord(payload) || !Array.isArray(payload.jobs)) {
    throw new Error("Jobicy returned an invalid jobs response");
  }
  return payload.jobs.filter(isRecord);
}

function toPosting(item: Record<string, unknown>): RawJobPosting | null {
  const id = stringValue(item.id);
  const title = stringValue(item.jobTitle) || stringValue(item.title);
  if (!id || !title) return null;

  const postingUrl = validHttpUrl(item.url) || validHttpUrl(item.jobUrl);
  if (!postingUrl) return null;
  const description = stringValue(item.jobDescription) || stringValue(item.description) || "";
  const salaryMin = numberValue(item.annualSalaryMin);
  const salaryMax = numberValue(item.annualSalaryMax);
  const jobType = Array.isArray(item.jobType)
    ? item.jobType.map(stringValue).filter((value): value is string => Boolean(value)).join(", ")
    : stringValue(item.jobType);

  return {
    id,
    site: "jobicy",
    job_url: postingUrl,
    job_url_direct: postingUrl,
    title,
    company: stringValue(item.companyName) || stringValue(item.company) || "Unknown Company",
    location: stringValue(item.jobGeo) || "Remote",
    date_posted: normalizeDate(item.pubDate),
    job_type: jobType,
    salary_source: salaryMin !== undefined || salaryMax !== undefined ? "Jobicy annual salary fields" : undefined,
    interval: salaryMin !== undefined || salaryMax !== undefined ? "yearly" : undefined,
    min_amount: salaryMin,
    max_amount: salaryMax,
    currency: stringValue(item.salaryCurrency),
    is_remote: true,
    description: cleanHtmlText(description),
    company_url: validHttpUrl(item.companyUrl),
  };
}

export class JobicyAdapter implements SourceAdapter {
  readonly sourceName = "jobicy";
  private readonly http: SourceHttpClient;

  constructor(options: ConstructorParameters<typeof SourceHttpClient>[1] = {}) {
    this.http = new SourceHttpClient("Jobicy", options);
  }

  async fetchJobs(params: Record<string, unknown> = {}): Promise<RawJobPosting[]> {
    const count = typeof params.count === "number" && Number.isInteger(params.count)
      ? Math.max(1, Math.min(params.count, 50))
      : 50;
    const industry = stringValue(params.industry) || "tech";
    const url = new URL(JOBICY_API);
    url.searchParams.set("count", String(count));
    url.searchParams.set("industry", industry);
    const text = await this.http.getText(url.toString(), {
      signal: params.signal instanceof AbortSignal ? params.signal : undefined,
      headers: { "User-Agent": "JobTracker/1.0 (public job discovery)" },
    });
    return parseJobs(text)
      .map(toPosting)
      .filter((posting): posting is RawJobPosting => posting !== null);
  }

  async checkAvailability(
    sourceJobId: string,
    extra?: Record<string, unknown>
  ): Promise<{ status: "open" | "closed" | "unknown"; evidence?: string }> {
    try {
      const text = await this.http.getText(`${JOBICY_API}?count=50&industry=tech`, {
        signal: extra?.signal instanceof AbortSignal ? extra.signal : undefined,
      });
      const found = parseJobs(text).some((job) => stringValue(job.id) === sourceJobId);
      return found
        ? { status: "open", evidence: "Jobicy API currently lists this source job ID" }
        : { status: "unknown", evidence: "Jobicy API page did not contain this posting; page limits make absence inconclusive" };
    } catch (error) {
      return {
        status: "unknown",
        evidence: `Jobicy availability request failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}
