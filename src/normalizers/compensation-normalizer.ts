export interface ParsedCompensation {
  minAnnual: number | null;
  maxAnnual: number | null;
  currency: string;
  interval: "yearly" | "monthly" | "hourly" | "unknown";
  rawText: string | null;
}

/**
 * Extracts and annualizes compensation from explicit numbers or text strings.
 */
export function normalizeCompensation(params: {
  minAmount?: number | null;
  maxAmount?: number | null;
  interval?: string | null;
  currency?: string | null;
  text?: string | null;
}): ParsedCompensation {
  const { minAmount, maxAmount, interval, currency = "USD", text } = params;

  // Case 1: Explicit amounts provided by source (e.g. JobSpy)
  if (minAmount != null || maxAmount != null) {
    const rawInterval = (interval || "yearly").toLowerCase();
    let multiplier = 1;
    let normalizedInterval: "yearly" | "monthly" | "hourly" | "unknown" = "yearly";

    if (rawInterval.includes("hour")) {
      multiplier = 2080; // 40 hrs/wk * 52 wks
      normalizedInterval = "hourly";
    } else if (rawInterval.includes("month")) {
      multiplier = 12;
      normalizedInterval = "monthly";
    } else if (rawInterval.includes("week")) {
      multiplier = 52;
    } else if (rawInterval.includes("year") || rawInterval.includes("annual")) {
      multiplier = 1;
      normalizedInterval = "yearly";
    }

    const minAnnual = minAmount != null ? Math.round(minAmount * multiplier) : null;
    const maxAnnual = maxAmount != null ? Math.round(maxAmount * multiplier) : null;

    return {
      minAnnual,
      maxAnnual,
      currency: currency || "USD",
      interval: normalizedInterval,
      rawText: minAmount && maxAmount ? `$${minAmount} - $${maxAmount} / ${interval}` : null,
    };
  }

  // Case 2: Attempt extraction from description text (e.g. Greenhouse, Lever)
  if (text) {
    return extractCompensationFromText(text, currency || "USD");
  }

  return {
    minAnnual: null,
    maxAnnual: null,
    currency: currency || "USD",
    interval: "unknown",
    rawText: null,
  };
}

/**
 * Regex-based salary extractor for patterns like:
 * "$115,200 - $194,400 USD"
 * "$135,000 - $200,000/year"
 * "$60 - $85 / hour"
 * "$140k - $180k"
 */
function extractCompensationFromText(text: string, defaultCurrency: string): ParsedCompensation {
  // Regex looking for currency symbol followed by range
  const salaryRegex =
    /(?:\$|USD\s*)\s*(\d{1,3}(?:,\d{3})*|\d+)(?:\s*(?:k|K))?\s*(?:[-–—to]+)\s*(?:\$|USD\s*)?\s*(\d{1,3}(?:,\d{3})*|\d+)(?:\s*(?:k|K))?\s*(?:(USD|\/year|\/yr|per year|yearly|\/hr|\/hour|per hour|hourly))?/i;

  const match = text.match(salaryRegex);
  if (!match) {
    return {
      minAnnual: null,
      maxAnnual: null,
      currency: defaultCurrency,
      interval: "unknown",
      rawText: null,
    };
  }

  const rawMatchText = match[0].trim();
  let minStr = match[1].replace(/,/g, "");
  let maxStr = match[2].replace(/,/g, "");
  const unit = match[3]?.toLowerCase() || "";

  let minVal = parseFloat(minStr);
  let maxVal = parseFloat(maxStr);

  // Handle shorthand "k" / "K" e.g., $140k
  if (/(\$|\s)\d{2,3}k/i.test(rawMatchText) || (minVal < 1000 && maxVal < 1000 && !unit.includes("hr") && !unit.includes("hour"))) {
    if (minVal < 1000) minVal *= 1000;
    if (maxVal < 1000) maxVal *= 1000;
  }

  const isHourly = unit.includes("hr") || unit.includes("hour") || (maxVal < 300 && minVal > 15);
  const multiplier = isHourly ? 2080 : 1;
  const interval = isHourly ? "hourly" : "yearly";

  return {
    minAnnual: Math.round(minVal * multiplier),
    maxAnnual: Math.round(maxVal * multiplier),
    currency: defaultCurrency,
    interval,
    rawText: rawMatchText,
  };
}
