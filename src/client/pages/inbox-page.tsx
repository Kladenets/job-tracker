import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { StickyFilterBar } from "../components/sticky-filter-bar";
import { JobCard } from "../components/job-card";
import { InboxCardSkeleton } from "../components/inbox-card-skeleton";
import { InboxEmptyState } from "../components/inbox-empty-state";
import { CardErrorBoundary } from "../components/card-error-boundary";
import { FilterPopover, FilterCriteria } from "../components/filter-popover";
import { useAIDockStore } from "../shell/ai-dock-store";
import { useShellStore } from "../shell/shell-store";
import { UnifiedJobPosting } from "../../types/job-posting";
import { filterInboxJobs, InboxSegment, InboxSort, sortInboxJobs } from "../inbox-filtering";
import { CheckCircle2, RotateCcw, AlertCircle, Sparkles } from "lucide-react";

interface ToastNotification {
  id: string;
  type: "success" | "info" | "undo";
  message: string;
  undoAction?: () => void;
}

export function InboxPage() {
  const queryClient = useQueryClient();
  const routeSearch = useSearch({ from: "/inbox" });
  const navigate = useNavigate({ from: "/inbox" });
  const { askAboutJob } = useAIDockStore();
  const { userRole } = useShellStore();
  const isGuest = userRole === "guest";

  // Filter & Search State
  const [search, setSearch] = useState(routeSearch.q);
  const [debouncedSearch, setDebouncedSearch] = useState(routeSearch.q);
  const segment = routeSearch.segment;
  const sort = routeSearch.sort;
  const [focusedIndex, setFocusedIndex] = useState<number>(0);
  const [isFilterPopoverOpen, setIsFilterPopoverOpen] = useState(false);
  const [toast, setToast] = useState<ToastNotification | null>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Advanced Filter Criteria
  const filterCriteria: FilterCriteria = {
    workplaceType: routeSearch.workplaceType,
    source: routeSearch.source,
    missingSalary: routeSearch.missingSalary,
    missingLocation: routeSearch.missingLocation,
  };

  // History stack for undo (Cmd+Z)
  const [triageHistory, setTriageHistory] = useState<
    Array<{ job: UnifiedJobPosting; prevStatus: string }>
  >([]);

  // Keep the draft field in sync with browser back/forward and shared links.
  useEffect(() => {
    setSearch(routeSearch.q);
    setDebouncedSearch(routeSearch.q);
  }, [routeSearch.q]);

  // 200ms debounce on search and replace, avoiding one history entry per keystroke.
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
      if (search !== routeSearch.q) {
        navigate({ search: (previous) => ({ ...previous, q: search }), replace: true });
      }
    }, 200);
    return () => clearTimeout(handler);
  }, [search, routeSearch.q, navigate]);

  const updateSearch = useCallback((updates: Partial<typeof routeSearch>, replace = false) => {
    navigate({ search: (previous) => ({ ...previous, ...updates }), replace });
  }, [navigate]);

  const handleFilterCriteriaChange = useCallback((criteria: FilterCriteria) => {
    updateSearch({
      workplaceType: criteria.workplaceType,
      source: criteria.source,
      missingSalary: criteria.missingSalary,
      missingLocation: criteria.missingLocation,
    });
  }, [updateSearch]);

  // Fetch jobs from server API
  const {
    data: jobsData,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<{ count: number; postings: UnifiedJobPosting[] }>({
    queryKey: ["jobs"],
    queryFn: async () => {
      const res = await fetch("/api/jobs?limit=150");
      if (!res.ok) {
        throw new Error(`Failed to load jobs: HTTP ${res.status}`);
      }
      return res.json();
    },
  });

  const allJobs: UnifiedJobPosting[] = useMemo(() => {
    return jobsData?.postings || [];
  }, [jobsData]);

  // Extract available source adapters dynamically
  const availableSources = useMemo(() => {
    const set = new Set<string>();
    for (const j of allJobs) {
      if (j.source) set.add(j.source);
    }
    return Array.from(set);
  }, [allJobs]);

  // Active filter count for badge
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filterCriteria.workplaceType !== "all") count++;
    if (filterCriteria.source !== "all") count++;
    if (filterCriteria.missingSalary) count++;
    if (filterCriteria.missingLocation) count++;
    return count;
  }, [filterCriteria]);

  // Filter & Sort Logic
  const filteredJobs = useMemo(
    () => filterInboxJobs(allJobs, segment as InboxSegment, debouncedSearch, filterCriteria),
    [allJobs, segment, debouncedSearch, filterCriteria.workplaceType, filterCriteria.source, filterCriteria.missingSalary, filterCriteria.missingLocation]
  );

  // Sort logic
  const sortedJobs = useMemo(() => sortInboxJobs(filteredJobs, sort as InboxSort), [filteredJobs, sort]);

  // Clamped focused index
  useEffect(() => {
    if (focusedIndex >= sortedJobs.length && sortedJobs.length > 0) {
      setFocusedIndex(sortedJobs.length - 1);
    }
  }, [sortedJobs.length, focusedIndex]);

  // Show Toast
  const showToast = useCallback((toastData: ToastNotification) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToast(toastData);
    toastTimeoutRef.current = setTimeout(() => {
      setToast(null);
    }, 4500);
  }, []);

  // Update status mutation (Optimistic UI update)
  const statusMutation = useMutation({
    mutationFn: async ({
      jobId,
      status,
      reason,
    }: {
      jobId: string;
      status: string;
      reason?: string;
    }) => {
      const res = await fetch(`/api/jobs/${jobId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, reason }),
      });
      if (!res.ok) throw new Error("Failed to update status");
      return res.json();
    },
    onMutate: async ({ jobId, status }) => {
      await queryClient.cancelQueries({ queryKey: ["jobs"] });
      const prevData = queryClient.getQueryData<{ count: number; postings: UnifiedJobPosting[] }>([
        "jobs",
      ]);

      if (prevData) {
        queryClient.setQueryData(["jobs"], {
          ...prevData,
          postings: prevData.postings.map((p) =>
            p.id === jobId ? { ...p, job_status: status as any } : p
          ),
        });
      }
      return { prevData };
    },
    onError: (_err, _vars, context) => {
      if (context?.prevData) {
        queryClient.setQueryData(["jobs"], context.prevData);
      }
      showToast({
        id: `err-${Date.now()}`,
        type: "info",
        message: "Failed to update job status on server.",
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
    },
  });

  // Background Sync Mutation
  const syncMutation = useMutation({
    mutationFn: async () => {
      // Trigger greenhouse crawl ingestion
      const res = await fetch("/api/ingest/greenhouse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ board: "gitlab" }),
      });
      if (!res.ok) throw new Error("Sync failed");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      const processed = data.totalProcessed ?? 0;
      const imported = data.newImported ?? 0;
      showToast({
        id: `sync-${Date.now()}`,
        type: "success",
        message: `Sync complete: ${processed} jobs evaluated, ${imported} new postings added.`,
      });
    },
    onError: () => {
      showToast({
        id: `sync-err-${Date.now()}`,
        type: "info",
        message: "Source crawl completed with warnings or rate limits.",
      });
    },
  });

  // Triage Handlers
  const handleSave = useCallback(
    (job: UnifiedJobPosting) => {
      if (isGuest) {
        showToast({
          id: `guest-${Date.now()}`,
          type: "info",
          message: "Demo mode: Actions are view-only.",
        });
        return;
      }
      const prevStatus = job.job_status;
      setTriageHistory((prev) => [{ job, prevStatus }, ...prev.slice(0, 19)]);
      const newStatus = job.job_status === "saved" ? "discovered" : "saved";
      statusMutation.mutate({
        jobId: job.id,
        status: newStatus,
        reason: "User toggled bookmark in inbox",
      });
      showToast({
        id: `save-${Date.now()}`,
        type: "success",
        message: newStatus === "saved" ? `Saved "${job.title}" to bookmarks` : `Removed "${job.title}" from saved`,
        undoAction: () => {
          statusMutation.mutate({ jobId: job.id, status: prevStatus });
        },
      });
    },
    [isGuest, statusMutation, showToast]
  );

  const handleDismiss = useCallback(
    (job: UnifiedJobPosting) => {
      if (isGuest) {
        showToast({
          id: `guest-${Date.now()}`,
          type: "info",
          message: "Demo mode: Actions are view-only.",
        });
        return;
      }
      const prevStatus = job.job_status;
      setTriageHistory((prev) => [{ job, prevStatus }, ...prev.slice(0, 19)]);
      statusMutation.mutate({
        jobId: job.id,
        status: "dismissed",
        reason: "User dismissed job from queue",
      });
      showToast({
        id: `dismiss-${Date.now()}`,
        type: "undo",
        message: `Dismissed "${job.title}"`,
        undoAction: () => {
          statusMutation.mutate({ jobId: job.id, status: prevStatus });
        },
      });
    },
    [isGuest, statusMutation, showToast]
  );

  const handleRestore = useCallback(
    (job: UnifiedJobPosting) => {
      if (isGuest) {
        showToast({
          id: `guest-${Date.now()}`,
          type: "info",
          message: "Demo mode: Actions are view-only.",
        });
        return;
      }
      statusMutation.mutate({
        jobId: job.id,
        status: "discovered",
        reason: "User restored dismissed job to active queue",
      });
      showToast({
        id: `restore-${Date.now()}`,
        type: "success",
        message: `Restored "${job.title}" to active queue`,
      });
    },
    [isGuest, statusMutation, showToast]
  );

  const handleApply = useCallback(
    (job: UnifiedJobPosting) => {
      const url = job.application_url || job.canonical_url || job.source_url;
      if (url) {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    },
    []
  );

  const handleAskAI = useCallback(
    (job: UnifiedJobPosting) => {
      askAboutJob({
        id: job.id,
        title: job.title,
        company: job.company,
        location: job.location || "Remote US",
        salary: job.raw_salary_text || (job.salary_min_annual ? `$${job.salary_min_annual}` : "Salary unlisted"),
      });
    },
    [askAboutJob]
  );

  // Undo (Cmd+Z)
  const handleUndo = useCallback(() => {
    if (triageHistory.length === 0) return;
    const lastItem = triageHistory[0];
    setTriageHistory((prev) => prev.slice(1));
    statusMutation.mutate({
      jobId: lastItem.job.id,
      status: lastItem.prevStatus,
      reason: "User triggered Undo",
    });
    showToast({
      id: `undo-${Date.now()}`,
      type: "info",
      message: `Restored "${lastItem.job.title}" to previous state`,
    });
  }, [triageHistory, statusMutation, showToast]);

  // Keyboard Triage Ergonomics: j/k navigation, s save, x dismiss, a apply, c AI, Cmd+Z undo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }

      // Cmd+Z or Ctrl+Z Undo
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        handleUndo();
        return;
      }

      // Active focused job
      const currentJob = sortedJobs[focusedIndex];

      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedIndex((prev) => Math.min(prev + 1, sortedJobs.length - 1));
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedIndex((prev) => Math.max(prev - 1, 0));
      } else if (currentJob) {
        if (e.key === "s") {
          e.preventDefault();
          handleSave(currentJob);
        } else if (e.key === "x") {
          e.preventDefault();
          handleDismiss(currentJob);
        } else if (e.key === "a") {
          e.preventDefault();
          handleApply(currentJob);
        } else if (e.key === "c") {
          e.preventDefault();
          handleAskAI(currentJob);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [sortedJobs, focusedIndex, handleSave, handleDismiss, handleApply, handleAskAI, handleUndo]);

  // Determine which empty state to display if list is empty
  const emptyStateType = useMemo(() => {
    if (allJobs.length === 0) return "empty_database";
    if (segment === "all" && !debouncedSearch && activeFilterCount === 0) return "inbox_zero";
    return "filter_mismatch";
  }, [allJobs.length, segment, debouncedSearch, activeFilterCount]);

  const handleResetFilters = () => {
    setSearch("");
    setDebouncedSearch("");
    updateSearch({
      q: "",
      segment: "all",
      sort: "fit_desc",
      workplaceType: "all",
      source: "all",
      missingSalary: false,
      missingLocation: false,
    });
  };

  return (
    <div className="flex-1 flex flex-col min-h-full relative">
      {/* 1. Standard In-Page Sticky Filter Bar */}
      <div className="relative">
        <StickyFilterBar
          itemCount={sortedJobs.length}
          totalCount={allJobs.length}
          searchValue={search}
          onSearchChange={setSearch}
          activeSegment={segment}
          onSegmentChange={(value) => updateSearch({ segment: value as InboxSegment })}
          segments={[
            { id: "all", label: "All Active" },
            { id: "recommended", label: "High Fit (≥70%)" },
            { id: "marginal", label: "Marginal" },
            { id: "saved", label: "Saved" },
            { id: "dismissed", label: "Dismissed" },
          ]}
          sortValue={sort}
          onSortChange={(value) => updateSearch({ sort: value as InboxSort })}
          sortOptions={[
            { id: "fit_desc", label: "Highest Fit" },
            { id: "date_desc", label: "Newest Discovered" },
            { id: "salary_desc", label: "Salary" },
          ]}
          filterCount={activeFilterCount}
          onToggleFilters={() => setIsFilterPopoverOpen(!isFilterPopoverOpen)}
          onSync={() => syncMutation.mutate()}
          isSyncing={syncMutation.isPending}
        />

        {/* Filter Popover */}
        <FilterPopover
          isOpen={isFilterPopoverOpen}
          criteria={filterCriteria}
          onChange={handleFilterCriteriaChange}
          availableSources={availableSources}
          onClose={() => setIsFilterPopoverOpen(false)}
          onReset={() => {
            handleFilterCriteriaChange({
              workplaceType: "all",
              source: "all",
              missingSalary: false,
              missingLocation: false,
            });
          }}
        />
      </div>

      {/* 2. Main Center Workspace Feed */}
      <div className="p-3 md:p-6 max-w-5xl mx-auto w-full space-y-3.5 flex-1">
        {/* Header Title with Active Feed telemetry */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-2 border-b border-[var(--border-subtle)]">
          <div>
            <h1 className="text-lg md:text-xl font-bold tracking-tight">Recommendation Inbox</h1>
            <p className="text-xs text-[var(--text-secondary)]">
              Curated postings discovered across ATS boards and aggregators, filtered by candidate profile.
            </p>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            {triageHistory.length > 0 && (
              <button
                type="button"
                onClick={handleUndo}
                title="Undo last action (Cmd+Z)"
                className="text-xs font-semibold px-2 py-0.5 md:py-1 rounded bg-[var(--surface-sunken)] border border-[var(--border-subtle)] hover:bg-[var(--surface-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="h-3 w-3" />
                <span>Undo</span>
                <kbd className="text-[9px] font-mono-tabular opacity-70">⌘Z</kbd>
              </button>
            )}
            <span className="text-xs font-mono-tabular px-2 py-0.5 md:py-1 rounded bg-[var(--surface-sunken)] border border-[var(--border-subtle)] text-[var(--text-secondary)]">
              {allJobs.length} Ingested
            </span>
          </div>
        </div>

        {/* Loading Skeletons */}
        {isLoading && (
          <div className="space-y-3" data-testid="inbox-loading-skeletons">
            {Array.from({ length: 4 }).map((_, idx) => (
              <InboxCardSkeleton key={idx} />
            ))}
          </div>
        )}

        {/* Error Fallback */}
        {isError && (
          <div className="rounded-lg border border-[var(--status-danger-fg)]/30 bg-[var(--status-danger-bg)]/20 p-6 text-center space-y-2">
            <AlertCircle className="h-6 w-6 text-[var(--status-danger-fg)] mx-auto" />
            <h3 className="text-sm font-bold text-[var(--status-danger-fg)]">
              Failed to load recommendations
            </h3>
            <p className="text-xs text-[var(--text-muted)]">
              {error instanceof Error ? error.message : "Network error"}
            </p>
            <button
              type="button"
              onClick={() => refetch()}
              className="px-3 py-1.5 rounded-md bg-[var(--border-focus)] text-white text-xs font-semibold cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}

        {/* Loaded Cards Queue */}
        {!isLoading && !isError && sortedJobs.length > 0 && (
          <div className="space-y-3" role="feed" aria-label="Job recommendations queue">
            {sortedJobs.map((job, index) => (
              <CardErrorBoundary key={job.id} jobId={job.id} fallbackTitle={job.title}>
                <JobCard
                  job={job}
                  isFocused={index === focusedIndex}
                  onSave={handleSave}
                  onDismiss={handleDismiss}
                  onRestore={handleRestore}
                  onAskAI={handleAskAI}
                  onApply={handleApply}
                  isGuest={isGuest}
                />
              </CardErrorBoundary>
            ))}
          </div>
        )}

        {/* Differentiated Empty States */}
        {!isLoading && !isError && sortedJobs.length === 0 && (
          <InboxEmptyState
            type={emptyStateType}
            onResetFilters={handleResetFilters}
            onTriggerSync={() => syncMutation.mutate()}
            isSyncing={syncMutation.isPending}
          />
        )}
      </div>

      {/* 3. Accessible Toast Notification Banner */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          data-testid="inbox-toast"
          className="fixed bottom-20 md:bottom-5 left-1/2 -translate-x-1/2 z-50 rounded-lg border border-[var(--border-strong)] bg-[var(--surface-overlay)] text-[var(--text-primary)] shadow-xl px-4 py-2.5 flex items-center gap-3 text-xs animate-in fade-in duration-150"
        >
          <div className="flex items-center gap-2">
            {toast.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 text-[var(--status-recommended-fg)]" />
            ) : (
              <Sparkles className="h-4 w-4 text-amber-500" />
            )}
            <span className="font-medium">{toast.message}</span>
          </div>

          {toast.undoAction && (
            <button
              type="button"
              onClick={() => {
                toast.undoAction?.();
                setToast(null);
              }}
              className="px-2 py-0.5 rounded border border-[var(--border-subtle)] bg-[var(--surface-sunken)] hover:bg-[var(--surface-base)] font-bold text-[11px] cursor-pointer ml-1"
            >
              Undo
            </button>
          )}
        </div>
      )}
    </div>
  );
}
