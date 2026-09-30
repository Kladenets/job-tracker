import React from "react";
import { Sliders, RefreshCw, Cpu, Database, CheckCircle2 } from "lucide-react";

export function SetupPage() {
  return (
    <div className="flex-1 p-6 max-w-4xl mx-auto w-full space-y-6">
      <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Setup & Configuration</h1>
          <p className="text-xs text-[var(--text-secondary)]">
            Manage candidate qualification rules, target titles, source crawlers, and Gemini agent credentials.
          </p>
        </div>
        <button
          type="button"
          className="px-3 py-1.5 rounded-md bg-[var(--surface-elevated)] border border-[var(--border-subtle)] text-xs font-semibold hover:bg-[var(--surface-sunken)] transition-colors flex items-center gap-1.5 cursor-pointer"
        >
          <RefreshCw className="h-3.5 w-3.5 text-[var(--border-focus)]" />
          <span>Run Discovery Now</span>
        </button>
      </div>

      <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-5 space-y-4 shadow-xs">
        <h2 className="text-sm font-bold">Candidate Search Profile</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="space-y-1">
            <span className="text-[var(--text-muted)]">Target Roles:</span>
            <p className="font-semibold">Staff Software Engineer, Senior Backend Engineer</p>
          </div>
          <div className="space-y-1">
            <span className="text-[var(--text-muted)]">Minimum Experience:</span>
            <p className="font-semibold">6 Years</p>
          </div>
          <div className="space-y-1">
            <span className="text-[var(--text-muted)]">Target Locations:</span>
            <p className="font-semibold">Remote (US), San Francisco, CA</p>
          </div>
          <div className="space-y-1">
            <span className="text-[var(--text-muted)]">Active Source Adapters:</span>
            <p className="font-semibold">Greenhouse, Lever, JobSpy CLI</p>
          </div>
        </div>
      </div>

      <div className="p-4 rounded-lg border border-dashed border-[var(--border-subtle)] text-center text-xs text-[var(--text-muted)]">
        Interactive candidate profile editor, single-URL manual importer, and crawler controls will be wired in Chunk 7.
      </div>
    </div>
  );
}
