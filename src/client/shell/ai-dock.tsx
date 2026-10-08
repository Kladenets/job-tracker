import React, { useState, useRef, useEffect } from "react";
import {
  Sparkles,
  X,
  Send,
  Trash2,
  Briefcase,
  AlertCircle,
  Plus,
  ArrowLeft,
  MessageSquare,
  Search,
  CheckCircle2,
  Calendar,
  Clock,
  PanelRightClose,
} from "lucide-react";
import { useAIDockStore, ConversationSummary } from "./ai-dock-store";
import { useShellStore } from "./shell-store";

export function AIDock() {
  const userRole = useShellStore((state) => state.userRole);
  const {
    isOpen,
    dockView,
    setIsOpen,
    setDockView,
    toggleOpen,
    conversations,
    activeConversationId,
    isLoadingConversations,
    conversationListError,
    fetchConversations,
    selectConversation,
    startNewConversation,
    deleteConversation,
    activeJobContext,
    clearActiveJobContext,
    messages,
    isGenerating,
    sendMessage,
    error,
  } = useAIDockStore();

  const [input, setInput] = useState("");
  const [listSearch, setListSearch] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Fetch conversations on initial mount and when opened
  useEffect(() => {
    if (isOpen) {
      fetchConversations();
    }
  }, [isOpen, userRole, fetchConversations]);

  // Auto-scroll to bottom of conversation in chat view
  useEffect(() => {
    if (dockView === "chat") {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isGenerating, dockView]);

  // Focus textarea when chat view is active
  useEffect(() => {
    if (isOpen && dockView === "chat") {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 150);
    }
  }, [isOpen, dockView]);

  // Hotkey handlers: 'Cmd+K' or 'c' to toggle, 'Esc' to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInput =
        activeEl?.tagName === "INPUT" ||
        activeEl?.tagName === "TEXTAREA" ||
        activeEl?.getAttribute("contenteditable") === "true";

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        toggleOpen();
        return;
      }

      if (isInput) {
        if (e.key === "Escape" && isOpen) {
          e.preventDefault();
          setIsOpen(false);
        }
        return;
      }

      if (e.key === "c" || e.key === "C") {
        e.preventDefault();
        toggleOpen();
      } else if (e.key === "Escape" && isOpen) {
        e.preventDefault();
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, toggleOpen, setIsOpen]);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || isGenerating) return;
    const text = input;
    setInput("");
    sendMessage(text);
  };

  const handleKeyDownInput = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Filter conversations
  const filteredConversations = conversations.filter((c) => {
    if (!listSearch.trim()) return true;
    const q = listSearch.toLowerCase();
    const titleMatch = c.title.toLowerCase().includes(q);
    const snippetMatch = c.lastMessageSnippet?.toLowerCase().includes(q);
    const jobMatch = c.referencedJobs?.some(
      (j) => j.title.toLowerCase().includes(q) || j.company.toLowerCase().includes(q)
    );
    return titleMatch || snippetMatch || jobMatch;
  });

  // Find active conversation title
  const activeConversation = conversations.find((c) => c.id === activeConversationId);

  return (
    <>
      {/* Mobile / Tablet Overlay Backdrop (< 1280px viewports) */}
      {isOpen && (
        <div
          onClick={() => setIsOpen(false)}
          className="xl:hidden fixed inset-0 bg-black/40 backdrop-blur-xs z-30 transition-opacity duration-300"
          aria-hidden="true"
        />
      )}

      {/* 
        The Persistent Right AI Assistant Dock:
        - Desktop (>= 1280px): Persistent docked split-pane (w-[24rem] = 384px) with fixed border.
        - Smaller viewports: Slide-over right drawer (z-40).
        - Height of header: strictly standard h-13 (52px / 3.25rem) matching navigation rail & sticky filter bar.
      */}
      <aside
        aria-label="AI Assistant Dock"
        className={`fixed top-0 bottom-0 right-0 z-40 xl:static flex flex-col bg-[var(--surface-elevated)] border-l border-[var(--border-subtle)] shadow-xl xl:shadow-none transition-all duration-300 ease-in-out shrink-0 overflow-hidden ${
          isOpen
            ? "translate-x-0 w-[90vw] sm:w-[24rem] xl:w-[24rem]"
            : "translate-x-full xl:translate-x-0 xl:w-0 border-l-0"
        }`}
      >
        {/* Fixed 384px inner container prevents text reflow during animations */}
        <div className="w-[90vw] sm:w-[24rem] xl:w-[24rem] h-full flex flex-col shrink-0 overflow-hidden">
          {/* ========================================================================= */}
          {/* VIEW 1: CONVERSATIONS DIRECTORY                                           */}
          {/* ========================================================================= */}
          {dockView === "list" ? (
            <div className="flex-1 flex flex-col h-full overflow-hidden">
              {/* Directory Header (h-13) */}
              <div className="h-13 border-b border-[var(--border-subtle)] px-2.5 flex items-center justify-between shrink-0 bg-[var(--surface-elevated)]">
                <div className="flex items-center gap-2 min-w-0">
                  {/* Top-left Collapse Icon Button */}
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    title="Collapse AI panel (Esc or ⌘K)"
                    aria-label="Collapse AI panel"
                    className="p-1.5 rounded-md hover:bg-[var(--surface-sunken)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer shrink-0"
                  >
                    <PanelRightClose className="h-4 w-4" />
                  </button>

                  <div className="truncate">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold tracking-tight block truncate text-[var(--text-primary)]">
                        AI Conversations
                      </span>
                      {/* Connection / Generation Status Indicator Pill */}
                      <span
                        data-testid="ai-status-badge-expanded"
                        data-status={isGenerating ? "generating" : "ready"}
                        title={isGenerating ? "Agent is currently generating response" : "Agent online and ready"}
                        className={`inline-flex items-center gap-1 px-1.5 py-0.2 rounded border text-[9px] font-mono-tabular font-semibold shrink-0 ${
                          isGenerating
                            ? "bg-amber-500/10 border-amber-500/30 text-amber-500"
                            : "bg-emerald-500/10 border-emerald-500/30 text-emerald-500"
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            isGenerating ? "bg-amber-500 animate-ping" : "bg-emerald-500"
                          }`}
                        />
                        <span>{isGenerating ? "Thinking" : "Ready"}</span>
                      </span>
                    </div>
                    <span className="text-[10px] font-mono-tabular text-[var(--text-muted)]">
                      {conversations.length} total sessions
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => startNewConversation()}
                    disabled={isGenerating}
                    title="Start new conversation"
                    aria-label="Start new conversation"
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-[var(--border-focus)] text-white text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-2xs"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>New</span>
                  </button>
                </div>
              </div>

              {/* Search Bar for Conversations */}
              <div className="p-2 border-b border-[var(--border-subtle)] bg-[var(--surface-base)]/50 shrink-0">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-muted)]" />
                  <input
                    type="text"
                    value={listSearch}
                    onChange={(e) => setListSearch(e.target.value)}
                    placeholder="Search conversations & jobs..."
                    className="w-full pl-8 pr-3 py-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--border-focus)] transition-colors"
                  />
                </div>
              </div>

              {/* Conversations List */}
              <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
                {isLoadingConversations && conversations.length === 0 ? (
                  <div className="p-6 text-center text-xs text-[var(--text-muted)] flex items-center justify-center gap-2">
                    <Sparkles className="h-4 w-4 animate-spin text-amber-500" />
                    <span>Loading conversations...</span>
                  </div>
                ) : conversationListError ? (
                  <div role="alert" className="p-6 text-center text-xs text-[var(--status-danger-fg)] space-y-2">
                    <p>Conversation history could not be loaded.</p>
                    <button
                      type="button"
                      onClick={() => fetchConversations()}
                      className="px-3 py-1.5 rounded-md border border-[var(--border-subtle)] text-[var(--text-primary)]"
                    >
                      Retry
                    </button>
                  </div>
                ) : filteredConversations.length === 0 ? (
                  <div className="p-6 text-center text-xs text-[var(--text-muted)] space-y-2">
                    <p>No conversations found.</p>
                    <button
                      type="button"
                      onClick={() => startNewConversation()}
                      className="px-3 py-1.5 rounded-md bg-[var(--border-focus)] text-white text-xs font-medium cursor-pointer"
                    >
                      Start First Conversation
                    </button>
                  </div>
                ) : (
                  filteredConversations.map((conv) => {
                    const isActive = conv.id === activeConversationId;
                    return (
                      <div
                        key={conv.id}
                        onClick={() => selectConversation(conv.id)}
                        aria-disabled={isGenerating}
                        className={`group relative rounded-lg border p-2.5 text-xs transition-all cursor-pointer ${
                          isActive
                            ? "border-[var(--border-focus)] bg-[var(--surface-sunken)] shadow-xs"
                            : "border-[var(--border-subtle)] bg-[var(--surface-elevated)] hover:bg-[var(--surface-sunken)]/60"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-bold text-[var(--text-primary)] truncate block flex-1">
                            {conv.title}
                          </span>
                          <span className="text-[10px] font-mono-tabular text-[var(--text-muted)] shrink-0 flex items-center gap-1">
                            <Clock className="h-2.5 w-2.5" />
                            {new Date(conv.updated_at).toLocaleDateString([], {
                              month: "short",
                              day: "numeric",
                            })}
                          </span>
                        </div>

                        {/* Last message snippet preview */}
                        {conv.lastMessageSnippet && (
                          <p className="text-[11px] text-[var(--text-secondary)] line-clamp-1 mt-1 font-sans">
                            {conv.lastMessageSnippet}
                          </p>
                        )}

                        {/* Referenced Job Pills with hover tooltip */}
                        {conv.referencedJobs && conv.referencedJobs.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1 items-center">
                            {conv.referencedJobs.map((job) => (
                              <span
                                key={job.id}
                                title={`${job.title} at ${job.company}`}
                                className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-[var(--surface-sunken)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-focus)] transition-colors"
                              >
                                <Briefcase className="h-2.5 w-2.5 text-[var(--border-focus)] shrink-0" />
                                <span className="truncate max-w-[12rem]">
                                  {job.company}: {job.title.slice(0, 16)}...
                                </span>
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Delete button (hover only) */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                              if (window.confirm(`Delete "${conv.title}"? This cannot be undone.`)) {
                                deleteConversation(conv.id);
                              }
                          }}
                            disabled={isGenerating}
                          title="Delete conversation"
                          aria-label="Delete conversation"
                          className="opacity-0 group-hover:opacity-100 absolute bottom-2 right-2 p-1 rounded hover:bg-[var(--status-danger-bg)] hover:text-[var(--status-danger-fg)] text-[var(--text-muted)] transition-all cursor-pointer disabled:cursor-not-allowed"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          ) : (
            /* ========================================================================= */
            /* VIEW 2: ACTIVE CHAT THREAD                                                */
            /* ========================================================================= */
            <div className="flex-1 flex flex-col h-full overflow-hidden">
              {/* Chat Thread Header (h-13) */}
              <div className="h-13 border-b border-[var(--border-subtle)] px-2.5 flex items-center justify-between shrink-0 bg-[var(--surface-elevated)]">
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  {/* Top-left Collapse Icon Button */}
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    title="Collapse AI panel (Esc or ⌘K)"
                    aria-label="Collapse AI panel"
                    className="p-1.5 rounded-md hover:bg-[var(--surface-sunken)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer shrink-0"
                  >
                    <PanelRightClose className="h-4 w-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setDockView("list")}
                    disabled={isGenerating}
                    title="Back to conversation list"
                    aria-label="Back to conversation list"
                    className="p-1 rounded-md hover:bg-[var(--surface-sunken)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer shrink-0"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-xs font-bold tracking-tight block truncate text-[var(--text-primary)]">
                        {activeConversation?.title || "AI Assistant Thread"}
                      </span>
                      {/* Connection / Generation Status Indicator Pill */}
                      <span
                        data-testid="ai-status-badge-chat"
                        data-status={isGenerating ? "generating" : "ready"}
                        title={isGenerating ? "Agent is currently generating response" : "Agent online and ready"}
                        className={`inline-flex items-center gap-1 px-1.5 py-0.2 rounded border text-[9px] font-mono-tabular font-semibold shrink-0 ${
                          isGenerating
                            ? "bg-amber-500/10 border-amber-500/30 text-amber-500"
                            : "bg-emerald-500/10 border-emerald-500/30 text-emerald-500"
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            isGenerating ? "bg-amber-500 animate-ping" : "bg-emerald-500"
                          }`}
                        />
                        <span className="hidden sm:inline">{isGenerating ? "Thinking" : "Ready"}</span>
                      </span>
                    </div>
                    <span className="text-[10px] font-mono-tabular text-[var(--text-muted)] flex items-center gap-1">
                      <span>Interactive Agent</span>
                      <span className="text-[8px]">●</span>
                      <kbd className="px-1 py-0.2 rounded bg-[var(--surface-sunken)] border border-[var(--border-subtle)]">
                        ⌘K
                      </kbd>
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => startNewConversation()}
                    disabled={isGenerating}
                    title="Start new conversation"
                    aria-label="Start new conversation"
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-[var(--border-focus)] text-white text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-2xs"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>New</span>
                  </button>
                </div>
              </div>

              {/* Active Job Context Tag Banner */}
              {activeJobContext && (
                <div className="px-3 py-2 bg-[var(--surface-sunken)]/60 border-b border-[var(--border-subtle)] flex items-center justify-between gap-2 shrink-0">
                  <div className="flex items-center gap-2 min-w-0 text-xs">
                    <Briefcase className="h-3.5 w-3.5 text-[var(--border-focus)] shrink-0" />
                    <div className="truncate min-w-0">
                      <span className="font-semibold text-[var(--text-primary)] block truncate">
                        {activeJobContext.title}
                      </span>
                      <span className="text-[10px] text-[var(--text-secondary)] font-mono-tabular block truncate">
                        {activeJobContext.company}
                        {activeJobContext.location ? ` · ${activeJobContext.location}` : ""}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={clearActiveJobContext}
                    title="Detach job context"
                    aria-label="Detach job context"
                    className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors cursor-pointer shrink-0"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}

              {/* Message Stream Viewport */}
              <div className="flex-1 overflow-y-auto p-3 space-y-3 font-sans text-xs">
                {messages.map((msg) => {
                  const isUser = msg.role === "user";
                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col space-y-1 ${isUser ? "items-end" : "items-start"}`}
                    >
                      <div
                        className={`max-w-[88%] rounded-lg p-3 text-xs leading-relaxed break-words whitespace-pre-wrap ${
                          isUser
                            ? "bg-[var(--border-focus)] text-white font-medium"
                            : "bg-[var(--surface-sunken)] border border-[var(--border-subtle)] text-[var(--text-primary)]"
                        }`}
                      >
                        {msg.content || (
                          <span className="inline-flex items-center gap-1.5 text-[var(--text-muted)] animate-pulse font-mono-tabular">
                            <Sparkles className="h-3 w-3 text-amber-500 animate-spin" />
                            Thinking...
                          </span>
                        )}
                      </div>

                      {/* Tool call audit indicator */}
                      {msg.toolCalls && msg.toolCalls.length > 0 && (
                        <div className="flex flex-wrap gap-1 px-1">
                          {msg.toolCalls.map((tc, idx) => (
                            <span
                              key={idx}
                              className="inline-flex items-center gap-1 text-[10px] font-mono-tabular px-1.5 py-0.5 rounded bg-[var(--surface-sunken)] border border-[var(--border-subtle)] text-[var(--text-muted)]"
                            >
                              <CheckCircle2 className="h-2.5 w-2.5 text-emerald-500" />
                              Tool: {tc.name}
                            </span>
                          ))}
                        </div>
                      )}

                      <span className="text-[9px] font-mono-tabular text-[var(--text-muted)] px-1">
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Error Callout */}
              {error && (
                <div className="mx-3 mb-2 p-2 rounded-md bg-[var(--status-danger-bg)] border border-[var(--status-danger-fg)]/20 text-[var(--status-danger-fg)] text-[11px] flex items-center gap-1.5 shrink-0">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{error}</span>
                </div>
              )}

              {/* Quick Suggestion Chips */}
              <div className="px-3 py-1.5 border-t border-[var(--border-subtle)]/70 flex items-center gap-1.5 overflow-x-auto shrink-0 scrollbar-none">
                <button
                  type="button"
                  onClick={() =>
                    sendMessage(
                      activeJobContext
                        ? `What are the critical qualification gaps between my profile and ${activeJobContext.title} at ${activeJobContext.company}?`
                        : "How does my candidate profile compare against typical Senior / Staff level postings?"
                    )
                  }
                  disabled={isGenerating}
                  className="text-[10px] font-medium px-2 py-1 rounded bg-[var(--surface-sunken)] hover:bg-[var(--surface-base)] border border-[var(--border-subtle)] text-[var(--text-secondary)] whitespace-nowrap transition-colors cursor-pointer disabled:opacity-50"
                >
                  📊 Qualification Gaps
                </button>

                <button
                  type="button"
                  onClick={() =>
                    sendMessage(
                      activeJobContext
                        ? `Draft a high-impact, tailored outreach cover letter for ${activeJobContext.title} at ${activeJobContext.company}.`
                        : "Draft a tailored cold outreach message highlighting my distributed systems experience."
                    )
                  }
                  disabled={isGenerating}
                  className="text-[10px] font-medium px-2 py-1 rounded bg-[var(--surface-sunken)] hover:bg-[var(--surface-base)] border border-[var(--border-subtle)] text-[var(--text-secondary)] whitespace-nowrap transition-colors cursor-pointer disabled:opacity-50"
                >
                  ✉️ Draft Outreach
                </button>

                <button
                  type="button"
                  onClick={() =>
                    sendMessage(
                      activeJobContext
                        ? `Generate 3 tough technical interview questions likely to be asked for ${activeJobContext.title} at ${activeJobContext.company}.`
                        : "What are 3 critical system design interview topics I should prepare for?"
                    )
                  }
                  disabled={isGenerating}
                  className="text-[10px] font-medium px-2 py-1 rounded bg-[var(--surface-sunken)] hover:bg-[var(--surface-base)] border border-[var(--border-subtle)] text-[var(--text-secondary)] whitespace-nowrap transition-colors cursor-pointer disabled:opacity-50"
                >
                  🎯 Interview Prep
                </button>
              </div>

              {/* Message Input Box */}
              <form
                onSubmit={handleSubmit}
                className="p-3 border-t border-[var(--border-subtle)] bg-[var(--surface-elevated)] shrink-0"
              >
                <div className="relative rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] focus-within:border-[var(--border-focus)] focus-within:ring-1 focus-within:ring-[var(--border-focus)] transition-all">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDownInput}
                    rows={2}
                    placeholder={
                      activeJobContext
                        ? `Ask about ${activeJobContext.title}...`
                        : "Ask about jobs, qualification gaps, or interview prep..."
                    }
                    className="w-full resize-none bg-transparent p-2.5 text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none"
                  />

                  <div className="flex items-center justify-between px-2.5 pb-2 text-[10px] text-[var(--text-muted)] font-mono-tabular">
                    <span>Enter to send · Shift+Enter for newline</span>
                    <button
                      type="submit"
                      disabled={!input.trim() || isGenerating}
                      aria-label="Send message"
                      className="inline-flex items-center justify-center h-6 w-6 rounded bg-[var(--border-focus)] text-white hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
                    >
                      <Send className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </form>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
