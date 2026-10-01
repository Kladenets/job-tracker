export type AIConnectionStatus = "ready" | "generating" | "offline";

export interface AIStatusDescriptor {
  status: AIConnectionStatus;
  label: string;
  dotColorClass: string;
  badgeClass: string;
  isPulsing: boolean;
}

export function getAIStatusDescriptor(isGenerating: boolean, isOffline = false): AIStatusDescriptor {
  if (isOffline) {
    return {
      status: "offline",
      label: "Offline",
      dotColorClass: "bg-slate-400",
      badgeClass: "bg-slate-500/10 border-slate-500/30 text-slate-400",
      isPulsing: false,
    };
  }

  if (isGenerating) {
    return {
      status: "generating",
      label: "Thinking",
      dotColorClass: "bg-amber-500",
      badgeClass: "bg-amber-500/10 border-amber-500/30 text-amber-500",
      isPulsing: true,
    };
  }

  return {
    status: "ready",
    label: "Ready",
    dotColorClass: "bg-emerald-500",
    badgeClass: "bg-emerald-500/10 border-emerald-500/30 text-emerald-500",
    isPulsing: false,
  };
}
