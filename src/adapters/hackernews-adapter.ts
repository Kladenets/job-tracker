import { RawJobPosting } from "../types/job.js";
import {
  cleanHtmlText,
  isRecord,
  normalizeDate,
  SourceHttpClient,
  stringValue,
  validHttpUrl,
} from "./http-client.js";
import { SourceAdapter } from "./adapter-interface.js";

const ALGOLIA_SEARCH = "https://hn.algolia.com/api/v1/search_by_date";
const FIREBASE_ITEM = "https://hacker-news.firebaseio.com/v0/item";

interface HackerNewsHit {
  objectID?: unknown;
  title?: unknown;
  comment_text?: unknown;
  created_at?: unknown;
  parent_id?: unknown;
  deleted?: unknown;
  dead?: unknown;
}

function parseHits(text: string): HackerNewsHit[] {
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch (error) {
    throw new Error(`Hacker News Algolia returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!isRecord(payload) || !Array.isArray(payload.hits)) {
    throw new Error("Hacker News Algolia returned an invalid search response");
  }
  return payload.hits.filter(isRecord) as HackerNewsHit[];
}

function parseComment(hit: HackerNewsHit): RawJobPosting | null {
  const id = stringValue(hit.objectID);
  const rawComment = stringValue(hit.comment_text);
  if (!id || !rawComment || hit.deleted === true || hit.dead === true) return null;

  const lines = cleanHtmlText(rawComment).split("\n").map((line) => line.trim()).filter(Boolean);
  const header = lines[0] || "";
  const fields = header.split("|").map((field) => field.trim()).filter(Boolean);
  const company = fields[0] || "Unknown Company";
  const title = fields[1] || "Hacker News job listing";
  const location = fields.length > 2
    ? fields.slice(2, 4).join(", ")
    : (/remote/i.test(header) ? "Remote" : null);
  const externalLink = Array.from(rawComment.matchAll(/href\s*=\s*["']([^"']+)["']/gi))
    .map((match) => validHttpUrl(match[1]))
    .find((url) => Boolean(url) && !/news\.ycombinator\.com/i.test(url!));
  const commentUrl = `https://news.ycombinator.com/item?id=${encodeURIComponent(id)}`;

  return {
    id,
    site: "hackernews",
    job_url: commentUrl,
    job_url_direct: externalLink || commentUrl,
    title,
    company,
    location,
    date_posted: normalizeDate(hit.created_at),
    job_type: fields.find((field) => /full.?time|contract|part.?time|internship/i.test(field)),
    is_remote: /remote/i.test(`${header}\n${rawComment}`) ? true : null,
    description: rawComment,
  };
}

export class HackerNewsAdapter implements SourceAdapter {
  readonly sourceName = "hackernews";
  private readonly http: SourceHttpClient;

  constructor(options: ConstructorParameters<typeof SourceHttpClient>[1] = {}) {
    this.http = new SourceHttpClient("Hacker News Algolia", options);
  }

  async fetchJobs(params: Record<string, unknown> = {}): Promise<RawJobPosting[]> {
    const maxThreads = typeof params.maxThreads === "number" && Number.isInteger(params.maxThreads)
      ? Math.max(1, Math.min(params.maxThreads, 5))
      : 3;
    const maxPages = typeof params.maxPages === "number" && Number.isInteger(params.maxPages)
      ? Math.max(1, Math.min(params.maxPages, 5))
      : 2;
    const signal = params.signal instanceof AbortSignal ? params.signal : undefined;
    const threadUrl = new URL(ALGOLIA_SEARCH);
    threadUrl.searchParams.set("tags", "story,author_whoishiring");
    threadUrl.searchParams.set("hitsPerPage", String(maxThreads));
    threadUrl.searchParams.set("page", "0");
    const threads = parseHits(await this.http.getText(threadUrl.toString(), { signal }));
    const selectedThreads = threads
      .filter((thread) =>
        /^\d+$/.test(stringValue(thread.objectID) || "") &&
        /who is hiring/i.test(stringValue(thread.title) || "")
      )
      .slice(0, maxThreads);
    const postings: RawJobPosting[] = [];

    for (const thread of selectedThreads) {
      const threadId = stringValue(thread.objectID);
      if (!threadId) continue;
      for (let page = 0; page < maxPages; page++) {
        const commentsUrl = new URL(ALGOLIA_SEARCH);
        commentsUrl.searchParams.set("tags", `comment,story_${threadId}`);
        commentsUrl.searchParams.set("hitsPerPage", "100");
        commentsUrl.searchParams.set("page", String(page));
        const pageHits = parseHits(await this.http.getText(commentsUrl.toString(), { signal }));
        for (const hit of pageHits) {
          const parentId = stringValue(hit.parent_id);
          if (parentId && parentId !== threadId) continue;
          const posting = parseComment(hit);
          if (posting) postings.push(posting);
        }
        if (pageHits.length < 100) break;
      }
    }
    return postings;
  }

  async checkAvailability(
    sourceJobId: string,
    extra?: Record<string, unknown>
  ): Promise<{ status: "open" | "closed" | "unknown"; evidence?: string }> {
    if (!/^\d+$/.test(sourceJobId)) {
      return { status: "unknown", evidence: "Hacker News source ID is not a numeric item ID" };
    }
    try {
      const signal = extra?.signal instanceof AbortSignal ? extra.signal : undefined;
      const text = await this.http.getText(`${FIREBASE_ITEM}/${encodeURIComponent(sourceJobId)}.json`, { signal });
      const item: unknown = JSON.parse(text);
      if (!isRecord(item)) {
        return { status: "unknown", evidence: "Hacker News item endpoint returned no item" };
      }
      if (item.dead === true || item.deleted === true) {
        return { status: "closed", evidence: "Hacker News item is explicitly marked dead or deleted" };
      }
      return { status: "open", evidence: "Hacker News Firebase API returned the active source item" };
    } catch (error) {
      return {
        status: "unknown",
        evidence: `Hacker News availability request failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}
