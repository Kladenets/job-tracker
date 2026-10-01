import React from "react";
import { Briefcase } from "lucide-react";
import { ThemeToggle } from "../theme/theme-toggle";
import { AITopBarButton } from "../components/ai-topbar-button";

export function MobileTopHeader() {
  return (
    <header className="md:hidden h-13 border-b border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-3 flex items-center justify-between shrink-0 z-20">
      <div className="flex items-center gap-2">
        <div className="h-7 w-7 rounded-md bg-[var(--surface-sunken)] border border-[var(--border-subtle)] flex items-center justify-center font-bold text-[var(--border-focus)]">
          <Briefcase className="h-3.5 w-3.5" />
        </div>
        <span className="text-xs font-bold tracking-tight">Job Tracker</span>
        <span className="text-[9px] font-mono-tabular text-[var(--status-recommended-fg)] bg-[var(--status-recommended-bg)] px-1 py-0.2 rounded font-semibold">
          DEV :3000
        </span>
      </div>

      <div className="flex items-center gap-2">
        {/* Split AI Assistant button with semantic status circle (Ready 🟢 / Generating 🟠) + Quick-New (+) */}
        <AITopBarButton />
        <ThemeToggle />
      </div>
    </header>
  );
}
