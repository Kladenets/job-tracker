export type HealthTone = "healthy" | "warning" | "unavailable" | "unknown";

export interface HealthDisplayState {
  label: string;
  description: string;
  tone: HealthTone;
}

export type PersistenceEngine = "file" | "postgres";
export type GeminiKeyTier = "development" | "guest" | "owner_free" | "owner_pro" | "none";

export function getDatabaseHealthDisplay(
  engine?: PersistenceEngine,
  postgresConnected?: boolean
): HealthDisplayState {
  if (engine === "file") {
    return {
      label: "Active",
      description: "File-backed repository is active.",
      tone: "healthy",
    };
  }
  if (engine !== "postgres") {
    return {
      label: "Unknown",
      description: "Persistence status could not be retrieved.",
      tone: "unknown",
    };
  }
  if (postgresConnected === true) {
    return {
      label: "Connected",
      description: "PostgreSQL connectivity probe succeeded.",
      tone: "healthy",
    };
  }
  if (postgresConnected === false) {
    return {
      label: "Unavailable",
      description: "PostgreSQL is selected, but its connectivity probe failed.",
      tone: "unavailable",
    };
  }
  return {
    label: "Unknown",
    description: "PostgreSQL connectivity could not be retrieved.",
    tone: "unknown",
  };
}

export function getGeminiTierDisplay(
  tier?: GeminiKeyTier,
  failoverActive = false
): HealthDisplayState {
  switch (tier) {
    case "development":
      return { label: "Development Key", description: "Development provider key selected.", tone: "healthy" };
    case "guest":
      return { label: "Guest Tier", description: "Isolated guest provider key selected.", tone: "healthy" };
    case "owner_free":
      return { label: "Free Tier", description: "Owner free-tier key selected.", tone: "healthy" };
    case "owner_pro":
      return failoverActive
        ? { label: "Pro Backup", description: "Owner Pro failover cooldown is active.", tone: "warning" }
        : { label: "Pro Tier", description: "Owner Pro key selected.", tone: "healthy" };
    case "none":
      return { label: "Offline", description: "No Gemini provider key is configured.", tone: "unavailable" };
    default:
      return { label: "Unknown", description: "Gemini provider status could not be retrieved.", tone: "unknown" };
  }
}