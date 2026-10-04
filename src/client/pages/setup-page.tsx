import React, { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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

export function SetupPage() {
  const queryClient = useQueryClient();
  const { userRole } = useShellStore();
  const isGuest = userRole === "guest";

  const [activeTab, setActiveTab] = useState<string>("profile");
  const [isProfileDirty, setIsProfileDirty] = useState(false);
  const [isRulesDirty, setIsRulesDirty] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  }, []);

  // Unsaved changes beforeunload warning
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isProfileDirty || isRulesDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isProfileDirty, isRulesDirty]);

  // 1. Fetch Candidate Profile & Structured Resume
  const {
    data: candidateData,
    isLoading: isProfileLoading,
    error: profileError,
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
    error: searchError,
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
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-[var(--border-focus)] text-white text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer shadow-xs"
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
            ) : null}
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
            ) : searchData?.profile ? (
              <SearchProfileEditor
                initialProfile={searchData.profile}
                onSave={async (r) => {
                  await saveSearchMutation.mutateAsync(r);
                }}
                isSaving={saveSearchMutation.isPending}
                onDirtyChange={setIsRulesDirty}
              />
            ) : null}
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
    </div>
  );
}
