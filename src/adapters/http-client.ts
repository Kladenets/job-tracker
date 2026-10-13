export interface SourceHttpClientOptions {
  fetcher?: typeof fetch;
  sleep?: (delayMs: number) => Promise<void>;
  maxRetries?: number;
}

interface CachedResponse {
  text: string;
  etag?: string;
  lastModified?: string;
}

function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function parseRetryAfter(value: string | null, now = Date.now()): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, Math.min(seconds * 1_000, 30_000));
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, Math.min(date - now, 30_000)) : null;
}

export class SourceHttpClient {
  private readonly fetcher: typeof fetch;
  private readonly sleep: (delayMs: number) => Promise<void>;
  private readonly maxRetries: number;
  private readonly responses = new Map<string, CachedResponse>();

  constructor(
    private readonly sourceName: string,
    options: SourceHttpClientOptions = {}
  ) {
    this.fetcher = options.fetcher ?? fetch;
    this.sleep = options.sleep ?? wait;
    this.maxRetries = Math.max(0, Math.min(options.maxRetries ?? 2, 4));
  }

  async getText(
    url: string,
    options: { signal?: AbortSignal; headers?: RequestInit["headers"] } = {}
  ): Promise<string> {
    const cached = this.responses.get(url);
    const headers = new Headers(options.headers);
    if (cached?.etag) headers.set("If-None-Match", cached.etag);
    if (cached?.lastModified) headers.set("If-Modified-Since", cached.lastModified);

    for (let attempt = 0; ; attempt++) {
      let response: Response;
      try {
        response = await this.fetcher(url, {
          method: "GET",
          headers,
          signal: options.signal,
        });
      } catch (error) {
        if (options.signal?.aborted) {
          throw options.signal.reason instanceof Error
            ? options.signal.reason
            : new Error(`${this.sourceName} request aborted`);
        }
        if (attempt >= this.maxRetries) {
          throw new Error(`${this.sourceName} request failed after ${attempt + 1} attempt(s): ${error instanceof Error ? error.message : String(error)}`);
        }
        await this.pause(this.retryDelay(attempt), options.signal);
        continue;
      }

      if (response.status === 304) {
        if (!cached) throw new Error(`${this.sourceName} returned HTTP 304 without a cached response`);
        return cached.text;
      }
      if (response.ok) {
        const text = await response.text();
        this.responses.set(url, {
          text,
          etag: response.headers.get("etag") || cached?.etag,
          lastModified: response.headers.get("last-modified") || cached?.lastModified,
        });
        return text;
      }

      const retryable = response.status === 429 || response.status === 503 || response.status >= 500;
      if (retryable && attempt < this.maxRetries) {
        const retryAfter = parseRetryAfter(response.headers.get("retry-after"));
        await this.pause(retryAfter ?? this.retryDelay(attempt), options.signal);
        continue;
      }
      const rateLimit = response.status === 429
        ? " (rate limited; Retry-After exhausted)"
        : "";
      throw new Error(`${this.sourceName} request returned HTTP ${response.status}${rateLimit}`);
    }
  }

  private retryDelay(attempt: number): number {
    const exponential = Math.min(30_000, 500 * 2 ** attempt);
    return exponential + Math.floor(Math.random() * Math.min(exponential, 500));
  }

  private async pause(delayMs: number, signal?: AbortSignal): Promise<void> {
    if (!signal) {
      await this.sleep(delayMs);
      return;
    }
    if (signal.aborted) {
      throw signal.reason instanceof Error ? signal.reason : new Error(`${this.sourceName} request aborted`);
    }

    let onAbort: (() => void) | undefined;
    try {
      await Promise.race([
        this.sleep(delayMs),
        new Promise<never>((_resolve, reject) => {
          onAbort = () => reject(
            signal.reason instanceof Error ? signal.reason : new Error(`${this.sourceName} request aborted`)
          );
          signal.addEventListener("abort", onAbort, { once: true });
        }),
      ]);
    } finally {
      if (onAbort) signal.removeEventListener("abort", onAbort);
    }
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function stringValue(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

export function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/[$,\s]/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

export function validHttpUrl(value: unknown): string | undefined {
  const candidate = stringValue(value);
  if (!candidate) return undefined;
  try {
    const url = new URL(candidate);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function cleanHtmlText(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (match, code: string) => decodeCodePoint(match, code, 16))
    .replace(/&#([0-9]+);/g, (match, code: string) => decodeCodePoint(match, code, 10))
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

function decodeCodePoint(original: string, value: string, radix: number): string {
  const codePoint = Number.parseInt(value, radix);
  if (
    !Number.isInteger(codePoint) ||
    codePoint < 0 ||
    codePoint > 0x10ffff ||
    (codePoint >= 0xd800 && codePoint <= 0xdfff)
  ) {
    return original;
  }
  return String.fromCodePoint(codePoint);
}

export function normalizeDate(value: unknown): string | undefined {
  const text = stringValue(value);
  if (!text) return undefined;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}
