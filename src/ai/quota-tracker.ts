/**
 * In-Memory Key Quota & Telemetry Tracker
 *
 * Rules:
 * 1. Passive tracking only: Never makes synthetic requests just to check quota.
 * 2. Header capture: Captures standard Google ratelimit headers if present in API responses
 *    (x-ratelimit-remaining-requests, x-ratelimit-remaining-tokens, x-ratelimit-reset).
 * 3. Daily Exhaustion reset:
 *    Google Gemini API free tier daily quotas (RPD) reset at midnight Pacific Time (00:00 PST / 08:00 UTC).
 * 4. Lazy check:
 *    When a request comes in, if owner_free was marked exhausted, we check if the current time has passed
 *    the refresh timestamp. If it has, owner_free is unexhausted on-the-fly and tried again.
 *    No background timer, polling, or cron job is used.
 */

export type KeyTier = "development" | "guest" | "owner_free" | "owner_pro";

export interface TierTelemetry {
  tier: KeyTier;
  configured: boolean;
  lastUsedAt: string | null;
  remainingRequests: number | null;
  remainingTokens: number | null;
  resetTime: string | null;
  isExhausted: boolean;
  exhaustedUntil: string | null; // ISO timestamp
}

class QuotaTracker {
  private telemetry: Record<KeyTier, TierTelemetry> = {
    development: {
      tier: "development",
      configured: false,
      lastUsedAt: null,
      remainingRequests: null,
      remainingTokens: null,
      resetTime: null,
      isExhausted: false,
      exhaustedUntil: null,
    },
    guest: {
      tier: "guest",
      configured: false,
      lastUsedAt: null,
      remainingRequests: null,
      remainingTokens: null,
      resetTime: null,
      isExhausted: false,
      exhaustedUntil: null,
    },
    owner_free: {
      tier: "owner_free",
      configured: false,
      lastUsedAt: null,
      remainingRequests: null,
      remainingTokens: null,
      resetTime: null,
      isExhausted: false,
      exhaustedUntil: null,
    },
    owner_pro: {
      tier: "owner_pro",
      configured: false,
      lastUsedAt: null,
      remainingRequests: null,
      remainingTokens: null,
      resetTime: null,
      isExhausted: false,
      exhaustedUntil: null,
    },
  };

  /**
   * Computes the next occurrence of midnight Pacific Time (America/Los_Angeles).
   * Google's official documentation states that free tier daily requests (RPD) reset at midnight PT.
   */
  public getNextPacificMidnight(): Date {
    const now = new Date();
    // Convert current UTC time to a string representation in Pacific Time
    const ptDateStr = now.toLocaleDateString("en-US", { timeZone: "America/Los_Angeles" });
    const ptDate = new Date(ptDateStr);
    
    // Add 1 day to reach tomorrow in Pacific Time
    ptDate.setDate(ptDate.getDate() + 1);

    // Approximate offset: Pacific is UTC-8 (PST) or UTC-7 (PDT)
    // To be exact, find the midnight UTC instant corresponding to PT 00:00:00
    const year = ptDate.getFullYear();
    const month = String(ptDate.getMonth() + 1).padStart(2, "0");
    const day = String(ptDate.getDate()).padStart(2, "0");
    
    // Use Intl to determine whether PDT (-07:00) or PST (-08:00) is currently in effect
    const testMidnight = new Date(`${year}-${month}-${day}T00:00:00Z`);
    const ptHour = parseInt(
      new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Los_Angeles",
        hour: "numeric",
        hour12: false,
      }).format(testMidnight),
      10
    );
    // If at 00:00 UTC it is 16:00 or 17:00 PT yesterday, offset is 7 or 8 hours
    const offsetHours = (24 - ptHour) % 24;
    return new Date(Date.UTC(year, ptDate.getMonth(), ptDate.getDate(), offsetHours, 0, 0));
  }

  /**
   * Lazy evaluation of exhausted state.
   * Called strictly at the moment a request is sent.
   */
  public isTierExhausted(tier: KeyTier): boolean {
    const info = this.telemetry[tier];
    if (!info.isExhausted) {
      return false;
    }

    if (!info.exhaustedUntil) {
      info.isExhausted = false;
      return false;
    }

    const now = new Date();
    const expiry = new Date(info.exhaustedUntil);

    if (now >= expiry) {
      // Time has passed! Re-open tier on-the-fly with 0 extra requests made
      info.isExhausted = false;
      info.exhaustedUntil = null;
      console.log(`[QuotaTracker] Lazy evaluation: Tier '${tier}' exhaustedUntil reached (${expiry.toISOString()}). Re-enabling tier.`);
      return false;
    }

    return true;
  }

  /**
   * Mark tier as exhausted (e.g. after receiving a 429).
   */
  public markExhausted(tier: KeyTier, resetHeaderValue?: string): void {
    const record = this.telemetry[tier];
    record.isExhausted = true;
    record.lastUsedAt = new Date().toISOString();

    if (resetHeaderValue) {
      // If the API provided a specific reset duration or timestamp
      const parsedSeconds = parseInt(resetHeaderValue, 10);
      if (!isNaN(parsedSeconds) && parsedSeconds > 0) {
        const target = new Date(Date.now() + parsedSeconds * 1000);
        record.exhaustedUntil = target.toISOString();
        return;
      }
    }

    // Default to the publicly documented Google daily quota refresh (Midnight Pacific Time)
    const nextReset = this.getNextPacificMidnight();
    record.exhaustedUntil = nextReset.toISOString();
    console.warn(`[QuotaTracker] Tier '${tier}' marked EXHAUSTED. Next refresh scheduled for ${record.exhaustedUntil} (Midnight Pacific).`);
  }

  /**
   * Record headers returned from a real Gemini API call
   */
  public recordResponseHeaders(tier: KeyTier, headers: Record<string, string | string[] | undefined> | undefined): void {
    const record = this.telemetry[tier];
    record.lastUsedAt = new Date().toISOString();

    if (!headers) return;

    // Normalizing lowercased keys
    const lowerHeaders: Record<string, string> = {};
    for (const [k, v] of Object.entries(headers)) {
      if (typeof v === "string") {
        lowerHeaders[k.toLowerCase()] = v;
      } else if (Array.isArray(v) && v.length > 0) {
        lowerHeaders[k.toLowerCase()] = v[0];
      }
    }

    const reqRemaining = lowerHeaders["x-ratelimit-remaining-requests"];
    if (reqRemaining !== undefined) {
      const parsed = parseInt(reqRemaining, 10);
      if (!isNaN(parsed)) record.remainingRequests = parsed;
    }

    const tokensRemaining = lowerHeaders["x-ratelimit-remaining-tokens"];
    if (tokensRemaining !== undefined) {
      const parsed = parseInt(tokensRemaining, 10);
      if (!isNaN(parsed)) record.remainingTokens = parsed;
    }

    const reset = lowerHeaders["x-ratelimit-reset"];
    if (reset !== undefined) {
      record.resetTime = reset;
    }
  }

  /**
   * Returns snapshot for authenticated owner view.
   * Public visitors never see this.
   */
  public getOwnerStatus(activeTier: KeyTier | "none"): {
    activeTier: KeyTier | "none";
    badgeText: string;
    telemetry: Record<KeyTier, TierTelemetry>;
  } {
    // Determine friendly badge label
    let badgeText = "AI: Unavailable";
    if (activeTier === "development") {
      badgeText = "Development Tier";
    } else if (activeTier === "owner_pro") {
      badgeText = "Pro Tier";
    } else if (activeTier === "owner_free") {
      badgeText = "Free Tier";
    } else if (activeTier === "guest") {
      badgeText = "Guest Mode";
    }

    return {
      activeTier,
      badgeText,
      telemetry: { ...this.telemetry },
    };
  }
}

export const quotaTracker = new QuotaTracker();
