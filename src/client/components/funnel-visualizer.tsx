import React from "react";
import { ArrowRight, CheckCircle2, Inbox, Send, PhoneCall, Award, Users } from "lucide-react";

interface FunnelData {
  discoveredCount: number;
  recommendedCount: number;
  savedCount: number;
  dismissedCount: number;
  appliedCount: number;
  recruiterScreenCount: number;
  interviewCount: number;
  offerCount: number;
}

interface FunnelVisualizerProps {
  funnel: FunnelData;
}

export function FunnelVisualizer({ funnel }: FunnelVisualizerProps) {
  const steps = [
    {
      id: "discovered",
      label: "Discovered",
      count: funnel.discoveredCount,
      sub: "Total ATS Crawled",
      icon: Inbox,
      color: "bg-slate-500",
    },
    {
      id: "recommended",
      label: "Passed Filter",
      count: funnel.recommendedCount,
      sub: `${funnel.discoveredCount > 0 ? Math.round((funnel.recommendedCount / funnel.discoveredCount) * 100) : 0}% yield`,
      icon: CheckCircle2,
      color: "bg-emerald-500",
    },
    {
      id: "saved",
      label: "Saved & Review",
      count: funnel.savedCount,
      sub: "Candidate Shortlist",
      icon: Users,
      color: "bg-blue-500",
    },
    {
      id: "applied",
      label: "Applications",
      count: funnel.appliedCount,
      sub: "Direct ATS Submissions",
      icon: Send,
      color: "bg-indigo-500",
    },
    {
      id: "screen",
      label: "Recruiter Screen",
      count: funnel.recruiterScreenCount,
      sub: `${funnel.appliedCount > 0 ? Math.round((funnel.recruiterScreenCount / funnel.appliedCount) * 100) : 0}% callback`,
      icon: PhoneCall,
      color: "bg-amber-500",
    },
    {
      id: "interview",
      label: "Interviewing",
      count: funnel.interviewCount,
      sub: "Technical & Panel",
      icon: Users,
      color: "bg-purple-500",
    },
    {
      id: "offer",
      label: "Offer Extended",
      count: funnel.offerCount,
      sub: "Final Stage",
      icon: Award,
      color: "bg-emerald-600",
    },
  ];

  return (
    <div className="p-4 sm:p-5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-base)] space-y-4 shadow-xs">
      <div className="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)]">
        <div>
          <h3 className="text-sm font-bold text-[var(--text-primary)]">
            End-to-End Pipeline Funnel
          </h3>
          <p className="text-xs text-[var(--text-secondary)]">
            Horizontal stage progression from initial crawl to offer.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
        {steps.map((step, idx) => {
          const Icon = step.icon;
          return (
            <div
              key={step.id}
              className="relative p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)] space-y-1.5 flex flex-col justify-between"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-[var(--text-muted)] truncate">
                  {step.label}
                </span>
                <span className={`h-2 w-2 rounded-full ${step.color}`} />
              </div>
              <div>
                <p className="text-xl font-bold font-mono-tabular text-[var(--text-primary)]">
                  {step.count}
                </p>
                <p className="text-[10px] text-[var(--text-secondary)] font-mono-tabular truncate">
                  {step.sub}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
