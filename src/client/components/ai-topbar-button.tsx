import React from "react";
import { Sparkles, Plus } from "lucide-react";
import { useAIDockStore } from "../shell/ai-dock-store";
import { getAIStatusDescriptor } from "../shell/ai-status-helper";

interface AITopBarButtonProps {
  className?: string;
  forceShowWhenOpen?: boolean;
}

export function AITopBarButton({ className = "", forceShowWhenOpen = false }: AITopBarButtonProps) {
  const {
    isOpen,
    toggleOpen,
    isGenerating,
    startNewConversation,
    setIsOpen,
    setDockView,
  } = useAIDockStore();

  const statusDesc = getAIStatusDescriptor(isGenerating);

  // If dock is already open/expanded and forceShowWhenOpen is false, hide this topbar button
  // since the panel header now displays the collapse button and "New" action directly.
  if (isOpen && !forceShowWhenOpen) {
    return null;
  }

  const handleToggle = () => {
    toggleOpen();
  };

  const handleQuickNew = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(true);
    setDockView("chat");
    startNewConversation();
  };

  return (
    <div
      data-testid="ai-topbar-button"
      className={`inline-flex items-center rounded-md border border-[var(--border-subtle)] bg-[var(--surface-elevated)] shadow-2xs divide-x divide-[var(--border-subtle)] overflow-hidden transition-all ${
        isOpen
          ? "border-amber-500/50 ring-1 ring-amber-500/20"
          : "hover:border-[var(--border-focus)]/50"
      } ${className}`}
    >
      {/* Left Half: Main Assistant Status Toggle (Preserves Viewport Memory) */}
      <button
        type="button"
        onClick={handleToggle}
        title={`AI Assistant (${statusDesc.label}) - ⌘K or c`}
        aria-label={`Toggle AI Assistant (${statusDesc.label})`}
        aria-expanded={isOpen}
        aria-controls="ai-assistant-dock"
        className="relative inline-flex items-center justify-center h-8 md:h-9 px-2.5 transition-colors cursor-pointer text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]"
      >
        <Sparkles className={`h-3.5 w-3.5 md:h-4 md:w-4 ${isGenerating ? "animate-spin text-amber-500" : ""}`} />

        {/* Semantic Status Circle Badge (Collapsed State) */}
        <span
          data-testid="ai-status-badge-collapsed"
          data-status={statusDesc.status}
          className={`absolute top-1.5 right-1.5 h-2 w-2 rounded-full ring-2 ring-[var(--surface-elevated)] ${
            statusDesc.dotColorClass
          } ${statusDesc.isPulsing ? "animate-ping" : ""}`}
          aria-hidden="true"
        />
      </button>

      {/* Right Half: Quick New Conversation Spawn */}
      <button
        type="button"
        onClick={handleQuickNew}
        title="Start New Conversation (+)"
        aria-label="Start New Conversation"
        className="inline-flex items-center justify-center h-8 md:h-9 px-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors cursor-pointer"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
