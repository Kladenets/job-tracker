import React, { useRef } from "react";
import { useShellStore } from "./shell-store";
import { X, Keyboard } from "lucide-react";
import { useDialogFocus } from "../hooks/use-dialog-focus";

export function ShortcutHelpModal() {
  const { shortcutHelpOpen, setShortcutHelpOpen } = useShellStore();
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(dialogRef, { enabled: shortcutHelpOpen, onClose: () => setShortcutHelpOpen(false), initialFocusSelector: '[aria-label="Close keyboard shortcuts"]' });

  if (!shortcutHelpOpen) return null;

  const shortcuts = [
    { key: "[", desc: "Toggle Left Navigation Rail collapse" },
    { key: "Cmd + K", desc: "Toggle Right AI Assistant Dock" },
    { key: "/", desc: "Focus in-page search input" },
    { key: "j / k", desc: "Navigate next / previous job in inbox queue" },
    { key: "s", desc: "Save selected job (advance to Saved)" },
    { key: "x", desc: "Dismiss selected job" },
    { key: "a", desc: "Open direct external job application link" },
    { key: "Cmd + Z", desc: "Undo last triage decision" },
    { key: "?", desc: "Toggle this keyboard shortcut helper" },
  ];

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcut-title"
      tabIndex={-1}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs"
    >
      <div className="w-full max-w-md rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-2 text-sm font-bold">
            <Keyboard className="h-4 w-4 text-[var(--border-focus)]" />
            <h2 id="shortcut-title">Keyboard Shortcuts</h2>
          </div>
          <button
            type="button"
            onClick={() => setShortcutHelpOpen(false)}
            aria-label="Close keyboard shortcuts"
            className="p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="divide-y divide-[var(--border-subtle)] max-h-80 overflow-y-auto pr-1">
          {shortcuts.map((s) => (
            <div key={s.key} className="py-2.5 flex items-center justify-between text-xs">
              <span className="text-[var(--text-secondary)]">{s.desc}</span>
              <kbd className="px-2 py-0.5 rounded bg-[var(--surface-sunken)] border border-[var(--border-subtle)] font-mono-tabular font-semibold text-[var(--text-primary)] shadow-xs">
                {s.key}
              </kbd>
            </div>
          ))}
        </div>

        <div className="pt-2 text-[11px] text-center text-[var(--text-muted)]">
          Press <kbd className="px-1.5 py-0.5 rounded bg-[var(--surface-sunken)] border border-[var(--border-subtle)] font-mono-tabular">Esc</kbd> to close anytime
        </div>
      </div>
    </div>
  );
}
