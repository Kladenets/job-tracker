import { Tool, ToolContext } from "../tool";

export class NameConversationTool implements Tool {
  readonly name = "name_conversation";
  readonly description =
    "Assigns a concise, high-signal, descriptive title (3 to 6 words) to the current conversation based on the user's intent and any referenced job posting or company.";

  readonly parameters = {
    type: "object" as const,
    properties: {
      title: {
        type: "string",
        description: "A concise 3-6 word descriptive title for this conversation (e.g., 'Stripe Distributed Systems Analysis', 'Cover Letter Draft', 'Salary Negotiation Prep').",
      },
    },
    required: ["title"],
  };

  async execute(params: unknown, context: ToolContext): Promise<string> {
    const { repository, conversation } = context;
    const args = (typeof params === "object" && params !== null ? params : {}) as {
      title?: string;
    };

    if (!args.title || typeof args.title !== "string" || args.title.trim().length === 0) {
      return JSON.stringify({
        success: false,
        error: "Missing required 'title' string argument.",
      });
    }

    const cleanTitle = args.title.trim().slice(0, 60);
    conversation.title = cleanTitle;
    await repository.saveConversation(conversation);

    return JSON.stringify({
      success: true,
      updatedTitle: cleanTitle,
      conversationId: conversation.id,
    });
  }
}
