export type MessageRole = "system" | "user" | "assistant";

export interface ToolCallExecution {
  call_id: string;
  name: string;
  arguments: unknown;
  result: unknown;
  is_error?: boolean;
}

export interface Message {
  readonly id: string;
  readonly role: MessageRole;
  readonly content: string;
  readonly tool_calls?: ToolCallExecution[];
  readonly created_at: string;
}

export interface StoredConversation {
  id: string;
  title: string;
  job_ids: string[];
  created_at: string;
  updated_at: string;
  messages: Message[];
}

/**
 * Manages an ordered history of messages, metadata, and dynamic job tagging
 * for multi-turn AI interactions.
 */
export class Conversation {
  readonly id: string;
  title: string;
  job_ids: string[];
  readonly created_at: string;
  updated_at: string;
  private messages: Message[] = [];

  constructor(data?: Partial<StoredConversation>) {
    this.id = data?.id || `conv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.title = data?.title || "New Conversation";
    this.job_ids = data?.job_ids ? [...data.job_ids] : [];
    this.created_at = data?.created_at || new Date().toISOString();
    this.updated_at = data?.updated_at || new Date().toISOString();
    if (data?.messages) {
      this.messages = [...data.messages];
    }
  }

  /**
   * Append a message turn to the history.
   */
  addMessage(role: MessageRole, content: string, toolCalls?: ToolCallExecution[]): Message {
    const msg: Message = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      role,
      content,
      tool_calls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
      created_at: new Date().toISOString(),
    };

    this.messages.push(msg);
    this.updated_at = new Date().toISOString();

    // Auto-update default title on first user turn if still generic
    if (this.title === "New Conversation" && role === "user") {
      const trimmed = content.trim().replace(/\n+/g, " ");
      this.title = trimmed.length > 50 ? `${trimmed.slice(0, 47)}...` : trimmed;
    }

    return msg;
  }

  /**
   * Tags a job ID to this conversation if not already present.
   */
  tagJobId(jobId: string): void {
    if (jobId && !this.job_ids.includes(jobId)) {
      this.job_ids.push(jobId);
      this.updated_at = new Date().toISOString();
    }
  }

  getMessages(): Message[] {
    return [...this.messages];
  }

  /**
   * Compacts older conversation turns into a summarized context block if message count
   * exceeds maxTurnsBeforeCompaction, preserving user intent, active job_ids, and decisions.
   */
  compactHistory(maxTurnsBeforeCompaction = 12, retainRecentCount = 6): boolean {
    if (this.messages.length <= maxTurnsBeforeCompaction) {
      return false;
    }

    const turnsToSummarize = this.messages.slice(0, this.messages.length - retainRecentCount);
    const recentTurns = this.messages.slice(this.messages.length - retainRecentCount);

    const summaryParts: string[] = [];
    for (const msg of turnsToSummarize) {
      if (msg.role === "user") {
        summaryParts.push(`User requested: "${msg.content.slice(0, 120)}"`);
      } else if (msg.role === "assistant") {
        const toolNames = msg.tool_calls?.map((tc) => tc.name).join(", ");
        if (toolNames) {
          summaryParts.push(`Assistant executed tools [${toolNames}].`);
        }
      }
    }

    const compactedContent = `[Compacted Conversation History: ${turnsToSummarize.length} prior turns summarized]\n- Prior interactions: ${summaryParts.join(" | ")}\n- Referenced job IDs preserved: ${this.job_ids.join(", ") || "None"}`;

    const compactionMessage: Message = {
      id: `msg-${Date.now()}-compaction`,
      role: "system",
      content: compactedContent,
      created_at: new Date().toISOString(),
    };

    this.messages = [compactionMessage, ...recentTurns];
    this.updated_at = new Date().toISOString();
    return true;
  }

  /**
   * Formats the conversation history into clean "role: content" text for the model prompt.
   */
  toString(): string {
    return this.messages.map((m) => `${m.role}: ${m.content}`).join("\n");
  }

  toJSON(): StoredConversation {
    return {
      id: this.id,
      title: this.title,
      job_ids: [...this.job_ids],
      created_at: this.created_at,
      updated_at: this.updated_at,
      messages: [...this.messages],
    };
  }

  static fromJSON(data: StoredConversation): Conversation {
    return new Conversation(data);
  }
}
