import { SeniorityLevel, WorkplaceType, EmploymentType } from "../types/job-posting";

/**
 * Maps varying source seniority terms into our canonical SeniorityLevel enum.
 */
export function normalizeSeniority(title?: string | null, levelText?: string | null): SeniorityLevel {
  const combined = `${title || ""} ${levelText || ""}`.toLowerCase();

  if (/\b(intern|internship|co-op)\b/.test(combined)) return "intern";
  if (/\b(junior|entry|associate|level 1|l1|new grad)\b/.test(combined)) return "entry";
  if (/\b(staff|principal|distinguished|fellow|architect)\b/.test(combined)) return "lead";
  if (/\b(director|vp|vice president|head of)\b/.test(combined)) return "director";
  if (/\b(manager|lead|engineering manager|tech lead)\b/.test(combined)) return "lead";
  if (/\b(executive|c-level|cto|cio|ceo)\b/.test(combined)) return "executive";
  if (/\b(senior|sr|sr\.|level 3|l3|l4|l5)\b/.test(combined)) return "senior";
  if (/\b(mid|intermediate|level 2|l2)\b/.test(combined)) return "mid";

  return "unknown";
}

/**
 * Maps workplace strings into remote / hybrid / onsite / unknown.
 */
export function normalizeWorkplaceType(params: {
  isRemote?: boolean | null;
  location?: string | null;
  title?: string | null;
  workplaceType?: string | null;
}): WorkplaceType {
  const { isRemote, location = "", title = "", workplaceType = "" } = params;
  const combined = `${location || ""} ${title || ""} ${workplaceType || ""}`.toLowerCase();

  if (combined.includes("hybrid")) {
    return "hybrid";
  }

  if (isRemote === true || combined.includes("remote") || combined.includes("anywhere") || combined.includes("virtual")) {
    return "remote";
  }

  if (combined.includes("on-site") || combined.includes("onsite") || combined.includes("in-office")) {
    return "onsite";
  }

  if (isRemote === false && location && location.trim().length > 0) {
    return "onsite";
  }

  return "unknown";
}

/**
 * Normalizes employment type strings (full-time, contract, etc.).
 */
export function normalizeEmploymentType(typeStr?: string | null): EmploymentType {
  if (!typeStr) return "unknown";
  const lower = typeStr.toLowerCase();

  if (lower.includes("full") || lower.includes("permanent")) return "full_time";
  if (lower.includes("contract") || lower.includes("contractor") || lower.includes("freelance")) return "contract";
  if (lower.includes("part")) return "part_time";
  if (lower.includes("intern")) return "internship";
  if (lower.includes("temp")) return "temporary";

  return "unknown";
}

/**
 * Cleans raw HTML/text into standard markdown or readable plain text with preserved paragraphs.
 */
export function cleanDescriptionText(raw?: string | null): string {
  if (!raw) return "";

  let cleaned = raw
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");

  // Strip script and style blocks
  cleaned = cleaned.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  cleaned = cleaned.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");

  // Convert list items, breaks, and paragraph tags to readable newlines
  cleaned = cleaned.replace(/<li[^>]*>/gi, "\n• ");
  cleaned = cleaned.replace(/<\/li>/gi, "");
  cleaned = cleaned.replace(/<br\s*[\/]?>/gi, "\n");
  cleaned = cleaned.replace(/<\/p>/gi, "\n\n");
  cleaned = cleaned.replace(/<h[1-6][^>]*>/gi, "\n\n### ");
  cleaned = cleaned.replace(/<\/h[1-6]>/gi, "\n");

  // Strip any remaining HTML tags
  cleaned = cleaned.replace(/<[^>]+>/g, "");

  // Standardize consecutive whitespace and lines
  cleaned = cleaned
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return cleaned;
}
