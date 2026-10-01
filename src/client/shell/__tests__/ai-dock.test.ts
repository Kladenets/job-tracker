import assert from "node:assert/strict";
import { useAIDockStore } from "../ai-dock-store";
import { getAIStatusDescriptor } from "../ai-status-helper";

console.log("Running AI Assistant Dock Unit Tests...");

// ====================================================================
// Test 1: AI Dock Open/Collapse State
// ====================================================================
const dock = useAIDockStore.getState();

const initialOpen = dock.isOpen;
dock.toggleOpen();
assert.strictEqual(
  useAIDockStore.getState().isOpen,
  !initialOpen,
  "toggleOpen must invert the open state of the dock"
);

dock.setIsOpen(false);
assert.strictEqual(
  useAIDockStore.getState().isOpen,
  false,
  "setIsOpen(false) must close the dock"
);

dock.setIsOpen(true);
assert.strictEqual(
  useAIDockStore.getState().isOpen,
  true,
  "setIsOpen(true) must open the dock"
);

console.log("  ✔ AI Dock open/close toggles verified");

// ====================================================================
// Test 2: Viewport State & Memory (Directory vs Chat View)
// ====================================================================
dock.setDockView("list");
assert.strictEqual(
  useAIDockStore.getState().dockView,
  "list",
  "setDockView('list') must set dockView to 'list'"
);

dock.setDockView("chat");
assert.strictEqual(
  useAIDockStore.getState().dockView,
  "chat",
  "setDockView('chat') must set dockView to 'chat'"
);

console.log("  ✔ Viewport state switching (Directory <-> Chat) verified");

// ====================================================================
// Test 3: Status Badge in Both Collapsed and Uncollapsed (Expanded) States
// ====================================================================
// 3a. When Collapsed & Ready (isGenerating = false)
dock.setIsOpen(false);
assert.strictEqual(useAIDockStore.getState().isOpen, false, "Dock must be collapsed");

const readyStatus = getAIStatusDescriptor(false);
assert.strictEqual(readyStatus.status, "ready", "Status descriptor must be 'ready' when not generating");
assert.strictEqual(readyStatus.label, "Ready", "Label must be 'Ready'");
assert.strictEqual(readyStatus.dotColorClass, "bg-emerald-500", "Must display emerald dot when ready");
assert.strictEqual(readyStatus.isPulsing, false, "Must not pulse when idle and ready");

// 3b. When Collapsed & Thinking (isGenerating = true)
const generatingStatus = getAIStatusDescriptor(true);
assert.strictEqual(generatingStatus.status, "generating", "Status descriptor must be 'generating' when active");
assert.strictEqual(generatingStatus.label, "Thinking", "Label must be 'Thinking'");
assert.strictEqual(generatingStatus.dotColorClass, "bg-amber-500", "Must display amber dot when generating");
assert.strictEqual(generatingStatus.isPulsing, true, "Must pulse (animate-ping) when generating");

// 3c. When Uncollapsed / Expanded & Ready
dock.setIsOpen(true);
assert.strictEqual(useAIDockStore.getState().isOpen, true, "Dock must be uncollapsed/expanded");
const expandedReadyStatus = getAIStatusDescriptor(useAIDockStore.getState().isGenerating);
assert.strictEqual(expandedReadyStatus.status, "ready", "Expanded status must reflect idle ready state");
assert.strictEqual(expandedReadyStatus.label, "Ready", "Expanded status label must be 'Ready'");
assert.strictEqual(expandedReadyStatus.badgeClass.includes("emerald"), true, "Expanded badge must contain emerald style");

// 3d. When Uncollapsed / Expanded & Thinking/Generating
const expandedGenStatus = getAIStatusDescriptor(true);
assert.strictEqual(expandedGenStatus.status, "generating", "Expanded status must reflect generating state");
assert.strictEqual(expandedGenStatus.label, "Thinking", "Expanded status label must be 'Thinking'");
assert.strictEqual(expandedGenStatus.badgeClass.includes("amber"), true, "Expanded badge must contain amber style");

console.log("  ✔ AI status badge in collapsed and uncollapsed/expanded states verified");

// ====================================================================
// Test 4: Context Synchronization & Prompt Seeding
// ====================================================================
const mockJob = {
  id: "job-test-123",
  title: "Principal Infrastructure Architect",
  company: "Cloudflare",
  location: "Austin, TX",
  salary: "$210k - $250k",
};

dock.setActiveJobContext(mockJob);
assert.deepStrictEqual(
  useAIDockStore.getState().activeJobContext,
  mockJob,
  "setActiveJobContext must store active job context"
);

dock.clearActiveJobContext();
assert.strictEqual(
  useAIDockStore.getState().activeJobContext,
  null,
  "clearActiveJobContext must clear active job context"
);

console.log("  ✔ Active Job Context synchronization verified");

// ====================================================================
// Test 5: Streaming Continuity State Machine
// ====================================================================
dock.addMessage({
  role: "user",
  content: "Analyze this role",
});

dock.addMessage({
  role: "assistant",
  content: "Initial analysis: ",
  isStreaming: true,
});

dock.updateLastMessageContent("Candidate possesses required distributed systems background.");

const msgs = useAIDockStore.getState().messages;
const lastMsg = msgs[msgs.length - 1];

assert.strictEqual(
  lastMsg.content,
  "Initial analysis: Candidate possesses required distributed systems background.",
  "updateLastMessageContent must append chunks to the streaming assistant message"
);

dock.finishStreamingMessage([{ name: "query_job_requirements", args: { jobId: "job-test-123" } }]);

const finishedMsg = useAIDockStore.getState().messages[msgs.length - 1];
assert.strictEqual(finishedMsg.isStreaming, false, "finishStreamingMessage must mark isStreaming as false");
assert.strictEqual(finishedMsg.toolCalls?.length, 1, "finishStreamingMessage must record executed tool calls");

console.log("  ✔ Streaming message state transitions verified");
console.log("All Chunk 3 AI Assistant Dock tests passed successfully!\n");
