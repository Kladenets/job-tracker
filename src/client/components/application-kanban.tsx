import React from "react";
import { Application, ApplicationStatus, UnifiedJobPosting } from "../../types/job-posting";
import { ApplicationCard } from "./application-card";
import { Plus } from "lucide-react";

export interface KanbanColumnDef {
  id: ApplicationStatus;
  title: string;
  badgeColor: string;
}

export const KANBAN_COLUMNS: KanbanColumnDef[] = [
  { id: "preparing", title: "Preparing", badgeColor: "bg-slate-400" },
  { id: "applied", title: "Applied", badgeColor: "bg-blue-500" },
  { id: "recruiter_screen", title: "Recruiter Screen", badgeColor: "bg-amber-500" },
  { id: "interviewing", title: "Interviewing", badgeColor: "bg-purple-500" },
  { id: "assessment", title: "Assessment", badgeColor: "bg-indigo-500" },
  { id: "offer", title: "Offer", badgeColor: "bg-emerald-500" },
  { id: "rejected", title: "Rejected", badgeColor: "bg-rose-500" },
  { id: "withdrawn", title: "Archived / Withdrawn", badgeColor: "bg-zinc-500" },
];

interface ApplicationKanbanProps {
  applications: Application[];
  jobsMap: Map<string, UnifiedJobPosting>;
  onSelectApplication: (app: Application) => void;
  onStageChange: (appId: string, newStage: ApplicationStatus) => void;
  onAskAI: (job: UnifiedJobPosting) => void;
  onAddApplication: () => void;
  activeSegment: string;
}

export function ApplicationKanban({
  applications,
  jobsMap,
  onSelectApplication,
  onStageChange,
  onAskAI,
  onAddApplication,
  activeSegment,
}: ApplicationKanbanProps) {
  const [draggedAppId, setDraggedAppId] = React.useState<string | null>(null);
  const [activeDropColumn, setActiveDropColumn] = React.useState<string | null>(null);

  // Group applications by status
  const grouped = React.useMemo(() => {
    const map = new Map<ApplicationStatus, Application[]>();
    for (const col of KANBAN_COLUMNS) {
      map.set(col.id, []);
    }
    for (const app of applications) {
      const colId = (app.status as ApplicationStatus) || "preparing";
      if (!map.has(colId)) {
        map.set(colId, []);
      }
      map.get(colId)!.push(app);
    }
    return map;
  }, [applications]);

  // Filter columns based on segment: Active pipeline vs Archived
  const visibleColumns = React.useMemo(() => {
    if (activeSegment === "archived") {
      return KANBAN_COLUMNS.filter((c) =>
        ["offer", "rejected", "withdrawn"].includes(c.id)
      );
    }
    // "active" or default: active stages
    return KANBAN_COLUMNS.filter(
      (c) => !["rejected", "withdrawn"].includes(c.id)
    );
  }, [activeSegment]);

  const handleDragStart = (e: React.DragEvent, appId: string) => {
    e.dataTransfer.setData("text/plain", appId);
    e.dataTransfer.effectAllowed = "move";
    setDraggedAppId(appId);
  };

  const handleDragOver = (e: React.DragEvent, colId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (activeDropColumn !== colId) {
      setActiveDropColumn(colId);
    }
  };

  const handleDragLeave = () => {
    setActiveDropColumn(null);
  };

  const handleDrop = (e: React.DragEvent, colId: ApplicationStatus) => {
    e.preventDefault();
    const appId = e.dataTransfer.getData("text/plain") || draggedAppId;
    setActiveDropColumn(null);
    setDraggedAppId(null);
    if (appId) {
      onStageChange(appId, colId);
    }
  };

  return (
    <div className="flex gap-4 overflow-x-auto pb-6 pt-2 scrollbar-thin">
      {visibleColumns.map((col) => {
        const colApps = grouped.get(col.id) || [];
        const isDropTarget = activeDropColumn === col.id;

        return (
          <div
            key={col.id}
            onDragOver={(e) => handleDragOver(e, col.id)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, col.id)}
            className={`w-72 sm:w-80 shrink-0 flex flex-col rounded-xl border transition-all duration-200 ${
              isDropTarget
                ? "border-[var(--border-focus)] bg-[var(--surface-sunken)] ring-2 ring-[var(--border-focus)]/20"
                : "border-[var(--border-subtle)] bg-[var(--surface-elevated)]"
            }`}
          >
            {/* Column Header */}
            <div className="p-3 border-b border-[var(--border-subtle)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${col.badgeColor}`} />
                <h3 className="text-xs font-bold text-[var(--text-primary)]">
                  {col.title}
                </h3>
              </div>
              <span className="text-[11px] font-mono-tabular font-bold px-2 py-0.5 rounded-full bg-[var(--surface-sunken)] text-[var(--text-secondary)] border border-[var(--border-subtle)]">
                {colApps.length}
              </span>
            </div>

            {/* Column Cards Drop Area */}
            <div className="p-2.5 space-y-2.5 flex-1 min-h-[22rem] max-h-[calc(100vh-16rem)] overflow-y-auto">
              {colApps.length > 0 ? (
                colApps.map((app) => {
                  const job = jobsMap.get(app.job_posting_id) || null;
                  return (
                    <ApplicationCard
                      key={app.id}
                      application={app}
                      job={job}
                      isDragging={draggedAppId === app.id}
                      onDragStart={(e) => handleDragStart(e, app.id)}
                      onDragEnd={() => setDraggedAppId(null)}
                      onClick={() => onSelectApplication(app)}
                      onStageChange={(newStage) => onStageChange(app.id, newStage)}
                      onAskAI={job ? () => onAskAI(job) : undefined}
                    />
                  );
                })
              ) : (
                <div
                  className={`h-full min-h-[14rem] flex flex-col items-center justify-center p-4 border border-dashed rounded-lg text-center transition-colors ${
                    isDropTarget
                      ? "border-[var(--border-focus)] bg-[var(--surface-base)]"
                      : "border-[var(--border-subtle)] text-[var(--text-muted)]"
                  }`}
                >
                  <p className="text-[11px] text-[var(--text-muted)] font-medium">
                    {isDropTarget ? "Drop here to move" : "No applications in this stage"}
                  </p>
                </div>
              )}
            </div>

            {/* Quick Column Footer Action */}
            {col.id === "preparing" && (
              <div className="p-2 border-t border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={onAddApplication}
                  className="w-full py-1.5 px-2 rounded-md border border-dashed border-[var(--border-subtle)] hover:border-[var(--border-focus)] bg-[var(--surface-base)] text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors flex items-center justify-center gap-1.5 cursor-pointer font-medium"
                >
                  <Plus className="h-3.5 w-3.5 text-[var(--border-focus)]" />
                  <span>Add Application</span>
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
