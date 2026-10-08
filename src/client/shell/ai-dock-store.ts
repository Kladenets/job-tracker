import { create } from "zustand";
import { useShellStore } from "./shell-store";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  isStreaming?: boolean;
  jobContextId?: string;
  toolCalls?: Array<{
    name: string;
    args?: Record<string, unknown>;
  }>;
}

export interface JobContextSummary {
  id: string;
  title: string;
  company: string;
  location?: string | null;
  salary?: string | null;
}

export interface ConversationSummary {
  id: string;
  title: string;
  job_ids: string[];
  created_at: string;
  updated_at: string;
  lastMessageSnippet?: string;
  referencedJobs?: Array<{
    id: string;
    title: string;
    company: string;
  }>;
}

interface AIDockState {
  isOpen: boolean;
  dockView: "list" | "chat";
  setIsOpen: (open: boolean) => void;
  setDockView: (view: "list" | "chat") => void;
  toggleOpen: () => void;

  // Conversations Management
  conversations: ConversationSummary[];
  activeConversationId: string | null;
  isLoadingConversations: boolean;
  conversationListError: string | null;
  resetGuestSession: () => void;
  fetchConversations: () => Promise<void>;
  selectConversation: (id: string) => Promise<void>;
  startNewConversation: (initialJob?: JobContextSummary, initialPrompt?: string) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;

  // Active Job Context
  activeJobContext: JobContextSummary | null;
  setActiveJobContext: (job: JobContextSummary | null) => void;
  clearActiveJobContext: () => void;

  // Conversation Thread State
  messages: ChatMessage[];
  isGenerating: boolean;
  error: string | null;

  // Actions
  addMessage: (message: Omit<ChatMessage, "id" | "timestamp">) => void;
  updateLastMessageContent: (chunk: string) => void;
  finishStreamingMessage: (toolCalls?: Array<{ name: string; args?: Record<string, unknown> }>) => void;
  sendMessage: (prompt: string) => Promise<void>;
  askAboutJob: (job: JobContextSummary, customPrompt?: string) => void;
}

const AI_DOCK_OPEN_KEY = "job_tracker_ai_dock_open";
const AI_DOCK_VIEW_KEY = "job_tracker_ai_dock_view";
const AI_DOCK_ACTIVE_CONV_KEY = "job_tracker_ai_dock_active_conv";

function getInitialOpenState(): boolean {
  if (typeof window === "undefined") return false;
  const saved = localStorage.getItem(AI_DOCK_OPEN_KEY);
  return saved === "true";
}

function getInitialViewState(): "list" | "chat" {
  if (typeof window === "undefined") return "list";
  const saved = localStorage.getItem(AI_DOCK_VIEW_KEY);
  if (saved === "chat" || saved === "list") return saved;
  return "list";
}

function getInitialActiveConvId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(AI_DOCK_ACTIVE_CONV_KEY);
}

export const useAIDockStore = create<AIDockState>((set, get) => ({
  isOpen: getInitialOpenState(),
  dockView: getInitialViewState(),
  setIsOpen: (open: boolean) => {
    if (typeof window !== "undefined") {
      localStorage.setItem(AI_DOCK_OPEN_KEY, String(open));
    }
    set({ isOpen: open });
  },
  setDockView: (view: "list" | "chat") => {
    if (typeof window !== "undefined") {
      localStorage.setItem(AI_DOCK_VIEW_KEY, view);
    }
    set({ dockView: view });
  },
  toggleOpen: () => {
    const next = !get().isOpen;
    get().setIsOpen(next);
  },

  conversations: [],
  activeConversationId: getInitialActiveConvId(),
  isLoadingConversations: false,
  conversationListError: null,

  resetGuestSession: () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem(AI_DOCK_ACTIVE_CONV_KEY);
      localStorage.setItem(AI_DOCK_VIEW_KEY, "list");
    }
    set({
      dockView: "list",
      conversations: [],
      activeConversationId: null,
      isLoadingConversations: false,
      activeJobContext: null,
      messages: [
        {
          id: "welcome-guest",
          role: "assistant",
          content: "Welcome to the public AI demo. Ask about a job posting or career preparation.",
          timestamp: new Date().toISOString(),
        },
      ],
      isGenerating: false,
      error: null,
    });
  },

  fetchConversations: async () => {
    if (useShellStore.getState().userRole === "guest") {
      set({ conversations: [], isLoadingConversations: false, conversationListError: null });
      return;
    }

    try {
      set({ isLoadingConversations: true, conversationListError: null });
      const res = await fetch("/api/agent/conversations");
      if (!res.ok) throw new Error("Failed to fetch conversations");
      const data = await res.json();
      const rawList = data.conversations || [];

      // Fetch brief metadata for referenced job_ids
      const enriched: ConversationSummary[] = await Promise.all(
        rawList.map(async (c: any) => {
          let lastMsg = "New conversation";
          if (c.messages && c.messages.length > 0) {
            const last = c.messages[c.messages.length - 1];
            lastMsg = last.content?.slice(0, 100) || "";
          }

          const referencedJobs: Array<{ id: string; title: string; company: string }> = [];
          if (Array.isArray(c.job_ids) && c.job_ids.length > 0) {
            for (const jid of c.job_ids.slice(0, 3)) {
              try {
                const jres = await fetch(`/api/jobs/${jid}`);
                if (jres.ok) {
                  const jdata = await jres.json();
                  if (jdata.job) {
                    referencedJobs.push({
                      id: jdata.job.id,
                      title: jdata.job.title,
                      company: jdata.job.company,
                    });
                  }
                }
              } catch {
                // Ignore single job fetch error
              }
            }
          }

          return {
            id: c.id,
            title: c.title || "Career Discussion",
            job_ids: c.job_ids || [],
            created_at: c.created_at,
            updated_at: c.updated_at,
            lastMessageSnippet: lastMsg,
            referencedJobs,
          };
        })
      );

      set({
        conversations: enriched,
        isLoadingConversations: false,
      });

      // If active conversation not loaded, and view is 'chat', load it
      const activeId = get().activeConversationId;
      if (activeId && get().messages.length <= 1) {
        get().selectConversation(activeId);
      }
    } catch (err: unknown) {
      set({
        isLoadingConversations: false,
        conversationListError: err instanceof Error ? err.message : "Failed to fetch conversations",
      });
    }
  },

  selectConversation: async (id: string) => {
    if (useShellStore.getState().userRole === "guest") return;
    if (get().isGenerating) {
      set({ error: "Wait for the current response to finish before switching conversations." });
      return;
    }

    try {
      set({
        activeConversationId: id,
        dockView: "chat",
        error: null,
      });
      if (typeof window !== "undefined") {
        localStorage.setItem(AI_DOCK_ACTIVE_CONV_KEY, id);
        localStorage.setItem(AI_DOCK_VIEW_KEY, "chat");
      }

      const res = await fetch(`/api/agent/conversations/${id}`);
      if (!res.ok) throw new Error("Failed to load conversation");
      const data = await res.json();
      const conv = data.conversation;

      const loadedMessages: ChatMessage[] = (conv.messages || []).map((m: any) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        timestamp: m.created_at,
        toolCalls: m.tool_calls,
      }));

      // Determine active job context from conversation
      let activeJob: JobContextSummary | null = null;
      if (conv.job_ids && conv.job_ids.length > 0) {
        try {
          const jres = await fetch(`/api/jobs/${conv.job_ids[conv.job_ids.length - 1]}`);
          if (jres.ok) {
            const jdata = await jres.json();
            if (jdata.job) {
              activeJob = {
                id: jdata.job.id,
                title: jdata.job.title,
                company: jdata.job.company,
                location: jdata.job.location,
                salary: jdata.job.salary,
              };
            }
          }
        } catch {
          // ignore
        }
      }

      set({
        messages:
          loadedMessages.length > 0
            ? loadedMessages
            : [
                {
                  id: "welcome-conv",
                  role: "assistant",
                  content: "Welcome! Ask me anything about your career search or this role.",
                  timestamp: new Date().toISOString(),
                },
              ],
        activeJobContext: activeJob,
      });
    } catch (err: unknown) {
      set({ error: "Failed to load conversation" });
    }
  },

  startNewConversation: async (initialJob?: JobContextSummary, initialPrompt?: string) => {
    if (get().isGenerating) {
      set({ error: "Wait for the current response to finish before starting a new conversation." });
      return;
    }

    if (useShellStore.getState().userRole === "guest") {
      const guestConversationId = `guest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      get().setIsOpen(true);
      get().setDockView("chat");
      set({
        activeConversationId: guestConversationId,
        activeJobContext: initialJob || null,
        isOpen: true,
        dockView: "chat",
        messages: [
          {
            id: "welcome-guest-chat",
            role: "assistant",
            content: initialJob
              ? `Ask me about ${initialJob.title} at ${initialJob.company}.`
              : "Hello! What would you like to know about job search or interview preparation?",
            timestamp: new Date().toISOString(),
          },
        ],
        error: null,
      });
      if (initialPrompt) void get().sendMessage(initialPrompt);
      return;
    }

    try {
      const title = initialJob
        ? `${initialJob.company}: ${initialJob.title.slice(0, 20)}...`
        : "New Conversation";

      const res = await fetch("/api/agent/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          jobId: initialJob?.id,
        }),
      });

      if (!res.ok) throw new Error("Failed to create conversation");
      const data = await res.json();
      const newConv = data.conversation;

      if (typeof window !== "undefined") {
        localStorage.setItem(AI_DOCK_ACTIVE_CONV_KEY, newConv.id);
        localStorage.setItem(AI_DOCK_VIEW_KEY, "chat");
        localStorage.setItem(AI_DOCK_OPEN_KEY, "true");
      }

      set({
        activeConversationId: newConv.id,
        activeJobContext: initialJob || null,
        isOpen: true,
        dockView: "chat",
        messages: [
          {
            id: "welcome-new",
            role: "assistant",
            content: initialJob
              ? `Ready to assist with ${initialJob.title} at ${initialJob.company}. I can analyze qualification fit, draft tailored outreach, or prepare interview questions.`
              : "Hello! I am your AI career agent. How can I help you today?",
            timestamp: new Date().toISOString(),
          },
        ],
        error: null,
      });

      get().fetchConversations();

      if (initialPrompt) {
        get().sendMessage(initialPrompt);
      }
    } catch (err: unknown) {
      set({ error: "Could not create new conversation" });
    }
  },

  deleteConversation: async (id: string) => {
    if (useShellStore.getState().userRole === "guest") return;
    if (get().isGenerating) {
      set({ conversationListError: "Wait for the current response to finish before deleting a conversation." });
      return;
    }

    try {
      const response = await fetch(`/api/agent/conversations/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error(`Failed to delete conversation (HTTP ${response.status}).`);
      set({ conversationListError: null });
      const currentActive = get().activeConversationId;
      if (currentActive === id) {
        set({
          activeConversationId: null,
          dockView: "list",
          messages: [],
        });
        if (typeof window !== "undefined") {
          localStorage.removeItem(AI_DOCK_ACTIVE_CONV_KEY);
          localStorage.setItem(AI_DOCK_VIEW_KEY, "list");
        }
      }
      get().fetchConversations();
    } catch (err: unknown) {
      set({
        conversationListError: err instanceof Error ? err.message : "Failed to delete conversation.",
      });
    }
  },

  activeJobContext: null,
  setActiveJobContext: (job: JobContextSummary | null) => set({ activeJobContext: job }),
  clearActiveJobContext: () => set({ activeJobContext: null }),

  messages: [
    {
      id: "welcome-system",
      role: "assistant",
      content:
        "Hello! I am your AI career agent. I can analyze job descriptions, identify qualification gaps, craft tailored cover letters, and prepare you for interviews.",
      timestamp: new Date().toISOString(),
    },
  ],
  isGenerating: false,
  error: null,

  addMessage: (msg) => {
    const newMsg: ChatMessage = {
      ...msg,
      id: "msg-" + Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toISOString(),
    };
    set((state) => ({
      messages: [...state.messages, newMsg],
      error: null,
    }));
  },

  updateLastMessageContent: (chunk: string) => {
    set((state) => {
      const msgs = [...state.messages];
      if (msgs.length === 0) return state;
      const last = msgs[msgs.length - 1];
      if (last.role === "assistant" && last.isStreaming) {
        msgs[msgs.length - 1] = {
          ...last,
          content: last.content + chunk,
        };
      }
      return { messages: msgs };
    });
  },

  finishStreamingMessage: (toolCalls) => {
    set((state) => {
      const msgs = [...state.messages];
      if (msgs.length === 0) return state;
      const last = msgs[msgs.length - 1];
      if (last.role === "assistant" && last.isStreaming) {
        msgs[msgs.length - 1] = {
          ...last,
          isStreaming: false,
          toolCalls: toolCalls || last.toolCalls,
        };
      }
      return { messages: msgs, isGenerating: false };
    });
  },

  sendMessage: async (prompt: string) => {
    const state = get();
    const isGuest = useShellStore.getState().userRole === "guest";
    if (!prompt.trim() || state.isGenerating) return;

    let convId = state.activeConversationId;
    if (!convId) {
      await get().startNewConversation(state.activeJobContext || undefined);
      convId = get().activeConversationId;
    }

    if (!convId) return;

    // 1. Append user turn
    const userMsg: ChatMessage = {
      id: "msg-user-" + Date.now(),
      role: "user",
      content: prompt.trim(),
      timestamp: new Date().toISOString(),
      jobContextId: state.activeJobContext?.id,
    };

    // 2. Prepare streaming assistant placeholder
    const assistantMsg: ChatMessage = {
      id: "msg-ast-" + (Date.now() + 1),
      role: "assistant",
      content: "",
      timestamp: new Date().toISOString(),
      isStreaming: true,
      jobContextId: state.activeJobContext?.id,
    };

    set({
      messages: [...get().messages, userMsg, assistantMsg],
      isGenerating: true,
      error: null,
    });

    try {
      let messagePayload = prompt.trim();
      if (state.activeJobContext) {
        messagePayload = `[Context: Job ID ${state.activeJobContext.id} - ${state.activeJobContext.title} at ${state.activeJobContext.company}]\n\n${messagePayload}`;
      }

      const guestHistory = state.messages
        .filter((message) =>
          (message.role === "user" || message.role === "assistant") &&
          !message.id.startsWith("welcome") &&
          !message.isStreaming
        )
        .slice(-12)
        .map(({ role, content }) => ({ role, content }));
      const endpoint = isGuest
        ? "/api/agent/guest-chat"
        : `/api/agent/conversations/${convId}/messages`;
      const body = isGuest
        ? {
            message: prompt.trim(),
            jobId: state.activeJobContext?.id,
            history: guestHistory,
          }
        : { message: messagePayload };

      const msgRes = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!msgRes.ok) {
        const errData = await msgRes.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${msgRes.status}: Failed to generate reply`);
      }

      const msgData = await msgRes.json();
      const fullReply = msgData.text || "I have analyzed the request.";

      // Stream tokens into UI
      let index = 0;
      const chunkSize = Math.max(8, Math.floor(fullReply.length / 25));
      const interval = setInterval(() => {
        if (index < fullReply.length) {
          const nextSlice = fullReply.slice(index, index + chunkSize);
          get().updateLastMessageContent(nextSlice);
          index += chunkSize;
        } else {
          clearInterval(interval);
          get().finishStreamingMessage(msgData.toolCalls);
          // Refresh conversations to get updated title & snippet
          if (!isGuest) get().fetchConversations();
        }
      }, 20);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "Error contacting AI assistant";
      set({
        error: errMsg,
        isGenerating: false,
      });
      get().updateLastMessageContent(`\n\n*(Error: ${errMsg})*`);
      get().finishStreamingMessage();
    }
  },

  askAboutJob: (job: JobContextSummary, customPrompt?: string) => {
    // Contract: Always spawns a new conversation
    const prompt =
      customPrompt ||
      `Please provide a breakdown of how well my candidate profile matches ${job.title} at ${job.company}, highlighting key strengths and any qualification gaps.`;

    get().startNewConversation(job, prompt);
  },
}));
