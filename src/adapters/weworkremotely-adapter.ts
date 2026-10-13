import { RawJobPosting } from "../types/job.js";
import {
  cleanHtmlText,
  normalizeDate,
  SourceHttpClient,
  validHttpUrl,
} from "./http-client.js";
import { SourceAdapter } from "./adapter-interface.js";

const WWR_FEEDS = [
  "https://weworkremotely.com/categories/remote-full-stack-programming-jobs.rss",
  "https://weworkremotely.com/categories/remote-front-end-programming-jobs.rss",
  "https://weworkremotely.com/categories/remote-back-end-programming-jobs.rss",
];

function decodeXml(value: string): string {
  return cleanHtmlText(value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1"));
}

function readTag(xml: string, tag: string): string | undefined {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = xml.match(new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)</${escaped}\\s*>`, "i"));
  return match ? decodeXml(match[1]) : undefined;
}

function parseFeed(xml: string): RawJobPosting[] {
  if (!/<rss\b|<feed\b/i.test(xml)) throw new Error("We Work Remotely returned an invalid RSS/XML feed");
  const items = Array.from(xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item\s*>/gi));
  const postings: RawJobPosting[] = [];

  for (const match of items) {
    const item = match[1];
    const title = readTag(item, "title");
    const url = validHttpUrl(readTag(item, "link"));
    const id = readTag(item, "guid") || url;
    if (!title || !url || !id) continue;

    const titleParts = title.match(/^(.{2,100}?):\s+(.+)$/);
    const description = readTag(item, "description") || "";
    const descriptionText = cleanHtmlText(description);
    const category = readTag(item, "category");
    const locationMatch = descriptionText.match(/\b(?:location|based in)\s*:\s*([^\n]+)/i);
    postings.push({
      id,
      site: "weworkremotely",
      job_url: url,
      job_url_direct: url,
      title: titleParts?.[2]?.trim() || title,
      company: titleParts?.[1]?.trim() || "Unknown Company",
      location: locationMatch?.[1]?.trim() || "Remote",
      date_posted: normalizeDate(readTag(item, "pubDate")),
      job_type: category,
      is_remote: true,
      description,
      company_industry: category,
    });
  }

  return postings;
}

export class WeWorkRemotelyAdapter implements SourceAdapter {
  readonly sourceName = "weworkremotely";
  private readonly http: SourceHttpClient;

  constructor(options: ConstructorParameters<typeof SourceHttpClient>[1] = {}) {
    this.http = new SourceHttpClient("We Work Remotely", options);
  }

  async fetchJobs(params: Record<string, unknown> = {}): Promise<RawJobPosting[]> {
    const signal = params.signal instanceof AbortSignal ? params.signal : undefined;
    const postings: RawJobPosting[] = [];
    for (const feedUrl of WWR_FEEDS) {
      const xml = await this.http.getText(feedUrl, {
        signal,
        headers: { "User-Agent": "JobTracker/1.0 (public job discovery)" },
      });
      postings.push(...parseFeed(xml));
    }
    return postings;
  }

  async checkAvailability(
    sourceJobId: string,
    extra?: Record<string, unknown>
  ): Promise<{ status: "open" | "closed" | "unknown"; evidence?: string }> {
    const url = validHttpUrl(extra?.url) || validHttpUrl(sourceJobId);
    if (!url) return { status: "unknown", evidence: "We Work Remotely posting URL is unavailable" };
    try {
      const text = await this.http.getText(url, {
        signal: extra?.signal instanceof AbortSignal ? extra.signal : undefined,
      });
      if (/\b(job|position|role)\s+(?:is\s+)?(?:no longer available|closed|filled|expired)\b/i.test(text)) {
        return { status: "closed", evidence: "Posting page explicitly reports that the job is closed or filled" };
      }
      return { status: "unknown", evidence: "Posting page loaded without an explicit availability marker" };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/HTTP 404\b/.test(message)) {
        return { status: "closed", evidence: "We Work Remotely returned HTTP 404 for the posting page" };
      }
      return { status: "unknown", evidence: `We Work Remotely availability request failed: ${message}` };
    }
  }
}
