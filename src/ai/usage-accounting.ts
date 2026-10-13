import { randomUUID } from "node:crypto";
import { getRepository } from "../db/index.js";
import { JobPostingRepository } from "../db/repository-interface.js";
import {
  AiUsageRecord,
  AiUsageRole,
  DailyAiBudget,
  AiOutboundDisabledError,
  AiBudgetExceededError,
  AiUsagePersistenceError,
} from "./usage-types.js";
import { KeyTier, quotaTracker } from "./quota-tracker.js";

export interface TrackedAiCallOptions {
  role: AiUsageRole;
  provider: string;
  model: string;
  promptVersion: string;
  input: string;
  keyTier?: string;
  repository?: JobPostingRepository;
}

export interface AiTokenUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
}

export interface AiUsageRequest {
  recordId: string;
  complete: (response?: unknown) => Promise<void>;
  fail: (error: unknown) => Promise<void>;
}

function positiveIntegerSetting(name: string, defaultValue: number): number {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") return defaultValue;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

export function getDailyAiBudget(now = new Date()): DailyAiBudget {
  const starts = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const resets = new Date(starts.getTime() + 24 * 60 * 60 * 1000);
  return {
    starts_at: starts.toISOString(),
    resets_at: resets.toISOString(),
    max_requests: positiveIntegerSetting("AI_OWNER_DAILY_REQUEST_BUDGET", 100),
    max_tokens: positiveIntegerSetting("AI_OWNER_DAILY_TOKEN_BUDGET", 100_000),
  };
}

export function isOutboundAiEnabled(): boolean {
  const value = process.env.AI_OUTBOUND_ENABLED?.trim().toLowerCase();
  return value !== "false" && value !== "0" && value !== "off";
}

export function estimateInputTokens(input: string): number {
  return Math.max(1, Math.ceil(Buffer.byteLength(input, "utf8") / 4));
}

export function extractTokenUsage(response: unknown): AiTokenUsage {
  if (typeof response !== "object" || response === null) {
    return { inputTokens: null, outputTokens: null, totalTokens: null };
  }
  const result = response as Record<string, unknown>;
  const usage = [result.usage, result.usageMetadata, result.usage_metadata]
    .find((candidate) => typeof candidate === "object" && candidate !== null) as Record<string, unknown> | undefined;
  if (!usage) return { inputTokens: null, outputTokens: null, totalTokens: null };

  const inputTokens = tokenCount(
    usage.input_tokens ?? usage.inputTokens ?? usage.promptTokenCount ?? usage.prompt_token_count
  );
  const outputTokens = tokenCount(
    usage.output_tokens ?? usage.outputTokens ?? usage.candidatesTokenCount ?? usage.completion_tokens
  );
  const reportedTotal = tokenCount(usage.total_tokens ?? usage.totalTokens ?? usage.totalTokenCount);
  return {
    inputTokens,
    outputTokens,
    totalTokens: reportedTotal ?? (
      inputTokens !== null && outputTokens !== null ? inputTokens + outputTokens : null
    ),
  };
}

function tokenCount(value: unknown): number | null {
  const count = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isSafeInteger(count) && count >= 0 ? count : null;
}

function isKeyTier(tier: string | undefined): tier is KeyTier {
  return tier === "development" || tier === "guest" || tier === "owner_free" || tier === "owner_pro";
}

function isRateLimit(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const value = error as { status?: unknown; message?: unknown; error?: { code?: unknown } };
  const message = typeof value.message === "string" ? value.message.toLowerCase() : "";
  return value.status === 429 || value.error?.code === 429 || message.includes("429") || message.includes("quota");
}

function responseHeaders(response: unknown): Record<string, string | string[]> | undefined {
  if (typeof response !== "object" || response === null) return undefined;
  const result = response as { headers?: unknown; response?: { headers?: unknown } };
  const headers = result.response?.headers ?? result.headers;
  if (typeof headers !== "object" || headers === null) return undefined;
  if (headers instanceof Headers) return Object.fromEntries(headers.entries());
  return headers as Record<string, string | string[]>;
}

export async function beginTrackedAiRequest(
  options: TrackedAiCallOptions
): Promise<AiUsageRequest> {
  if (!isOutboundAiEnabled()) throw new AiOutboundDisabledError();

  const repository = options.repository ?? getRepository().repository;
  const startedAt = new Date();
  const record: AiUsageRecord = {
    id: randomUUID(),
    role: options.role,
    provider: options.provider,
    model: options.model,
    prompt_version: options.promptVersion,
    started_at: startedAt.toISOString(),
    completed_at: null,
    estimated_input_tokens: estimateInputTokens(options.input),
    input_tokens: null,
    output_tokens: null,
    total_tokens: null,
    latency_ms: null,
    status: "pending",
    error_code: null,
  };
  const budget = options.role === "owner" ? getDailyAiBudget(startedAt) : undefined;
  try {
    await repository.reserveAiUsage(record, budget);
  } catch (error) {
    if (error instanceof AiBudgetExceededError) throw error;
    throw new AiUsagePersistenceError("Could not reserve durable AI usage accounting.", { cause: error });
  }

  let settled = false;
  const finish = async (
    status: "succeeded" | "failed",
    response?: unknown,
    error?: unknown
  ): Promise<void> => {
    if (settled) throw new Error(`AI usage request ${record.id} is already finalized`);
    settled = true;
    const tokens = status === "succeeded"
      ? extractTokenUsage(response)
      : { inputTokens: null, outputTokens: null, totalTokens: null };
    try {
      await repository.finishAiUsage(record.id, {
        completed_at: new Date().toISOString(),
        input_tokens: tokens.inputTokens,
        output_tokens: tokens.outputTokens,
        total_tokens: tokens.totalTokens,
        latency_ms: Math.max(0, Date.now() - startedAt.getTime()),
        status,
        error_code: status === "failed"
          ? error instanceof Error ? error.name : "UnknownError"
          : null,
      });
    } catch (persistenceError) {
      throw new AiUsagePersistenceError("Could not persist AI usage results.", { cause: persistenceError });
    }
    if (isKeyTier(options.keyTier)) {
      if (status === "failed" && isRateLimit(error)) {
        quotaTracker.markExhausted(options.keyTier);
      } else if (status === "succeeded") {
        quotaTracker.recordResponseHeaders(options.keyTier, responseHeaders(response));
      }
    }
  };

  return {
    recordId: record.id,
    complete: (response) => finish("succeeded", response),
    fail: (error) => finish("failed", undefined, error),
  };
}

export async function runTrackedAiCall<T>(
  options: TrackedAiCallOptions,
  run: () => Promise<T>
): Promise<T> {
  const usage = await beginTrackedAiRequest(options);
  let response: T;
  try {
    response = await run();
  } catch (error) {
    await usage.fail(error);
    throw error;
  }
  await usage.complete(response);
  return response;
}
