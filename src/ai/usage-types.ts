export type AiUsageRole = "owner" | "guest";
export type AiUsageStatus = "pending" | "succeeded" | "failed";

export interface AiUsageRecord {
  id: string;
  role: AiUsageRole;
  provider: string;
  model: string;
  prompt_version: string;
  started_at: string;
  completed_at: string | null;
  estimated_input_tokens: number;
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  latency_ms: number | null;
  status: AiUsageStatus;
  error_code: string | null;
}

export interface DailyAiBudget {
  starts_at: string;
  resets_at: string;
  max_requests: number;
  max_tokens: number;
}

export interface AiUsageSummary {
  owner_requests: number;
  owner_tokens: number;
  guest_requests: number;
  guest_tokens: number;
}

export class AiBudgetExceededError extends Error {
  constructor(
    readonly dimension: "requests" | "tokens",
    readonly limit: number,
    readonly used: number,
    readonly resetsAt: string
  ) {
    super(`Daily AI ${dimension} budget reached (${used}/${limit}). Resets at ${resetsAt}.`);
    this.name = "AiBudgetExceededError";
  }
}

export class AiOutboundDisabledError extends Error {
  constructor() {
    super("Outbound AI requests are disabled by AI_OUTBOUND_ENABLED.");
    this.name = "AiOutboundDisabledError";
  }
}

export class AiUsagePersistenceError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "AiUsagePersistenceError";
  }
}
