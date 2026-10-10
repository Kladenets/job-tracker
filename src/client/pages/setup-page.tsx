import React, { useState, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useBlocker } from "@tanstack/react-router";
import { StickyFilterBar } from "../components/sticky-filter-bar";
import { CandidateProfileEditor, CandidateProfile } from "../components/candidate-profile-editor";
import { SearchProfileEditor, SearchProfile } from "../components/search-profile-editor";
import { DiscoveryRunsPanel } from "../components/discovery-runs-panel";
import { SystemHealthPanel } from "../components/system-health-panel";
import { useShellStore } from "../shell/shell-store";
import {
  ShieldAlert,
  Inbox,
  User,
  SlidersHorizontal,
  Compass,
  Activity,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useDialogFocus } from "../hooks/use-dialog-focus";

export function SetupPage() {
  const queryClient = useQueryClient();
  const { userRole } = useShellStore();
  const isGuest = userRole === "guest";

  const [activeTab, setActiveTab] = useState<string>("profile");
  const [isProfileDirty, setIsProfileDirty] = useState(false);
  const [isRulesDirty, setIsRulesDirty] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const hasUnsavedChanges = isProfileDirty || isRulesDirty;
  const blockerDialogRef = useRef<HTMLDivElement>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  }, []);

  const navigationBlocker = useBlocker({
    shouldBlockFn: ({ current, next }) => hasUnsavedChanges && current.pathname !== next.pathname,
    withResolver: true,
    enableBeforeUnload: hasUnsavedChanges,
  });
  useDialogFocus(blockerDialogRef, {
    enabled: navigationBlocker.status === "blocked",
    onClose: navigationBlocker.reset,
    initialFocusSelector: '[data-blocker-stay="true"]',
  });

  // 1. Fetch Candidate Profile & Structured Resume
  const {
    data: candidateData,
    isLoading: isProfileLoading,
    isError: isProfileError,
    error: profileError,
    refetch: refetchProfile,
  } = useQuery<{ success: boolean; profile: CandidateProfile; resumeData?: any }>({
    queryKey: ["candidate-profile"],
    queryFn: async () => {
      const res = await fetch("/api/candidate-profile");
      if (!res.ok) {
        if (res.status === 403) throw new Error("GUEST_RESTRICTED");
        throw new Error(`Failed to load profile: HTTP ${res.status}`);
      }
      return res.json();
    },
    enabled: !isGuest,
  });

  // Resume Sync Handler (Remote Source)
  const handleSyncResume = async (url?: string) => {
    const res = await fetch("/api/candidate-profile/sync-resume", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || "Failed to sync resume");
    }
    queryClient.invalidateQueries({ queryKey: ["candidate-profile"] });
    showToast("Resume synchronized from remote source");
    return { profile: data.profile, resumeData: data.resumeData };
  };

  // Resume Upload Handler (Local Document)
  const handleUploadResume = async (content: string, fileName: string) => {
    const res = await fetch("/api/candidate-profile/upload-resume", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, fileName }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || "Failed to upload resume");
    }
    queryClient.invalidateQueries({ queryKey: ["candidate-profile"] });
    showToast("Resume uploaded and parsed successfully");
    return { profile: data.profile, resumeData: data.resumeData };
  };

  // 2. Fetch Search Profile
  const {
    data: searchData,
    isLoading: isSearchLoading,
    isError: isSearchError,
    error: searchError,
    refetch: refetchSearch,
  } = useQuery<{ success: boolean; profile: SearchProfile }>({
    queryKey: ["search-profile"],
    queryFn: async () => {
      const res = await fetch("/api/search-profile");
      if (!res.ok) {
        if (res.status === 403) throw new Error("GUEST_RESTRICTED");
        throw new Error(`Failed to load search profile: HTTP ${res.status}`);
      }
      return res.json();
    },
    enabled: !isGuest,
  });

  // 3. Save Candidate Profile Mutation
  const saveCandidateMutation = useMutation({
    mutationFn: async (updated: CandidateProfile) => {
      const res = await fetch("/api/candidate-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated),
      });
      if (!res.ok) throw new Error("Failed to save candidate profile");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["candidate-profile"] });
      setIsProfileDirty(false);
      showToast("Candidate qualifications saved successfully");
    },
    onError: (err: unknown) => {
      showToast(err instanceof Error ? err.message : "Error saving profile");
    },
  });

  // 4. Save Search Profile Mutation
  const saveSearchMutation = useMutation({
    mutationFn: async (updated: SearchProfile) => {
      const res = await fetch("/api/search-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated),
      });
      if (!res.ok) throw new Error("Failed to save search profile");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["search-profile"] });
      setIsRulesDirty(false);
      showToast("Deterministic filtering rules saved successfully");
    },
    onError: (err: unknown) => {
      showToast(err instanceof Error ? err.message : "Error saving rules");
    },
  });

  // Guest Mode Perimeter Check (page-setup.md section 1.6)
  if (isGuest || (profileError as Error)?.message === "GUEST_RESTRICTED" || (searchError as Error)?.message === "GUEST_RESTRICTED") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-lg mx-auto space-y-5 my-auto">
        <div className="h-14 w-14 rounded-2xl bg-[var(--surface-sunken)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--border-focus)] shadow-inner">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <div className="space-y-2">
          <h2 className="text-lg font-bold text-[var(--text-primary)]">
            Setup & Candidate Configuration
          </h2>
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
            Restricted to authenticated candidate workspace to preserve personal applicant privacy. Candidate resume text, bio summary, and crawler credentials are kept strictly confidential.
          </p>
        </div>
        <Link
          to="/inbox"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-[var(--action-primary-bg)] text-white text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer shadow-xs"
        >
          <Inbox className="h-4 w-4" />
          <span>Return to Recommendation Inbox</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-full">
      {/* Toast Alert */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-16 right-4 z-50 flex items-center gap-2 px-3.5 py-2 rounded-md bg-[var(--surface-overlay)] border border-[var(--border-focus)] text-xs text-[var(--text-primary)] shadow-xl animate-in fade-in slide-in-from-top-2 duration-150"
        >
          <CheckCircle2 className="h-4 w-4 text-[var(--status-recommended-fg)] shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Sticky Tab & Navigation Bar */}
      <StickyFilterBar
        showSearch={false}
        activeSegment={activeTab}
        onSegmentChange={setActiveTab}
        segments={[
          { id: "profile", label: "Candidate Profile" },
          { id: "rules", label: "Search & Filtering Rules" },
          { id: "discovery", label: "Discovery Runs & Ingestion" },
          { id: "health", label: "System & AI Health" },
        ]}
      />

      {/* Main Content Area */}
      <div className="p-4 md:p-6 max-w-5xl mx-auto w-full space-y-6 flex-1">
        {/* Tab 1: Candidate Profile Editor */}
        {activeTab === "profile" && (
          <div>
            {isProfileLoading ? (
              <div className="space-y-4 animate-pulse">
                <div className="h-8 w-64 bg-[var(--surface-elevated)] rounded" />
                <div className="grid grid-cols-3 gap-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-14 bg-[var(--surface-elevated)] rounded-md" />
                  ))}
                </div>
                <div className="h-32 bg-[var(--surface-elevated)] rounded-xl" />
              </div>
            ) : isProfileError ? (
              <div role="alert" className="rounded-md border border-[var(--status-danger-fg)]/30 bg-[var(--status-danger-bg)]/20 p-4 space-y-2">
                <p className="text-sm text-[var(--status-danger-fg)]">{profileError instanceof Error ? profileError.message : "Failed to load candidate profile."}</p>
                <button type="button" onClick={() => refetchProfile()} className="text-sm underline">Retry</button>
              </div>
            ) : candidateData?.profile ? (
              <CandidateProfileEditor
                initialProfile={candidateData.profile}
                initialResumeData={candidateData.resumeData}
                onSave={async (p) => {
                  await saveCandidateMutation.mutateAsync(p);
                }}
                isSaving={saveCandidateMutation.isPending}
                onDirtyChange={setIsProfileDirty}
                onSyncResume={handleSyncResume}
                onUploadResume={handleUploadResume}
              />
            ) : <p role="alert" className="text-sm text-[var(--text-secondary)]">No candidate profile was returned.</p>}
          </div>
        )}

        {/* Tab 2: Search Profile & Deterministic Rules */}
        {activeTab === "rules" && (
          <div>
            {isSearchLoading ? (
              <div className="space-y-4 animate-pulse">
                <div className="h-8 w-64 bg-[var(--surface-elevated)] rounded" />
                <div className="grid grid-cols-3 gap-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-28 bg-[var(--surface-elevated)] rounded-xl" />
                  ))}
                </div>
              </div>
            ) : isSearchError ? (
              <div role="alert" className="rounded-md border border-[var(--status-danger-fg)]/30 bg-[var(--status-danger-bg)]/20 p-4 space-y-2">
                <p className="text-sm text-[var(--status-danger-fg)]">{searchError instanceof Error ? searchError.message : "Failed to load search profile."}</p>
                <button type="button" onClick={() => refetchSearch()} className="text-sm underline">Retry</button>
              </div>
            ) : searchData?.profile ? (
              <SearchProfileEditor
                initialProfile={searchData.profile}
                onSave={async (r) => {
                  await saveSearchMutation.mutateAsync(r);
                }}
                isSaving={saveSearchMutation.isPending}
                onDirtyChange={setIsRulesDirty}
              />
            ) : <p role="alert" className="text-sm text-[var(--text-secondary)]">No search profile was returned.</p>}
          </div>
        )}

        {/* Tab 3: Discovery Runs & Ingestion */}
        {activeTab === "discovery" && (
          <DiscoveryRunsPanel
            onIngestUrlSuccess={() => {
              showToast("Job parsed and evaluated successfully");
            }}
            onDiscoveryRunSuccess={() => {
              showToast("Discovery pipeline cycle completed");
            }}
          />
        )}

        {/* Tab 4: System & AI Provider Health */}
        {activeTab === "health" && <SystemHealthPanel />}
      </div>

      {navigationBlocker.status === "blocked" && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div ref={blockerDialogRef} role="dialog" aria-modal="true" aria-labelledby="unsaved-setup-title" tabIndex={-1} className="w-full max-w-md rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] p-5 space-y-4 shadow-xl">
            <div className="space-y-1">
              <h2 id="unsaved-setup-title" className="font-semibold text-[var(--text-primary)]">Discard unsaved changes?</h2>
              <p className="text-sm text-[var(--text-secondary)]">Your candidate profile or search rules have unsaved edits.</p>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" data-blocker-stay="true" onClick={navigationBlocker.reset} className="rounded border border-[var(--border-subtle)] px-3 py-2 text-sm">Stay</button>
              <button
                type="button"
                onClick={() => {
                  setIsProfileDirty(false);
                  setIsRulesDirty(false);
                  navigationBlocker.proceed();
                }}
                className="rounded bg-[var(--status-danger-fg)] px-3 py-2 text-sm font-semibold text-white"
              >
                Discard and leave
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
