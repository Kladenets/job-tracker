import readline from "readline";
import dotenv from "dotenv";
import { GeminiAgent, DEFAULT_GEMINI_MODEL } from "../ai/agent/gemini-agent";
import { Conversation } from "../ai/agent/conversation";
import { createDefaultTools } from "../ai/agent/tools";
import { getRepository } from "../db";

dotenv.config();

/**
 * Interactive CLI Chat Session for Tier 2 AI Agent
 *
 * Run: npm run agent:chat
 *      npm run agent:chat -- --job=<job_uuid>
 *      npm run agent:chat -- --conversation=<conv_id>
 */
async function main() {
  const args = process.argv.slice(2);
  const jobArg = args.find((a) => a.startsWith("--job="))?.split("=")[1];
  const convArg = args.find((a) => a.startsWith("--conversation="))?.split("=")[1];

  const { repository, engine } = getRepository();
  const tools = createDefaultTools();
  const agent = new GeminiAgent({
    model: process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL,
    tools,
  });

  let conversation: Conversation;

  if (convArg) {
    const existing = await repository.getConversation(convArg);
    if (existing) {
      conversation = existing;
      console.log(`Resumed conversation "${conversation.title}" (${conversation.id})`);
    } else {
      conversation = new Conversation({ id: convArg });
      console.log(`Created new conversation with ID: ${convArg}`);
    }
  } else {
    conversation = new Conversation();
  }

  if (jobArg) {
    conversation.tagJobId(jobArg);
    console.log(`Pre-tagged conversation with Job ID: ${jobArg}`);
  }

  console.log("==========================================================");
  console.log("         Job Tracker AI Conversational Agent (Tier 2)     ");
  console.log("==========================================================");
  console.log(`Model:       ${process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL}`);
  console.log(`Persistence: ${engine}`);
  console.log(`Tools:       ${tools.map((t) => t.name).join(", ")}`);
  console.log("Commands:    /history, /jobs, /tools, /save, /exit");
  console.log("----------------------------------------------------------\n");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const promptUser = () => {
    rl.question("you> ", async (input) => {
      const line = input.trim();

      if (line.length === 0) {
        promptUser();
        return;
      }

      if (line === "/exit" || line === "exit" || line === "quit") {
        await repository.saveConversation(conversation);
        console.log(`Saved conversation "${conversation.id}". Goodbye!`);
        rl.close();
        process.exit(0);
      }

      if (line === "/history") {
        const msgs = conversation.getMessages();
        console.log("\n--- Conversation History ---");
        if (msgs.length === 0) {
          console.log("(empty)\n");
        } else {
          for (const m of msgs) {
            console.log(`[${m.role.toUpperCase()}] ${m.content}`);
            if (m.tool_calls && m.tool_calls.length > 0) {
              for (const tc of m.tool_calls) {
                console.log(`   └─ [Tool Call: ${tc.name}] args: ${JSON.stringify(tc.arguments)}`);
              }
            }
          }
          console.log("-----------------------------\n");
        }
        promptUser();
        return;
      }

      if (line === "/jobs") {
        console.log(`\nTagged Job IDs in this conversation (${conversation.job_ids.length}):`);
        if (conversation.job_ids.length === 0) {
          console.log("  (None yet - tools will tag jobs automatically as you discuss them)");
        } else {
          for (const jid of conversation.job_ids) {
            const j = await repository.getById(jid);
            console.log(`  • ${jid} ${j ? `[${j.title} at ${j.company}]` : ""}`);
          }
        }
        console.log("");
        promptUser();
        return;
      }

      if (line === "/tools") {
        console.log("\nRegistered Tools:");
        for (const t of tools) {
          console.log(`  • ${t.name}: ${t.description}`);
        }
        console.log("");
        promptUser();
        return;
      }

      if (line === "/save") {
        await repository.saveConversation(conversation);
        console.log(`\nSaved conversation ${conversation.id} to storage.\n`);
        promptUser();
        return;
      }

      try {
        process.stdout.write("\nagent is thinking...");
        const result = await agent.run(line, conversation);
        readline.clearLine(process.stdout, 0);
        readline.cursorTo(process.stdout, 0);

        if (result.toolCalls.length > 0) {
          console.log("\n[Tools Executed]");
          for (const tc of result.toolCalls) {
            console.log(`  ⚙ ${tc.name} ${tc.is_error ? "❌ (Error)" : "✓"}`);
          }
        }

        console.log(`\ngemini> ${result.text.trim()}\n`);

        // Automatically persist after each turn
        await repository.saveConversation(conversation);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`\nerror> ${msg}\n`);
      }

      promptUser();
    });
  };

  promptUser();
}

if (require.main === module) {
  main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
