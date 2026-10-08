import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { StickyFilterBar } from "../components/sticky-filter-bar";
import { ApplicationKanban } from "../components/application-kanban";
import { ApplicationTable } from "../components/application-table";
import { ApplicationDetailsDrawer } from "../components/application-details-drawer";
import { AddApplicationModal } from "../components/add-application-modal";
import { isApplicationInSegment } from "../components/application-stages";
import { useAIDockStore } from "../shell/ai-dock-store";
import { useShellStore } from "../shell/shell-store";
import { Application, ApplicationStatus, UnifiedJobPosting } from "../../types/job-posting";
import {
  KanbanSquare,
  Table as TableIcon,
  Plus,
  ShieldAlert,
  Inbox,
  CheckCircle2,
  AlertCircle,
  Briefcase,
} from "lucide-react";
import { Link } from "@tanstack/react-router";

type ViewMode = "kanban" | "table";

export function ApplicationsPage() {
  const queryClient = useQueryClient();
  const { askAboutJob } = useAIDockStore();
  const { userRole } = useShellStore();
  const isGuest = userRole === "guest";

  // State
  const [viewMode, setViewMode] = useState<ViewMode>("kanban");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [segment, setSegment] = useState("active");
  const [sort, setSort] = useState("date_desc");
  const [selectedApp, setSelectedApp] = useState<Application | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Debounce search by 200ms
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
    }, 200);
    return () => clearTimeout(handler);
  }, [search]);

  // Toast auto-dismiss
  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  }, []);

  // 1. Fetch Applications (Query)
  const {
    data: applicationsData,
    isLoading: isAppsLoading,
    isError: isAppsError,
    error: appsError,
  } = useQuery<{ success: boolean; count: number; applications: Application[] }>({
    queryKey: ["applications"],
    queryFn: async () => {
      const res = await fetch("/api/applications");
      if (!res.ok) {
        if (res.status === 403) {
          throw new Error("GUEST_RESTRICTED");
        }
        throw new Error(`Failed to load applications: HTTP ${res.status}`);
      }
      return res.json();
    },
    enabled: !isGuest,
  });

  // 2. Fetch Jobs to populate company, title, location relations
  const { data: jobsData } = useQuery<{ count: number; postings: UnifiedJobPosting[] }>({
    queryKey: ["jobs"],
    queryFn: async () => {
      const res = await fetch("/api/jobs?limit=200");
      if (!res.ok) throw new Error("Failed to load jobs");
      return res.json();
    },
  });

  const jobsMap = useMemo(() => {
    const map = new Map<string, UnifiedJobPosting>();
    if (jobsData?.postings) {
      for (const j of jobsData.postings) {
        map.set(j.id, j);
      }
    }
    return map;
  }, [jobsData]);

  // 3. Update application mutation
  const updateMutation = useMutation({
    mutationFn: async ({
      appId,
      updates,
    }: {
      appId: string;
      updates: {
        status?: ApplicationStatus;
        next_action_date?: string | null;
        user_notes?: string | null;
        application_url?: string | null;
      };
    }) => {
      const res = await fetch(`/api/applications/${appId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error("Failed to update application");
      return res.json();
    },
    onMutate: async ({ appId, updates }) => {
      await queryClient.cancelQueries({ queryKey: ["applications"] });
      const prevData = queryClient.getQueryData<{
        success: boolean;
        count: number;
        applications: Application[];
      }>(["applications"]);

      if (prevData) {
        queryClient.setQueryData(["applications"], {
          ...prevData,
          applications: prevData.applications.map((a) =>
            a.id === appId ? { ...a, ...updates } : a
          ),
        });
      }
      return { prevData };
    },
    onError: (_err, _vars, context) => {
      if (context?.prevData) {
        queryClient.setQueryData(["applications"], context.prevData);
      }
      showToast("Failed to update application on server.");
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["applications"] });
      if (selectedApp && selectedApp.id === data.application?.id) {
        setSelectedApp(data.application);
      }
      showToast("Application updated successfully.");
    },
  });

  // 4. Create application mutation
  const createMutation = useMutation({
    mutationFn: async (data: {
      company: string;
      title: string;
      status: ApplicationStatus;
      application_url?: string;
      applied_at?: string;
      next_action_date?: string;
      user_notes?: string;
    }) => {
      const res = await fetch("/api/applications/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create manual application");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["applications"] });
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      showToast("Application tracked successfully.");
    },
  });

  // 5. Delete application mutation
  const deleteMutation = useMutation({
    mutationFn: async (appId: string) => {
      const res = await fetch(`/api/applications/${appId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete application");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["applications"] });
      setSelectedApp(null);
      showToast("Application deleted.");
    },
  });

  // Filter & Search Logic
  const allApplications = useMemo(() => {
    return applicationsData?.applications || [];
  }, [applicationsData]);

  const filteredApplications = useMemo(() => {
    return allApplications.filter((app) => {
      const job = jobsMap.get(app.job_posting_id);
      const titleLower = (job?.title || "").toLowerCase();
      const compLower = (job?.company || "").toLowerCase();
      const notesLower = (app.user_notes || "").toLowerCase();
      const searchTarget = `${titleLower} ${compLower} ${notesLower}`;

      // Search match
      if (debouncedSearch && !searchTarget.includes(debouncedSearch.toLowerCase())) {
        return false;
      }

      // Stage segment match
      if (segment === "active") {
        if (!isApplicationInSegment(app.status, "active")) return false;
      } else if (segment === "archived") {
        if (!isApplicationInSegment(app.status, "archived")) return false;
      }

      return true;
    });
  }, [allApplications, jobsMap, debouncedSearch, segment]);

  // Sort logic
  const sortedApplications = useMemo(() => {
    const list = [...filteredApplications];
    if (sort === "date_desc") {
      list.sort((a, b) => {
        const dateA = new Date(a.applied_at || a.created_at).getTime();
        const dateB = new Date(b.applied_at || b.created_at).getTime();
        return dateB - dateA;
      });
    } else if (sort === "company_asc") {
      list.sort((a, b) => {
        const compA = (jobsMap.get(a.job_posting_id)?.company || "").toLowerCase();
        const compB = (jobsMap.get(b.job_posting_id)?.company || "").toLowerCase();
        return compA.localeCompare(compB);
      });
    } else if (sort === "deadline_asc") {
      list.sort((a, b) => {
        const timeA = a.next_action_date ? new Date(a.next_action_date).getTime() : Infinity;
        const timeB = b.next_action_date ? new Date(b.next_action_date).getTime() : Infinity;
        return timeA - timeB;
      });
    }
    return list;
  }, [filteredApplications, jobsMap, sort]);

  // Handle stage change
  const handleStageChange = useCallback(
    (appId: string, newStage: ApplicationStatus) => {
      updateMutation.mutate({
        appId,
        updates: { status: newStage },
      });
    },
    [updateMutation]
  );

  // Guest Mode Guard Card (requirements/frontend/page-applications.md section 1.6)
  if (isGuest || (isAppsError && (appsError as Error)?.message === "GUEST_RESTRICTED")) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-lg mx-auto space-y-5 my-auto">
        <div className="h-14 w-14 rounded-2xl bg-[var(--surface-sunken)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--border-focus)] shadow-inner">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <div className="space-y-2">
          <h2 className="text-lg font-bold text-[var(--text-primary)]">
            Application Pipeline & Kanban Tracker
          </h2>
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
            Restricted to authenticated candidate workspace to preserve personal applicant privacy. Explore the public job directory and test the interactive AI agent in Explore Jobs.
          </p>
        </div>
        <Link
          to="/inbox"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-[var(--border-focus)] text-white text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer shadow-xs"
        >
          <Inbox className="h-4 w-4" />
          <span>Go to Recommendation Inbox</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-full">
      {/* Toast Announcement */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 right-5 z-50 flex items-center gap-2 px-3.5 py-2.5 rounded-lg bg-[var(--surface-overlay)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] shadow-lg animate-in fade-in duration-200"
        >
          <CheckCircle2 className="h-4 w-4 text-[var(--status-recommended-fg)]" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Sticky Filter Bar */}
      <StickyFilterBar
        itemCount={sortedApplications.length}
        totalCount={allApplications.length}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Filter applications by company, title, or notes..."
        activeSegment={segment}
        onSegmentChange={setSegment}
        segments={[
          { id: "active", label: "Active Pipeline", count: allApplications.filter(a => isApplicationInSegment(a.status, "active")).length },
          { id: "all", label: "All Stages", count: allApplications.length },
          { id: "archived", label: "Archived", count: allApplications.filter(a => isApplicationInSegment(a.status, "archived")).length },
        ]}
        sortValue={sort}
        onSortChange={setSort}
        sortOptions={[
          { id: "date_desc", label: "Recent Activity" },
          { id: "company_asc", label: "Company (A-Z)" },
          { id: "deadline_asc", label: "Urgent Deadlines" },
        ]}
        rightControls={
          <div className="flex items-center gap-1 bg-[var(--surface-elevated)] p-0.5 rounded-md border border-[var(--border-subtle)]">
            <button
              type="button"
              onClick={() => setViewMode("kanban")}
              title="Kanban Board View"
              aria-label="Kanban board view"
              className={`p-1.5 rounded transition-colors cursor-pointer ${
                viewMode === "kanban"
                  ? "bg-[var(--surface-base)] text-[var(--text-primary)] shadow-xs"
                  : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
              }`}
            >
              <KanbanSquare className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("table")}
              title="Table List View"
              aria-label="Table list view"
              className={`p-1.5 rounded transition-colors cursor-pointer ${
                viewMode === "table"
                  ? "bg-[var(--surface-base)] text-[var(--text-primary)] shadow-xs"
                  : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
              }`}
            >
              <TableIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        }
      />

      {/* Main Page Area */}
      <div className="p-4 md:p-6 max-w-7xl mx-auto w-full space-y-4 flex-1 flex flex-col">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-2 border-b border-[var(--border-subtle)]">
          <div>
            <h1 className="text-lg md:text-xl font-bold tracking-tight text-[var(--text-primary)]">
              Application Tracker
            </h1>
            <p className="text-xs text-[var(--text-secondary)]">
              Manage multi-stage interview lifecycles, next-action deadlines, and interview notes.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsAddModalOpen(true)}
            className="self-start sm:self-auto px-3.5 py-1.5 rounded-md bg-[var(--border-focus)] text-white text-xs font-semibold hover:opacity-90 transition-opacity flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Application</span>
          </button>
        </div>

        {/* Content View: Loading / Empty / Board / Table */}
        {isAppsLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 pt-4">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-72 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] animate-pulse p-4 space-y-3"
              >
                <div className="h-4 bg-[var(--surface-sunken)] rounded w-1/2" />
                <div className="h-20 bg-[var(--surface-sunken)] rounded" />
                <div className="h-20 bg-[var(--surface-sunken)] rounded" />
              </div>
            ))}
          </div>
        ) : allApplications.length === 0 ? (
          /* Empty Pipeline Onboarding State (Section 2 Non-Functional) */
          <div className="my-auto py-12 px-6 rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-center max-w-md mx-auto space-y-4">
            <div className="h-12 w-12 rounded-full bg-[var(--surface-sunken)] border border-[var(--border-subtle)] mx-auto flex items-center justify-center text-[var(--border-focus)]">
              <Briefcase className="h-6 w-6" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-sm font-bold text-[var(--text-primary)]">
                No active applications yet
              </h3>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                Save a job from your recommendation inbox and track your interview pipeline, or add an offline application directly.
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 pt-2">
              <Link
                to="/inbox"
                className="px-3.5 py-1.5 rounded-md bg-[var(--surface-sunken)] border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-primary)] hover:border-[var(--border-focus)] transition-colors"
              >
                Browse Inbox
              </Link>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(true)}
                className="px-3.5 py-1.5 rounded-md bg-[var(--border-focus)] text-white text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer shadow-xs"
              >
                Add Application
              </button>
            </div>
          </div>
        ) : sortedApplications.length === 0 ? (
          /* Search mismatch */
          <div className="py-12 px-6 text-center space-y-2 max-w-md mx-auto my-auto">
            <p className="text-xs font-semibold text-[var(--text-primary)]">
              No applications match your filter
            </p>
            <p className="text-xs text-[var(--text-muted)]">
              Try adjusting your search query or switching to All Stages.
            </p>
          </div>
        ) : viewMode === "kanban" ? (
          <ApplicationKanban
            applications={sortedApplications}
            jobsMap={jobsMap}
            activeSegment={segment}
            onSelectApplication={(app) => setSelectedApp(app)}
            onStageChange={handleStageChange}
            onAskAI={(job) => askAboutJob(job)}
            onAddApplication={() => setIsAddModalOpen(true)}
          />
        ) : (
          <ApplicationTable
            applications={sortedApplications}
            jobsMap={jobsMap}
            onSelectApplication={(app) => setSelectedApp(app)}
            onStageChange={handleStageChange}
            onAskAI={(job) => askAboutJob(job)}
          />
        )}
      </div>

      {/* Details & Stage History Drawer */}
      <ApplicationDetailsDrawer
        application={selectedApp}
        job={selectedApp ? jobsMap.get(selectedApp.job_posting_id) || null : null}
        isOpen={selectedApp !== null}
        onClose={() => setSelectedApp(null)}
        onUpdate={async (updates) => {
          if (selectedApp) {
            await updateMutation.mutateAsync({ appId: selectedApp.id, updates });
          }
        }}
        onDelete={
          selectedApp
            ? async () => {
                await deleteMutation.mutateAsync(selectedApp.id);
              }
            : undefined
        }
        isUpdating={updateMutation.isPending}
      />

      {/* Manual Application Creation Modal */}
      <AddApplicationModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSubmit={async (data) => {
          await createMutation.mutateAsync(data);
        }}
        isLoading={createMutation.isPending}
      />
    </div>
  );
}
