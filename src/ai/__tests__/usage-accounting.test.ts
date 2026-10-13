import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { GoogleGenAI } from "@google/genai";
import { Conversation } from "../agent/conversation.js";
import { GeminiAgent } from "../agent/gemini-agent.js";
import { loadSearchProfile } from "../../config/search-profile.js";
import { FileJobRepository } from "../../db/file-repository.js";
import { runTrackedAiCall } from "../usage-accounting.js";
import { AiBudgetExceededError, AiOutboundDisabledError } from "../usage-types.js";

async function runTests(): Promise<void> {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "job-tracker-ai-usage-"));
  const storePath = path.join(temporaryDirectory, "store.json");
  const envNames = [
    "AI_OUTBOUND_ENABLED",
    "AI_OWNER_DAILY_REQUEST_BUDGET",
    "AI_OWNER_DAILY_TOKEN_BUDGET",
  ] as const;
  const originalEnvironment = new Map(envNames.map((name) => [name, process.env[name]]));

  try {
    delete process.env.AI_OUTBOUND_ENABLED;
    process.env.AI_OWNER_DAILY_REQUEST_BUDGET = "2";
    process.env.AI_OWNER_DAILY_TOKEN_BUDGET = "10";
    const repository = new FileJobRepository(storePath);

    await runTrackedAiCall({
      role: "owner",
      provider: "gemini",
      model: "gemini-test",
      promptVersion: "unit-prompt-v1",
      input: "first owner prompt",
      repository,
    }, async () => ({
      usageMetadata: {
        promptTokenCount: 2,
        candidatesTokenCount: 3,
        totalTokenCount: 5,
      },
    }));

    for (let index = 0; index < 3; index++) {
      await runTrackedAiCall({
        role: "guest",
        provider: "gemini",
        model: "gemini-test",
        promptVersion: "guest-prompt-v1",
        input: `guest prompt ${index}`,
        repository,
      }, async () => ({ usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } }));
    }

    await runTrackedAiCall({
      role: "owner",
      provider: "typesafe",
      model: "jev-test",
      promptVersion: "jev-fit-v1",
      input: "second owner prompt",
      repository,
    }, async () => ({ usage: { input_tokens: 2, output_tokens: 3, total_tokens: 5 } }));

    await assert.rejects(
      runTrackedAiCall({
        role: "owner",
        provider: "gemini",
        model: "gemini-test",
        promptVersion: "unit-prompt-v1",
        input: "blocked by request budget",
        repository,
      }, async () => {
        throw new Error("A request over budget must not reach the provider");
      }),
      AiBudgetExceededError
    );

    const startsAt = new Date();
    startsAt.setUTCHours(0, 0, 0, 0);
    const summary = await repository.getAiUsageSummary(startsAt.toISOString());
    assert.deepEqual(summary, {
      owner_requests: 2,
      owner_tokens: 10,
      guest_requests: 3,
      guest_tokens: 6,
    }, "Owner usage is budgeted and guest usage is recorded without an app cap");

    const persisted = JSON.parse(fs.readFileSync(storePath, "utf8"));
    const firstRecord = persisted.aiUsage.find((record: { prompt_version: string }) => record.prompt_version === "unit-prompt-v1");
    assert.equal(firstRecord.model, "gemini-test");
    assert.equal(firstRecord.prompt_version, "unit-prompt-v1");
    assert.equal(firstRecord.input_tokens, 2);
    assert.equal(firstRecord.output_tokens, 3);
    assert.equal(firstRecord.total_tokens, 5);
    assert.equal(typeof firstRecord.latency_ms, "number");
    assert.ok(!fs.readFileSync(storePath, "utf8").includes("first owner prompt"), "Request content must not be persisted");

    const restartedRepository = new FileJobRepository(storePath);
    assert.deepEqual(
      await restartedRepository.getAiUsageSummary(startsAt.toISOString()),
      summary,
      "Usage records and budget totals must survive a repository restart"
    );

    process.env.AI_OWNER_DAILY_REQUEST_BUDGET = "10";
    process.env.AI_OWNER_DAILY_TOKEN_BUDGET = "2";
    const tokenBudgetRepository = new FileJobRepository(path.join(temporaryDirectory, "token-budget.json"));
    await assert.rejects(
      runTrackedAiCall({
        role: "owner",
        provider: "gemini",
        model: "gemini-test",
        promptVersion: "large-input-v1",
        input: "input larger than token budget",
        repository: tokenBudgetRepository,
      }, async () => {
        throw new Error("An oversized estimated input must not reach the provider");
      }),
      (error: unknown) => error instanceof AiBudgetExceededError && error.dimension === "tokens"
    );
    assert.equal(
      (await tokenBudgetRepository.getAiUsageSummary(startsAt.toISOString())).owner_requests,
      0,
      "A rejected input estimate must not reserve a request"
    );

    process.env.AI_OWNER_DAILY_TOKEN_BUDGET = "100";
    const failureRepository = new FileJobRepository(path.join(temporaryDirectory, "failed-call.json"));
    await assert.rejects(
      runTrackedAiCall({
        role: "owner",
        provider: "gemini",
        model: "gemini-test",
        promptVersion: "failure-v1",
        input: "provider failure",
        repository: failureRepository,
      }, async () => {
        throw new Error("synthetic provider failure");
      }),
      /synthetic provider failure/
    );
    const failedRecord = JSON.parse(fs.readFileSync(path.join(temporaryDirectory, "failed-call.json"), "utf8"))
      .aiUsage[0];
    assert.equal(failedRecord.status, "failed");
    assert.equal(failedRecord.error_code, "Error");
    assert.ok(failedRecord.latency_ms >= 0);

    process.env.AI_OWNER_DAILY_REQUEST_BUDGET = "1";
    process.env.AI_OWNER_DAILY_TOKEN_BUDGET = "100";
    const concurrentRepository = new FileJobRepository(path.join(temporaryDirectory, "concurrent.json"));
    let providerCalls = 0;
    const concurrentResults = await Promise.allSettled(
      [0, 1].map(() => runTrackedAiCall({
        role: "owner",
        provider: "gemini",
        model: "gemini-test",
        promptVersion: "concurrent-v1",
        input: "concurrent request",
        repository: concurrentRepository,
      }, async () => {
        providerCalls++;
        return {};
      }))
    );
    assert.equal(providerCalls, 1, "Concurrent calls must reserve the owner request budget before calling the provider");
    assert.equal(concurrentResults.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(
      concurrentResults.filter((result) => result.status === "rejected" && result.reason instanceof AiBudgetExceededError).length,
      1
    );

    const agentRepository = new FileJobRepository(path.join(temporaryDirectory, "agent-budget.json"));
    let agentProviderCalls = 0;
    const agent = new GeminiAgent({
      apiKey: "test-key",
      tools: [],
      clientFactory: () => ({
        interactions: {
          create: async () => {
            agentProviderCalls++;
            return {
              output_text: "Tracked agent response",
              usageMetadata: { promptTokenCount: 2, candidatesTokenCount: 2, totalTokenCount: 4 },
            };
          },
        },
      } as unknown as Pick<GoogleGenAI, "interactions">),
    });
    const agentProfile = loadSearchProfile();
    await agent.run("first owner turn", new Conversation(), {
      repository: agentRepository,
      profile: agentProfile,
    });
    await assert.rejects(
      agent.run("second owner turn", new Conversation(), {
        repository: agentRepository,
        profile: agentProfile,
      }),
      AiBudgetExceededError
    );
    assert.equal(agentProviderCalls, 1, "GeminiAgent must enforce reservations at its provider boundary");

    process.env.AI_OUTBOUND_ENABLED = "false";
    const disabledRepository = new FileJobRepository(path.join(temporaryDirectory, "disabled.json"));
    let disabledProviderCalls = 0;
    await assert.rejects(
      runTrackedAiCall({
        role: "owner",
        provider: "gemini",
        model: "gemini-test",
        promptVersion: "disabled-v1",
        input: "must remain local",
        repository: disabledRepository,
      }, async () => {
        disabledProviderCalls++;
        return {};
      }),
      AiOutboundDisabledError
    );
    assert.equal(disabledProviderCalls, 0, "The kill switch must block the provider callback");
    assert.equal(
      (await disabledRepository.getAiUsageSummary(startsAt.toISOString())).owner_requests,
      0,
      "A blocked outbound call must not consume budget"
    );
  } finally {
    for (const name of envNames) {
      const value = originalEnvironment.get(name);
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }

  console.log("AI usage accounting tests passed: estimated-input owner budgets, guest isolation, persistence, token metadata, concurrency, and outbound kill switch.");
}

runTests().catch((error: unknown) => {
  console.error("AI usage accounting tests failed:", error);
  process.exitCode = 1;
});
