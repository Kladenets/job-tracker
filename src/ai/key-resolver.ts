/**
 * Multi-Tier and Environment-Aware Gemini API Key Resolver
 *
 * Rules:
 * 1. Development & Staging (NODE_ENV !== "production" or APP_ENV === "staging" | "development"):
 *    - Prefers GEMINI_API_KEY (the default Google AI Studio secret) so local/staging testing
 *      never consumes production tokens.
 *    - Also accepts legacy DEVELOPMENT_GEMINI_API_KEY if configured.
 * 2. Role = 'guest':
 *    - Uses PROD_GUEST_GEMINI_API_KEY_FREE (isolating public visitors from owner quotas).
 * 3. Role = 'owner' in Production:
 *    - Primary: PROD_GEMINI_API_KEY_FREE (free tier)
 *    - Failover: PROD_GEMINI_API_KEY_PRO (pro/paid backup) if free tier quota is exhausted or HTTP 429
 *    - Fallback: GEMINI_API_KEY if production keys are not yet configured.
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
  console.warn(`[AI Key Resolver] Failover to PROD_GEMINI_API_KEY_PRO triggered. Active until ${new Date(failoverActiveUntil).toISOString()}`);
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

  // 1. If in development or staging, prefer GEMINI_API_KEY (AI Studio secret) or legacy DEVELOPMENT_GEMINI_API_KEY
  const devKey = process.env.GEMINI_API_KEY?.trim() || process.env.DEVELOPMENT_GEMINI_API_KEY?.trim();
  if (isDevOrStaging && devKey) {
    return {
      apiKey: devKey,
      tier: "development",
      failoverActive: false,
    };
  }

  // 2. If guest role
  if (options?.role === "guest") {
    const guestKey =
      process.env.PROD_GUEST_GEMINI_API_KEY_FREE?.trim() ||
      process.env.GUEST_GEMINI_API_KEY?.trim();
    if (guestKey) {
      return { apiKey: guestKey, tier: "guest", failoverActive: false };
    }
    return { apiKey: undefined, tier: "none", failoverActive: false };
  }

  // 3. Owner role (Production or dev fallback when GEMINI_API_KEY is not set)
  const failoverEngaged = options?.preferProBackup || isFailoverActive();
  const proKey = process.env.PROD_GEMINI_API_KEY_PRO?.trim() || process.env.GEMINI_API_KEY_PRO?.trim();
  const freeKey = process.env.PROD_GEMINI_API_KEY_FREE?.trim() || process.env.GEMINI_API_KEY_FREE?.trim();

  if (failoverEngaged && proKey) {
    return {
      apiKey: proKey,
      tier: "owner_pro",
      failoverActive: true,
    };
  }

  if (freeKey) {
    return {
      apiKey: freeKey,
      tier: "owner_free",
      failoverActive: false,
    };
  }

  if (proKey) {
    return {
      apiKey: proKey,
      tier: "owner_pro",
      failoverActive: false,
    };
  }

  // Fallback to GEMINI_API_KEY even in production if PROD_* keys are not yet configured
  if (process.env.GEMINI_API_KEY?.trim()) {
    return {
      apiKey: process.env.GEMINI_API_KEY.trim(),
      tier: "development",
      failoverActive: false,
    };
  }

  return { apiKey: undefined, tier: "none", failoverActive: false };
}
