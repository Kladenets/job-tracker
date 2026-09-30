/**
 * Multi-Tier and Environment-Aware Gemini API Key Resolver
 *
 * Rules:
 * 1. Development & Staging (NODE_ENV !== "production" or APP_ENV === "staging" | "development"):
 *    - Prefers DEVELOPMENT_GEMINI_API_KEY so local/staging testing never consumes production tokens.
 * 2. Role = 'guest':
 *    - Uses GUEST_GEMINI_API_KEY (isolating public visitors from owner quotas).
 * 3. Role = 'owner' in Production:
 *    - Primary: GEMINI_API_KEY_FREE (free tier)
 *    - Failover: GEMINI_API_KEY_PRO (pro/paid backup) if free tier quota is exhausted or HTTP 429
 */

export interface KeyResolutionOptions {
  role?: "owner" | "guest";
  preferProBackup?: boolean;
}

export type KeyTier = "development" | "guest" | "owner_free" | "owner_pro" | "none";

// Dynamic in-memory failover state tracking (resets after cooldown or manual reset)
let failoverActiveUntil: number = 0;
const FAILOVER_COOLDOWN_MS = 60 * 60 * 1000; // 60 minutes cooldown

export function triggerProFailover(): void {
  failoverActiveUntil = Date.now() + FAILOVER_COOLDOWN_MS;
  console.warn(`[AI Key Resolver] Failover to GEMINI_API_KEY_PRO triggered. Active until ${new Date(failoverActiveUntil).toISOString()}`);
}

export function isFailoverActive(): boolean {
  return Date.now() < failoverActiveUntil;
}

export function resetFailover(): void {
  failoverActiveUntil = 0;
}

export function resolveGeminiApiKey(options?: KeyResolutionOptions): {
  apiKey: string | undefined;
  tier: KeyTier;
  failoverActive: boolean;
} {
  const isDevOrStaging =
    process.env.NODE_ENV !== "production" ||
    process.env.APP_ENV === "staging" ||
    process.env.APP_ENV === "development";

  // 1. If in development or staging, prefer DEVELOPMENT_GEMINI_API_KEY
  if (isDevOrStaging && process.env.DEVELOPMENT_GEMINI_API_KEY?.trim()) {
    return {
      apiKey: process.env.DEVELOPMENT_GEMINI_API_KEY.trim(),
      tier: "development",
      failoverActive: false,
    };
  }

  // 2. If guest role
  if (options?.role === "guest") {
    const guestKey = process.env.GUEST_GEMINI_API_KEY?.trim();
    if (guestKey) {
      return { apiKey: guestKey, tier: "guest", failoverActive: false };
    }
    return { apiKey: undefined, tier: "none", failoverActive: false };
  }

  // 3. Owner role (Production or dev fallback when DEVELOPMENT_GEMINI_API_KEY is not set)
  const failoverEngaged = options?.preferProBackup || isFailoverActive();

  if (failoverEngaged && process.env.GEMINI_API_KEY_PRO?.trim()) {
    return {
      apiKey: process.env.GEMINI_API_KEY_PRO.trim(),
      tier: "owner_pro",
      failoverActive: true,
    };
  }

  if (process.env.GEMINI_API_KEY_FREE?.trim()) {
    return {
      apiKey: process.env.GEMINI_API_KEY_FREE.trim(),
      tier: "owner_free",
      failoverActive: false,
    };
  }

  if (process.env.GEMINI_API_KEY_PRO?.trim()) {
    return {
      apiKey: process.env.GEMINI_API_KEY_PRO.trim(),
      tier: "owner_pro",
      failoverActive: false,
    };
  }

  return { apiKey: undefined, tier: "none", failoverActive: false };
}
