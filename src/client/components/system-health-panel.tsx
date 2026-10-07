import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Database, Cpu, Sparkles, CheckCircle2, ShieldCheck, Activity, RefreshCw } from "lucide-react";
import {
  getDatabaseHealthDisplay,
  getGeminiTierDisplay,
  HealthTone,
  PersistenceEngine,
  GeminiKeyTier,
} from "./system-health-status";

const badgeClasses: Record<HealthTone, string> = {
  healthy: "text-[var(--status-recommended-fg)] bg-[var(--status-recommended-bg)] border-[var(--status-recommended-fg)]/20",
  warning: "text-[var(--status-marginal-fg)] bg-[var(--status-marginal-bg)] border-[var(--status-marginal-fg)]/20",
  unavailable: "text-[var(--status-danger-fg)] bg-[var(--status-danger-bg)] border-[var(--status-danger-fg)]/20",
  unknown: "text-[var(--text-muted)] bg-[var(--surface-sunken)] border-[var(--border-subtle)]",
};

const dotClasses: Record<HealthTone, string> = {
  healthy: "bg-emerald-500",
  warning: "bg-amber-500",
  unavailable: "bg-rose-500",
  unknown: "bg-slate-400",
};

interface HealthResponse {
  status: string;
  uptimeSeconds: number;
  service: string;
  version: string;
  persistence: {
  engine: PersistenceEngine;
    activeProfile: string;
  };
  aiProviders: {
    geminiInteractions: {
      configured: boolean;
      tier: GeminiKeyTier;
      failoverActive: boolean;
      mode: string;
      model: string;
    };
    jevScreening: {
      configured: boolean;
      mode: string;
    };
  };
}

interface DbStatusResponse {
  activeEngine: PersistenceEngine;
  postgres: {
    connected: boolean;
    poolCount?: number;
    error?: string;
  };
}

export function SystemHealthPanel() {
  const { data: health, isLoading: isHealthLoading, refetch: refetchHealth } = useQuery<HealthResponse>({
    queryKey: ["system-health"],
    queryFn: async () => {
      const res = await fetch("/api/health");
      if (!res.ok) throw new Error("Failed to fetch health");
      return res.json();
    },
  });

  const { data: dbStatus, isLoading: isDbLoading, refetch: refetchDb } = useQuery<DbStatusResponse>({
    queryKey: ["db-status"],
    queryFn: async () => {
      const res = await fetch("/api/db/status");
      if (!res.ok) throw new Error("Failed to fetch db status");
      return res.json();
    },
  });

  const isRefreshing = isHealthLoading || isDbLoading;

  const handleRefreshAll = () => {
    refetchHealth();
    refetchDb();
  };

  const activeEngine = dbStatus?.activeEngine ?? health?.persistence.engine;
  const isPostgres = activeEngine === "postgres";
  const databaseState = getDatabaseHealthDisplay(activeEngine, dbStatus?.postgres.connected);
  const gemini = health?.aiProviders.geminiInteractions;
  const geminiState = getGeminiTierDisplay(gemini?.tier, gemini?.failoverActive);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-[var(--border-subtle)]">
        <div>
          <h2 className="text-sm font-bold text-[var(--text-primary)]">
            System & AI Provider Health Overview
          </h2>
          <p className="text-xs text-[var(--text-secondary)]">
            Telemetry and operational diagnostics for database persistence, JEV scoring, and Gemini Interactions.
          </p>
        </div>

        <button
          type="button"
          onClick={handleRefreshAll}
          disabled={isRefreshing}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 shadow-xs self-start sm:self-auto"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin text-[var(--border-focus)]" : ""}`} />
          <span>Refresh Diagnostics</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Database Engine Status */}
        <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] space-y-3 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
              <Database className="h-4 w-4 text-[var(--border-focus)]" />
              Database Engine
            </span>
            <span className={`inline-flex items-center gap-1 text-[10px] font-mono-tabular font-medium px-1.5 py-0.5 rounded border ${badgeClasses[databaseState.tone]}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${dotClasses[databaseState.tone]}`} />
              {databaseState.label}
            </span>
          </div>

          <div className="space-y-2 text-xs font-mono-tabular">
            <div className="flex items-center justify-between">
              <span className="text-[var(--text-muted)]">Active Engine:</span>
              <span className="font-bold text-[var(--text-primary)] uppercase">
                {activeEngine ? activeEngine === "postgres" ? "POSTGRES" : "FILE" : "Unknown"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[var(--text-muted)]">Storage Target:</span>
              <span className="text-[var(--text-secondary)] truncate max-w-44">
                {isPostgres ? "PostgreSQL connection pool" : activeEngine === "file" ? "data/job_tracker_store.json" : "Unknown"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[var(--text-muted)]">Transaction State:</span>
                <span className={databaseState.tone === "healthy" ? "text-[var(--status-recommended-fg)]" : "text-[var(--status-danger-fg)]"}>
                  {databaseState.tone === "healthy" ? isPostgres ? "Connection verified" : "File store active" : databaseState.label}
                </span>
            </div>
          </div>

          <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed pt-2 border-t border-[var(--border-subtle)]">
            {databaseState.description}
          </p>
        </div>

        {/* Card 2: AI System 1 (TypeSafe AI / JEV) */}
        <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] space-y-3 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
              <Cpu className="h-4 w-4 text-emerald-500" />
              AI System 1 (JEV)
            </span>
            <span className="inline-flex items-center gap-1 text-[10px] font-mono-tabular font-medium text-[var(--status-recommended-fg)] bg-[var(--status-recommended-bg)] px-1.5 py-0.5 rounded border border-[var(--status-recommended-fg)]/20">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              {health?.aiProviders.jevScreening.configured ? "Live Scoring" : "Simulated"}
            </span>
          </div>

          <div className="space-y-2 text-xs font-mono-tabular">
            <div className="flex items-center justify-between">
              <span className="text-[var(--text-muted)]">Screening Mode:</span>
              <span className="font-semibold text-[var(--text-primary)]">
                {health?.aiProviders.jevScreening.configured ? "TypeSafe AI Engine" : "Rule Heuristics"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[var(--text-muted)]">Threshold:</span>
              <span className="font-bold text-[var(--status-recommended-fg)]">&ge; 70% Confidence</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[var(--text-muted)]">Schema Validation:</span>
              <span className="text-[var(--status-recommended-fg)]">TypeSafe Zod Guard</span>
            </div>
          </div>

          <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed pt-2 border-t border-[var(--border-subtle)]">
            Job Evaluation & Qualification (JEV) scores crawled postings against candidate technical qualifications.
          </p>
        </div>

        {/* Card 3: AI System 2 (Google Gemini Interactions) */}
        <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] space-y-3 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-amber-500" />
              AI System 2 (Gemini)
            </span>
            <span className={`inline-flex items-center gap-1 text-[10px] font-mono-tabular font-medium px-1.5 py-0.5 rounded border ${badgeClasses[geminiState.tone]}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${dotClasses[geminiState.tone]}`} />
              {geminiState.label}
            </span>
          </div>

          <div className="space-y-2 text-xs font-mono-tabular">
            <div className="flex items-center justify-between">
              <span className="text-[var(--text-muted)]">Active Model:</span>
              <span className="font-semibold text-[var(--text-primary)]">
                {health?.aiProviders.geminiInteractions.model || "gemini-3.5-flash-lite"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[var(--text-muted)]">Failover Active:</span>
              <span className={health?.aiProviders.geminiInteractions.failoverActive ? "text-amber-500" : "text-slate-500"}>
                {gemini?.failoverActive === undefined ? "Unknown" : gemini.failoverActive ? "Active" : "Inactive"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[var(--text-muted)]">Multi-Turn Dock:</span>
              <span className="text-[var(--status-recommended-fg)]">Directory & Thread</span>
            </div>
          </div>

          <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed pt-2 border-t border-[var(--border-subtle)]">
            Provides conversational deep analysis, automated thread title generation, interview prep, and custom cover letters.
          </p>
        </div>
      </div>
    </div>
  );
}
