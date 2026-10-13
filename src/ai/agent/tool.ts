import { JobPostingRepository } from "../../db/repository-interface.js";
import { SearchProfile } from "../../config/search-profile.js";
import { Conversation } from "./conversation.js";

/**
 * Execution context provided to all tools during agent turns.
 */
export interface ToolContext {
  repository: JobPostingRepository;
  profile: SearchProfile;
  conversation: Conversation;
  role: "owner" | "guest";
  model_id: string;
  prompt_version: string;
  execution_mode: "model" | "offline";
}

/**
 * Provider-agnostic tool definition that accepts plain JSON Schema parameters.
 * Directly compatible with Gemini Interactions API function declarations.
 */
export interface Tool {
  readonly name: string;
  readonly description: string;
  readonly parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };

  execute(params: unknown, context: ToolContext): Promise<string>;
}
