import { GoogleGenAI } from "@google/genai";
import { Conversation, ToolCallExecution } from "./conversation";
import { Tool, ToolContext } from "./tool";
import { createDefaultTools } from "./tools";
import { getRepository } from "../../db";
import { getSearchProfile } from "../../config/search-profile";
import { resolveGeminiApiKey, triggerProFailover, isFailoverActive } from "../key-resolver";

export const DEFAULT_GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";

const MAX_TOOL_TURNS = 5;

type ToolCallStep = {
  id: string;
  type: "function_call";
  name: string;
  arguments: unknown;
};

function isFunctionCall(step: { type: string }): step is ToolCallStep {
  return step.type === "function_call";
}

export interface AgentConfig {
  readonly model?: string;
  readonly tools?: Tool[];
  readonly apiKey?: string;
  readonly role?: "owner" | "guest";
  readonly preferProBackup?: boolean;
}

export interface AgentTurnResult {
  text: string;
  toolCalls: ToolCallExecution[];
}

export class GeminiAgent {
  readonly #client: GoogleGenAI | null = null;
  readonly #model: string;
  readonly #tools: readonly Tool[];
  readonly activeTier: string;

  constructor(config?: AgentConfig) {
    let resolvedKey = config?.apiKey;
    let tier = "custom";

    if (!resolvedKey) {
      const res = resolveGeminiApiKey({
        role: config?.role,
        preferProBackup: config?.preferProBackup,
      });
      resolvedKey = res.apiKey;
      tier = res.tier;
    }

    this.activeTier = tier;

    if (resolvedKey && resolvedKey.trim().length > 0) {
      this.#client = new GoogleGenAI({
        apiKey: resolvedKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });
    }

    this.#model = config?.model || DEFAULT_GEMINI_MODEL;
    this.#tools = config?.tools ?? createDefaultTools();
  }

  /**
   * Executes a complete conversation turn:
   * 1. Records user message
   * 2. Runs tool-calling loop (capped at MAX_TOOL_TURNS)
   * 3. Collects structured tool call traces
   * 4. Records assistant reply and returns structured result
   */
  async run(
    prompt: string,
    conversation: Conversation,
    contextOverrides?: Partial<ToolContext>
  ): Promise<AgentTurnResult> {
    conversation.addMessage("user", prompt);
    // Periodically compact older turns if conversation history grows large
    conversation.compactHistory(14, 6);

    const repository = contextOverrides?.repository || getRepository().repository;
    const profile = contextOverrides?.profile || await getSearchProfile(repository);
    const context: ToolContext = {
      repository,
      profile,
      conversation,
    };

    if (!this.#client) {
      return this.#runFallbackSimulation(prompt, conversation, context);
    }

    try {
      const toolCallsExecuted: ToolCallExecution[] = [];
      const text =
        this.#tools.length === 0
          ? await this.#generatePlain(conversation)
          : await this.#generateWithTools(conversation, context, toolCallsExecuted);

      conversation.addMessage("assistant", text, toolCallsExecuted);

      return {
        text,
        toolCalls: toolCallsExecuted,
      };
    } catch (err: unknown) {
      const errAny = err as any;
      const msg = err instanceof Error ? err.message : String(err);
      const isRateLimit =
        errAny?.status === 429 ||
        errAny?.error?.code === 429 ||
        msg.includes("429") ||
        msg.includes("RESOURCE_EXHAUSTED") ||
        msg.includes("quota");

      if (isRateLimit && !isFailoverActive()) {
        console.warn("[GeminiAgent] HTTP 429 / Quota exhaustion detected on primary tier. Triggering failover to PROD_GEMINI_API_KEY_PRO.");
        triggerProFailover();
      }

      console.warn(
        `[GeminiAgent] Generation error:`,
        msg,
        errAny?.status,
        JSON.stringify(errAny?.error || errAny?.errorDetails || errAny?.response || {})
      );
      return this.#runFallbackSimulation(prompt, conversation, context, msg);
    }
  }

  /**
   * Plain text generation when no tools are configured.
   */
  async #generatePlain(conversation: Conversation): Promise<string> {
    if (!this.#client) throw new Error("No GoogleGenAI client initialized");

    const interaction: any = await this.#client.interactions.create({
      model: this.#model,
      input: conversation.toString(),
    });

    return interaction.output_text || interaction.text || "No response generated.";
  }

  /**
   * Multi-turn tool calling loop using Google Gemini Interactions API.
   */
  async #generateWithTools(
    conversation: Conversation,
    context: ToolContext,
    executedTraces: ToolCallExecution[]
  ): Promise<string> {
    if (!this.#client) throw new Error("No GoogleGenAI client initialized");

    const tools = this.#toolDeclarations();

    let interaction: any = await this.#client.interactions.create({
      model: this.#model,
      input: conversation.toString(),
      tools,
    });

    for (let turn = 0; turn < MAX_TOOL_TURNS; turn += 1) {
      const steps = interaction.steps || [];
      const calls = steps.filter(isFunctionCall);
      if (calls.length === 0) {
        break;
      }

      const results = await Promise.all(
        calls.map(async (call: ToolCallStep) => {
          const outcome = await this.#executeToolCall(call, context);
          executedTraces.push({
            call_id: outcome.call_id,
            name: outcome.name,
            arguments: call.arguments,
            result: outcome.result,
            is_error: outcome.is_error,
          });
          return outcome;
        })
      );

      interaction = await this.#client.interactions.create({
        model: this.#model,
        previous_interaction_id: interaction.id,
        input: results,
        tools,
      });
    }

    return interaction.output_text || interaction.text || "I have completed the requested task.";
  }

  #toolDeclarations(): Array<{
    type: "function";
    name: string;
    description: string;
    parameters: Tool["parameters"];
  }> {
    return this.#tools.map((tool) => ({
      type: "function",
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    }));
  }

  async #executeToolCall(
    call: ToolCallStep,
    context: ToolContext
  ): Promise<{
    type: "function_result";
    name: string;
    call_id: string;
    result: string;
    is_error: boolean;
  }> {
    const tool = this.#tools.find((t) => t.name === call.name);

    if (!tool) {
      return {
        type: "function_result",
        name: call.name,
        call_id: call.id,
        result: `No tool named "${call.name}" is registered.`,
        is_error: true,
      };
    }

    try {
      const resultStr = await tool.execute(call.arguments, context);
      return {
        type: "function_result",
        name: call.name,
        call_id: call.id,
        result: resultStr,
        is_error: false,
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        type: "function_result",
        name: call.name,
        call_id: call.id,
        result: `Tool execution failed: ${msg}`,
        is_error: true,
      };
    }
  }

  /**
   * Resilient local fallback when GEMINI_API_KEY is not configured or in offline mode.
   * Directly executes relevant tools deterministically based on keyword intent,
   * tags the conversation, and provides a clear response.
   */
  async #runFallbackSimulation(
    prompt: string,
    conversation: Conversation,
    context: ToolContext,
    errorMessage?: string
  ): Promise<AgentTurnResult> {
    const lower = prompt.toLowerCase();
    const executedTraces: ToolCallExecution[] = [];
    let replyText = "";

    // Autonomous naming check: If conversation title is default or empty, name it dynamically
    if (conversation.title === "New Conversation" || conversation.title.trim().length === 0) {
      const nameTool = this.#tools.find((t) => t.name === "name_conversation");
      if (nameTool) {
        let proposedTitle = "General Career Inquiry";
        if (conversation.job_ids.length > 0) {
          const firstJob = await context.repository.getById(conversation.job_ids[0]);
          if (firstJob) {
            proposedTitle = `${firstJob.company}: ${firstJob.title.slice(0, 24)}...`;
          }
        } else if (lower.includes("cover letter")) {
          proposedTitle = "Cover Letter Drafting";
        } else if (lower.includes("interview") || lower.includes("prep")) {
          proposedTitle = "Interview Preparation";
        } else if (lower.includes("search") || lower.includes("find")) {
          proposedTitle = "Job Search Discovery";
        } else {
          // Extract first 4-5 words of the prompt
          const words = prompt.trim().split(/\s+/).slice(0, 5).join(" ");
          proposedTitle = words.length > 3 ? `${words}...` : "Career Consultation";
        }

        const rawNameRes = await nameTool.execute({ title: proposedTitle }, context);
        try {
          const parsedName = JSON.parse(rawNameRes);
          executedTraces.push({
            call_id: `call-name-${Date.now()}`,
            name: "name_conversation",
            arguments: { title: proposedTitle },
            result: parsedName,
            is_error: false,
          });
        } catch {
          // ignore naming json parse error
        }
      }
    }

    // If asking about a job or search
    if (lower.includes("search") || lower.includes("find")) {
      const searchTool = this.#tools.find((t) => t.name === "search_saved_jobs");
      if (searchTool) {
        const rawRes = await searchTool.execute({ limit: 5 }, context);
        const parsed = JSON.parse(rawRes);
        executedTraces.push({
          call_id: `call-${Date.now()}`,
          name: "search_saved_jobs",
          arguments: { limit: 5 },
          result: parsed,
          is_error: false,
        });
        replyText = `Found ${parsed.totalMatches} stored jobs in the database. Top matches:\n` +
          parsed.jobs.map((j: any) => `• ${j.title} at ${j.company} (${j.workplace_type}, ${j.compensation})`).join("\n");
      }
    } else if (lower.includes("cover letter")) {
      const letterTool = this.#tools.find((t) => t.name === "draft_cover_letter");
      if (letterTool) {
        const rawRes = await letterTool.execute({}, context);
        const parsed = JSON.parse(rawRes);
        executedTraces.push({
          call_id: `call-${Date.now()}`,
          name: "draft_cover_letter",
          arguments: {},
          result: parsed,
          is_error: false,
        });
        replyText = parsed.error || `Subject: ${parsed.suggestedSubjectLine}\n\n${parsed.coverLetterText}`;
      }
    } else if (lower.includes("interview") || lower.includes("prep")) {
      const prepTool = this.#tools.find((t) => t.name === "generate_interview_prep");
      if (prepTool) {
        const rawRes = await prepTool.execute({}, context);
        const parsed = JSON.parse(rawRes);
        executedTraces.push({
          call_id: `call-${Date.now()}`,
          name: "generate_interview_prep",
          arguments: {},
          result: parsed,
          is_error: false,
        });
        replyText = parsed.error || `Interview preparation for ${parsed.company}:\n` +
          `Key Technical Questions:\n` +
          (parsed.questions?.technical || []).map((q: string) => `• ${q}`).join("\n");
      }
    } else {
      replyText = errorMessage
        ? `[Agent Notice] Gemini request encountered: ${errorMessage}. The system is running in offline resilience mode.`
        : `[Agent Notice] No GEMINI_API_KEY detected. You can ask me to "search jobs", "analyze fit", "draft cover letter", or "prep interview".`;
    }

    conversation.addMessage("assistant", replyText, executedTraces);

    return {
      text: replyText,
      toolCalls: executedTraces,
    };
  }

  /**
   * Async generator for streaming text events directly.
   */
  async *stream(prompt: string, conversation: Conversation): AsyncGenerator<string> {
    conversation.addMessage("user", prompt);

    if (!this.#client) {
      const reply = `[Offline Mode] Received: "${prompt}". Configure GEMINI_API_KEY for live streaming.`;
      conversation.addMessage("assistant", reply);
      yield reply;
      return;
    }

    const events: any = await this.#client.interactions.create({
      model: this.#model,
      input: conversation.toString(),
      stream: true,
    });

    let fullReply = "";
    for await (const event of events) {
      if (event.event_type === "step.delta" && event.delta?.type === "text") {
        const chunk = event.delta.text;
        fullReply += chunk;
        yield chunk;
      }
    }

    conversation.addMessage("assistant", fullReply);
  }
}

export const defaultAgent = new GeminiAgent();
