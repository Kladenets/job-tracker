import crypto from "crypto";

/**
 * Normalizes URLs by removing common marketing/tracking query parameters,
 * session tokens, and anchors, while preserving the core destination URL.
 */
const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gh_src",
  "gh_jid",
  "lever-source",
  "lever-origin",
  "ref",
  "reference",
  "source",
  "fbclid",
  "gclid",
  "msclkid",
  "trk",
  "trackingId",
]);

export function normalizeUrl(rawUrl?: string | null): string | null {
  if (!rawUrl || typeof rawUrl !== "string") {
    return null;
  }

  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);

    // Remove tracking query parameters
    const searchKeys = Array.from(parsed.searchParams.keys());
    for (const key of searchKeys) {
      if (TRACKING_PARAMS.has(key.toLowerCase()) || key.startsWith("utm_")) {
        parsed.searchParams.delete(key);
      }
    }

    // Strip trailing hash/fragment anchors if standard navigation
    parsed.hash = "";

    // Standardize lowercase hostname and remove trailing slash from path
    let cleaned = parsed.toString();
    if (cleaned.endsWith("/") && parsed.pathname !== "/") {
      cleaned = cleaned.slice(0, -1);
    }

    return cleaned;
  } catch {
    // If not a standard URL, return trimmed original
    return trimmed;
  }
}

/**
 * Computes a SHA-256 hash over normalized text content.
 */
export function hashContent(text: string): string {
  const normalized = text.toLowerCase().replace(/\s+/g, " ").trim();
  return crypto.createHash("sha256").update(normalized, "utf8").digest("hex");
}
