import React, { useState, useEffect } from "react";
import {
  User,
  Mail,
  Briefcase,
  Award,
  MapPin,
  Globe,
  FileText,
  Plus,
  X,
  Check,
  Save,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Upload,
  Link as LinkIcon,
  AlertTriangle,
  Building,
  Calendar,
  Code2,
  FolderGit2,
  GraduationCap,
  ExternalLink,
} from "lucide-react";
import { StructuredResume, ResumeSource } from "../../types/resume";

export interface CandidateProfile {
  fullName: string;
  email: string;
  targetTitle: string;
  skills: string[];
  yearsExperience: number;
  location?: string;
  remotePreference?: string;
  resumeSource?: ResumeSource;
  additionalExperience?: string;
  notes?: string;
}

interface CandidateProfileEditorProps {
  initialProfile: CandidateProfile;
  initialResumeData?: StructuredResume;
  onSave: (profile: CandidateProfile) => Promise<void>;
  isSaving: boolean;
  onDirtyChange?: (isDirty: boolean) => void;
  onSyncResume?: (url?: string) => Promise<{ profile: CandidateProfile; resumeData: StructuredResume }>;
  onUploadResume?: (content: string, fileName: string) => Promise<{ profile: CandidateProfile; resumeData: StructuredResume }>;
}

export function CandidateProfileEditor({
  initialProfile,
  initialResumeData,
  onSave,
  isSaving,
  onDirtyChange,
  onSyncResume,
  onUploadResume,
}: CandidateProfileEditorProps) {
  const [profile, setProfile] = useState<CandidateProfile>(initialProfile);
  const [resumeData, setResumeData] = useState<StructuredResume | undefined>(initialResumeData);
  const [skillInput, setSkillInput] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Resume Drawer expansion state
  const [isResumeExpanded, setIsResumeExpanded] = useState(false);
  const [showRawJson, setShowRawJson] = useState(false);

  // Source edit modal state
  const [isSourceModalOpen, setIsSourceModalOpen] = useState(false);
  const [pendingSourceType, setPendingSourceType] = useState<"remote_url" | "file_upload">(
    profile.resumeSource?.type || "remote_url"
  );
  const [pendingUrl, setPendingUrl] = useState(profile.resumeSource?.url || "");
  const [pendingFileContent, setPendingFileContent] = useState<string>("");
  const [pendingFileName, setPendingFileName] = useState<string>("");
  const [showSwitchWarning, setShowSwitchWarning] = useState(false);

  // Syncing & Uploading spinners
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  // Synchronize initial props
  useEffect(() => {
    setProfile(initialProfile);
  }, [initialProfile]);

  useEffect(() => {
    if (initialResumeData) {
      setResumeData(initialResumeData);
    }
  }, [initialResumeData]);

  // Form dirty state check
  const isDirty = JSON.stringify(profile) !== JSON.stringify(initialProfile);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const activeSourceType = profile.resumeSource?.type || "remote_url";

  const handleAddSkill = (skill: string) => {
    const trimmed = skill.trim();
    if (!trimmed) return;
    if (!profile.skills.some((s) => s.toLowerCase() === trimmed.toLowerCase())) {
      setProfile((prev) => ({
        ...prev,
        skills: [...prev.skills, trimmed],
      }));
    }
    setSkillInput("");
  };

  const handleRemoveSkill = (skillToRemove: string) => {
    setProfile((prev) => ({
      ...prev,
      skills: prev.skills.filter((s) => s !== skillToRemove),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSave(profile);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  // Trigger manual remote sync
  const handleTriggerSync = async () => {
    if (!onSyncResume || isSyncing) return;
    setIsSyncing(true);
    setSyncStatus(null);
    try {
      const targetUrl = profile.resumeSource?.url;
      const result = await onSyncResume(targetUrl);
      setProfile(result.profile);
      setResumeData(result.resumeData);
      setSyncStatus({ type: "success", msg: "Resume synchronized successfully from remote source." });
      setTimeout(() => setSyncStatus(null), 4000);
    } catch (err: unknown) {
      setSyncStatus({
        type: "error",
        msg: err instanceof Error ? err.message : "Sync failed. Check source URL.",
      });
      setTimeout(() => setSyncStatus(null), 6000);
    } finally {
      setIsSyncing(false);
    }
  };

  // Open Source Modal
  const handleOpenSourceModal = () => {
    setPendingSourceType(profile.resumeSource?.type || "remote_url");
    setPendingUrl(profile.resumeSource?.url || "");
    setPendingFileContent("");
    setPendingFileName("");
    setShowSwitchWarning(false);
    setIsSourceModalOpen(true);
  };

  // Check if switching source type
  const handleSelectSourceType = (newType: "remote_url" | "file_upload") => {
    if (newType !== (profile.resumeSource?.type || "remote_url")) {
      setShowSwitchWarning(true);
    } else {
      setShowSwitchWarning(false);
    }
    setPendingSourceType(newType);
  };

  // Handle local file read
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setPendingFileContent(content);
    };
    reader.readAsText(file);
  };

  // Confirm Source Update
  const handleConfirmSourceChange = async () => {
    if (pendingSourceType === "remote_url") {
      const cleanUrl = pendingUrl.trim();
      const updatedProfile: CandidateProfile = {
        ...profile,
        resumeSource: {
          type: "remote_url",
          url: cleanUrl,
          lastSyncedAt: profile.resumeSource?.url === cleanUrl ? profile.resumeSource.lastSyncedAt : undefined,
        },
      };
      setProfile(updatedProfile);
      setIsSourceModalOpen(false);
      // Immediately persist new source
      await onSave(updatedProfile);

      // Offer immediate sync with the newly configured URL
      if (onSyncResume && cleanUrl) {
        setIsSyncing(true);
        setSyncStatus(null);
        try {
          const res = await onSyncResume(cleanUrl);
          setProfile(res.profile);
          setResumeData(res.resumeData);
          setSyncStatus({ type: "success", msg: "Resume synchronized successfully from remote source." });
          setTimeout(() => setSyncStatus(null), 4000);
        } catch (err: unknown) {
          setSyncStatus({
            type: "error",
            msg: err instanceof Error ? err.message : "Sync failed. Check source URL.",
          });
          setTimeout(() => setSyncStatus(null), 6000);
        } finally {
          setIsSyncing(false);
        }
      }
    } else {
      // File upload mode
      setIsSourceModalOpen(false);
      if (pendingFileContent && onUploadResume) {
        setIsSyncing(true);
        setSyncStatus(null);
        try {
          const res = await onUploadResume(pendingFileContent, pendingFileName || "resume.json");
          setProfile(res.profile);
          setResumeData(res.resumeData);
          setSyncStatus({ type: "success", msg: "Resume uploaded and parsed successfully." });
          setTimeout(() => setSyncStatus(null), 4000);
        } catch (err: unknown) {
          setSyncStatus({
            type: "error",
            msg: err instanceof Error ? err.message : "Upload failed.",
          });
          setTimeout(() => setSyncStatus(null), 6000);
        } finally {
          setIsSyncing(false);
        }
      }
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Top Action Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-[var(--border-subtle)]">
        <div>
          <h2 className="text-sm font-bold text-[var(--text-primary)]">
            Candidate Profile & Structured Resume
          </h2>
          <p className="text-xs text-[var(--text-secondary)]">
            Primary context utilized by the deterministic filter and Gemini for scoring and cover letters.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isDirty && (
            <span className="text-[11px] font-mono-tabular text-[var(--status-marginal-fg)] bg-[var(--status-marginal-bg)] px-2 py-0.5 rounded border border-[var(--status-marginal-fg)]/20">
              Unsaved changes
            </span>
          )}
          {saveSuccess && (
            <span className="text-[11px] font-mono-tabular text-[var(--status-recommended-fg)] bg-[var(--status-recommended-bg)] px-2 py-0.5 rounded border border-[var(--status-recommended-fg)]/20 flex items-center gap-1">
              <Check className="h-3 w-3" />
              Saved
            </span>
          )}
          <button
            type="submit"
            disabled={isSaving || !isDirty}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[var(--border-focus)] text-white text-xs font-semibold hover:opacity-90 transition-opacity disabled:opacity-40 cursor-pointer shadow-xs"
          >
            <Save className="h-3.5 w-3.5" />
            <span>{isSaving ? "Saving..." : "Save Profile"}</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 1. RESUME SOURCE BAR (page-setup.md section 1.1)                          */}
      {/* ========================================================================= */}
      <div className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="h-8 w-8 rounded-lg bg-[var(--surface-sunken)] border border-[var(--border-subtle)] flex items-center justify-center shrink-0 text-[var(--border-focus)]">
            {activeSourceType === "remote_url" ? <Globe className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-[var(--text-primary)]">
                {activeSourceType === "remote_url" ? "Remote Resume Source" : "Local Resume File"}
              </span>
              <span className="text-[10px] font-mono-tabular px-1.5 py-0.5 rounded bg-[var(--surface-sunken)] border border-[var(--border-subtle)] text-[var(--text-secondary)]">
                {activeSourceType === "remote_url" ? "HTTP / JSON Gist" : "Uploaded File"}
              </span>
            </div>
            <p className="text-[11px] font-mono text-[var(--text-secondary)] truncate max-w-sm sm:max-w-md">
              {activeSourceType === "remote_url"
                ? profile.resumeSource?.url || "No source URL configured"
                : profile.resumeSource?.fileName || "Uploaded document"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Last Synced Timestamp */}
          {profile.resumeSource?.lastSyncedAt && (
            <span className="text-[11px] font-mono-tabular text-[var(--text-muted)] hidden md:inline">
              Last synced: {new Date(profile.resumeSource.lastSyncedAt).toLocaleDateString()}{" "}
              {new Date(profile.resumeSource.lastSyncedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}

          {/* Sync Button: STRICTLY CONDITIONAL ON remote_url */}
          {activeSourceType === "remote_url" && (
            <button
              type="button"
              onClick={handleTriggerSync}
              disabled={isSyncing || !profile.resumeSource?.url}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-[var(--surface-sunken)] border border-[var(--border-subtle)] text-[var(--text-primary)] text-xs font-semibold hover:bg-[var(--surface-base)] transition-colors cursor-pointer disabled:opacity-50 shadow-xs"
            >
              <RefreshCw className={`h-3 w-3 ${isSyncing ? "animate-spin text-[var(--border-focus)]" : ""}`} />
              <span>{isSyncing ? "Syncing..." : "Sync Resume Now"}</span>
            </button>
          )}

          {/* Change Source Trigger */}
          <button
            type="button"
            onClick={handleOpenSourceModal}
            className="px-2.5 py-1.5 rounded-md border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors cursor-pointer"
          >
            Change Source
          </button>
        </div>
      </div>

      {syncStatus && (
        <div
          className={`text-xs px-3.5 py-2 rounded-lg border font-mono-tabular flex items-center gap-2 animate-in fade-in duration-150 ${
            syncStatus.type === "success"
              ? "bg-[var(--status-recommended-bg)] border-[var(--status-recommended-fg)]/20 text-[var(--status-recommended-fg)]"
              : "bg-[var(--status-danger-bg)] border-[var(--status-danger-fg)]/20 text-[var(--status-danger-fg)]"
          }`}
        >
          {syncStatus.type === "success" ? (
            <Check className="h-4 w-4 shrink-0" />
          ) : (
            <AlertTriangle className="h-4 w-4 shrink-0" />
          )}
          <span>{syncStatus.msg}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. TWO-TIER BOUNDED RESUME VISUALIZER (JOB CARD PATTERN)                  */}
      {/* ========================================================================= */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] overflow-hidden shadow-xs">
        {/* Tier 1: Collapsed Scan Row (~72px) */}
        <div className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 rounded-full bg-[var(--surface-sunken)] border border-[var(--border-subtle)] flex items-center justify-center shrink-0 font-bold text-xs text-[var(--text-primary)]">
              {profile.fullName.charAt(0) || "C"}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-[var(--text-primary)]">{profile.fullName}</span>
                <span className="text-[11px] text-[var(--text-muted)]">·</span>
                <span className="text-xs text-[var(--text-secondary)]">{profile.targetTitle}</span>
                <span className="text-[11px] text-[var(--text-muted)]">·</span>
                <span className="text-xs font-mono-tabular font-semibold text-[var(--status-recommended-fg)]">
                  {profile.yearsExperience} yrs exp
                </span>
              </div>
              <div className="text-[11px] text-[var(--text-muted)] truncate max-w-md pt-0.5">
                {profile.skills.slice(0, 6).join(" · ")}
                {profile.skills.length > 6 ? ` · +${profile.skills.length - 6} more` : ""}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsResumeExpanded(!isResumeExpanded)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-sunken)] hover:bg-[var(--surface-base)] text-xs font-medium text-[var(--text-primary)] transition-colors cursor-pointer self-start sm:self-auto shrink-0"
          >
            <span>{isResumeExpanded ? "Collapse Resume" : "View Structured Resume"}</span>
            {isResumeExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </div>

        {/* Tier 2: Expanded In-Depth Drawer (Bounded Height max-h-96 with internal scroll) */}
        {isResumeExpanded && (
          <div className="border-t border-[var(--border-subtle)] bg-[var(--surface-sunken)] p-4 sm:p-5 max-h-96 overflow-y-auto space-y-5">
            <div className="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)]">
              <span className="text-xs font-bold text-[var(--text-primary)]">
                Structured Work Experience ({resumeData?.work?.length || 0} roles)
              </span>
              <button
                type="button"
                onClick={() => setShowRawJson(!showRawJson)}
                className="text-[11px] text-[var(--border-focus)] hover:underline flex items-center gap-1 cursor-pointer font-mono"
              >
                <Code2 className="h-3 w-3" />
                <span>{showRawJson ? "Hide Raw JSON" : "Inspect Raw JSON"}</span>
              </button>
            </div>

            {/* Raw JSON View */}
            {showRawJson ? (
              <pre className="p-3 rounded-lg bg-[var(--surface-base)] border border-[var(--border-subtle)] text-[10px] font-mono text-[var(--text-secondary)] overflow-x-auto max-h-64 leading-tight">
                {JSON.stringify(resumeData || profile, null, 2)}
              </pre>
            ) : (
              <div className="space-y-4">
                {/* Work Timeline */}
                {resumeData?.work && resumeData.work.length > 0 ? (
                  <div className="space-y-3">
                    {resumeData.work.map((w, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-lg bg-[var(--surface-elevated)] border border-[var(--border-subtle)] space-y-1.5"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                          <span className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                            <Building className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                            {w.company} — {w.position}
                          </span>
                          <span className="text-[11px] font-mono-tabular text-[var(--text-muted)] flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {w.startDate || "Past"} – {w.endDate || (w.current ? "Present" : "End")}
                          </span>
                        </div>

                        {w.summary && (
                          <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">{w.summary}</p>
                        )}

                        {w.highlights && w.highlights.length > 0 && (
                          <ul className="list-disc list-inside text-[11px] text-[var(--text-secondary)] space-y-1 pl-1">
                            {w.highlights.map((h, hIdx) => (
                              <li key={hIdx}>{h}</li>
                            ))}
                          </ul>
                        )}

                        {w.technologies && w.technologies.length > 0 && (
                          <div className="pt-1 flex flex-wrap items-center gap-1 text-[10px] font-mono text-[var(--text-muted)]">
                            <span>Tech:</span>
                            {w.technologies.map((t) => (
                              <span key={t} className="px-1 py-0.5 rounded bg-[var(--surface-sunken)] border border-[var(--border-subtle)]">
                                {t}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-[var(--text-muted)] italic">No work history parsed yet.</p>
                )}

                {/* Projects Section (JSON Resume Spec) */}
                {resumeData?.projects && resumeData.projects.length > 0 && (
                  <div className="space-y-3 pt-3 border-t border-[var(--border-subtle)]">
                    <span className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                      <FolderGit2 className="h-3.5 w-3.5 text-[var(--border-focus)]" />
                      Projects ({resumeData.projects.length})
                    </span>
                    <div className="space-y-2.5">
                      {resumeData.projects.map((proj, pIdx) => (
                        <div
                          key={pIdx}
                          className="p-3 rounded-lg bg-[var(--surface-elevated)] border border-[var(--border-subtle)] space-y-1.5"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-[var(--text-primary)]">{proj.name}</span>
                              {proj.url && (
                                <a
                                  href={proj.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[10px] text-[var(--border-focus)] hover:underline inline-flex items-center gap-0.5"
                                >
                                  <span>Link</span>
                                  <ExternalLink className="h-2.5 w-2.5" />
                                </a>
                              )}
                            </div>
                            {(proj.startDate || proj.endDate) && (
                              <span className="text-[11px] font-mono-tabular text-[var(--text-muted)]">
                                {proj.startDate || ""} {proj.endDate ? `– ${proj.endDate}` : ""}
                              </span>
                            )}
                          </div>

                          {proj.description && (
                            <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                              {proj.description}
                            </p>
                          )}

                          {proj.highlights && proj.highlights.length > 0 && (
                            <ul className="list-disc list-inside text-[11px] text-[var(--text-secondary)] space-y-1 pl-1">
                              {proj.highlights.map((h, hIdx) => (
                                <li key={hIdx}>{h}</li>
                              ))}
                            </ul>
                          )}

                          {proj.keywords && proj.keywords.length > 0 && (
                            <div className="pt-1 flex flex-wrap items-center gap-1 text-[10px] font-mono text-[var(--text-muted)]">
                              <span>Keywords:</span>
                              {proj.keywords.map((k) => (
                                <span
                                  key={k}
                                  className="px-1 py-0.5 rounded bg-[var(--surface-sunken)] border border-[var(--border-subtle)] text-[var(--text-primary)]"
                                >
                                  {k}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Education Section (JSON Resume Spec) */}
                {resumeData?.education && resumeData.education.length > 0 && (
                  <div className="space-y-2 pt-3 border-t border-[var(--border-subtle)]">
                    <span className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                      <GraduationCap className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                      Education
                    </span>
                    <div className="space-y-2">
                      {resumeData.education.map((edu, eIdx) => (
                        <div
                          key={eIdx}
                          className="p-2.5 rounded-lg bg-[var(--surface-elevated)] border border-[var(--border-subtle)] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 text-xs"
                        >
                          <div>
                            <span className="font-bold text-[var(--text-primary)]">{edu.institution}</span>
                            <span className="text-[var(--text-muted)]"> · </span>
                            <span className="text-[var(--text-secondary)]">
                              {edu.studyType ? `${edu.studyType} in ` : ""}
                              {edu.area || "Degree"}
                            </span>
                          </div>
                          {(edu.startDate || edu.endDate) && (
                            <span className="text-[11px] font-mono-tabular text-[var(--text-muted)]">
                              {edu.startDate || ""} {edu.endDate ? `– ${edu.endDate}` : ""}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Categorized Skills */}
                {resumeData?.skills && resumeData.skills.length > 0 && (
                  <div className="space-y-2 pt-3 border-t border-[var(--border-subtle)]">
                    <span className="text-xs font-bold text-[var(--text-primary)]">Parsed Skill Groups</span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      {resumeData.skills.map((grp, gIdx) => (
                        <div key={gIdx} className="p-2 rounded bg-[var(--surface-elevated)] border border-[var(--border-subtle)]">
                          <span className="text-[11px] font-semibold text-[var(--text-primary)] block pb-1">
                            {grp.name}
                          </span>
                          <p className="text-[10px] font-mono text-[var(--text-secondary)]">
                            {grp.keywords.join(", ")}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 3. ADDITIONAL EXPERIENCE & CONTEXT (UNSTRUCTURED FIELD)                   */}
      {/* ========================================================================= */}
      <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] space-y-2 shadow-xs">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5 text-[var(--text-muted)]" />
            Additional Experience & Unstructured Context
          </label>
          <span className="text-[11px] font-mono-tabular text-[var(--text-muted)]">
            {(profile.additionalExperience || "").length} characters
          </span>
        </div>
        <textarea
          rows={3}
          value={profile.additionalExperience || ""}
          onChange={(e) => setProfile({ ...profile, additionalExperience: e.target.value })}
          placeholder="Add any recent side projects, confidential systems, upcoming certifications, or context not yet on your official resume. The AI agent will incorporate this into fit scoring, interview prep, and cover letters..."
          className="w-full p-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-base)] text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--border-focus)] transition-colors leading-relaxed"
        />
        <p className="text-[11px] text-[var(--text-secondary)]">
          Free-form notes here are appended to the candidate profile and evaluated by Gemini during deep match reviews.
        </p>
      </div>

      {/* ========================================================================= */}
      {/* 4. PRIMARY QUALIFICATIONS & SKILLS INPUTS                                 */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {/* Full Name */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
            <User className="h-3.5 w-3.5 text-[var(--text-muted)]" />
            Full Name
          </label>
          <input
            type="text"
            required
            value={profile.fullName}
            onChange={(e) => setProfile({ ...profile, fullName: e.target.value })}
            className="w-full h-8.5 px-2.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-focus)]"
          />
        </div>

        {/* Email */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
            <Mail className="h-3.5 w-3.5 text-[var(--text-muted)]" />
            Email Address
          </label>
          <input
            type="email"
            required
            value={profile.email}
            onChange={(e) => setProfile({ ...profile, email: e.target.value })}
            className="w-full h-8.5 px-2.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-focus)]"
          />
        </div>

        {/* Target Title */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
            <Briefcase className="h-3.5 w-3.5 text-[var(--text-muted)]" />
            Target Role Title
          </label>
          <input
            type="text"
            required
            value={profile.targetTitle}
            onChange={(e) => setProfile({ ...profile, targetTitle: e.target.value })}
            className="w-full h-8.5 px-2.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-focus)]"
          />
        </div>

        {/* Years of Experience */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
            <Award className="h-3.5 w-3.5 text-[var(--text-muted)]" />
            Years of Experience
          </label>
          <input
            type="number"
            min={0}
            max={40}
            required
            value={profile.yearsExperience}
            onChange={(e) => setProfile({ ...profile, yearsExperience: parseInt(e.target.value || "0", 10) })}
            className="w-full h-8.5 px-2.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-xs font-mono-tabular text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-focus)]"
          />
        </div>

        {/* Location */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 text-[var(--text-muted)]" />
            Home Location / Perimeter
          </label>
          <input
            type="text"
            value={profile.location || ""}
            onChange={(e) => setProfile({ ...profile, location: e.target.value })}
            className="w-full h-8.5 px-2.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-focus)]"
          />
        </div>

        {/* Workplace Preference */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
            <Globe className="h-3.5 w-3.5 text-[var(--text-muted)]" />
            Workplace Preference
          </label>
          <select
            value={profile.remotePreference || "remote_or_hybrid"}
            onChange={(e) => setProfile({ ...profile, remotePreference: e.target.value })}
            className="w-full h-8.5 px-2 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-focus)]"
          >
            <option value="remote_only">Remote Only</option>
            <option value="remote_or_hybrid">Remote or Hybrid</option>
            <option value="hybrid_only">Hybrid Preferred</option>
            <option value="any">Open to Any (Remote, Hybrid, Onsite)</option>
          </select>
        </div>
      </div>

      {/* Core Technical Skills Tag Manager */}
      <div className="space-y-2.5 p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)]">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-[var(--text-primary)]">
            Core Technical Skills ({profile.skills.length})
          </label>
          <span className="text-[11px] text-[var(--text-muted)]">
            Derived from resume or added manually
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 min-h-8">
          {profile.skills.map((skill) => (
            <span
              key={skill}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--surface-sunken)] border border-[var(--border-subtle)] text-xs font-mono-tabular text-[var(--text-primary)]"
            >
              <span>{skill}</span>
              <button
                type="button"
                onClick={() => handleRemoveSkill(skill)}
                className="text-[var(--text-muted)] hover:text-[var(--status-danger-fg)] cursor-pointer"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}

          <div className="inline-flex items-center gap-1">
            <input
              type="text"
              value={skillInput}
              onChange={(e) => setSkillInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  handleAddSkill(skillInput);
                }
              }}
              placeholder="Add skill..."
              className="h-6 px-2 rounded border border-[var(--border-subtle)] bg-[var(--surface-base)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-focus)] w-28"
            />
            {skillInput.trim() && (
              <button
                type="button"
                onClick={() => handleAddSkill(skillInput)}
                className="p-1 rounded bg-[var(--border-focus)] text-white hover:opacity-90 cursor-pointer"
              >
                <Plus className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 5. SOURCE SWITCH MODAL & CONFIRMATION POPUP                                */}
      {/* ========================================================================= */}
      {isSourceModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
        >
          <div className="w-full max-w-md p-5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] space-y-4 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)]">
              <h3 className="text-sm font-bold text-[var(--text-primary)]">
                Configure Resume Source
              </h3>
              <button
                type="button"
                onClick={() => setIsSourceModalOpen(false)}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Source Type Selector */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() => handleSelectSourceType("remote_url")}
                className={`p-3 rounded-lg border text-left flex items-start gap-2.5 cursor-pointer transition-colors ${
                  pendingSourceType === "remote_url"
                    ? "border-[var(--border-focus)] bg-[var(--surface-sunken)]"
                    : "border-[var(--border-subtle)] bg-[var(--surface-base)] opacity-75"
                }`}
              >
                <LinkIcon className="h-4 w-4 text-[var(--border-focus)] shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-[var(--text-primary)] block">Remote URL</span>
                  <span className="text-[11px] text-[var(--text-secondary)]">
                    GitHub Gist or live JSON endpoint
                  </span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleSelectSourceType("file_upload")}
                className={`p-3 rounded-lg border text-left flex items-start gap-2.5 cursor-pointer transition-colors ${
                  pendingSourceType === "file_upload"
                    ? "border-[var(--border-focus)] bg-[var(--surface-sunken)]"
                    : "border-[var(--border-subtle)] bg-[var(--surface-base)] opacity-75"
                }`}
              >
                <Upload className="h-4 w-4 text-purple-500 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-[var(--text-primary)] block">Upload File</span>
                  <span className="text-[11px] text-[var(--text-secondary)]">
                    .json, .pdf, or .md document
                  </span>
                </div>
              </button>
            </div>

            {/* Confirmation Warning if Changing Source Mode */}
            {showSwitchWarning && (
              <div className="p-3 rounded-lg bg-[var(--status-marginal-bg)] border border-[var(--status-marginal-fg)]/20 text-xs flex items-start gap-2.5 text-[var(--status-marginal-fg)]">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <span className="font-bold block">Switching Resume Source Mode</span>
                  <p className="text-[11px] leading-relaxed">
                    Switching between Remote URL and File Upload will replace your active source configuration.
                    Are you sure you want to proceed?
                  </p>
                </div>
              </div>
            )}

            {/* Input according to selected type */}
            {pendingSourceType === "remote_url" ? (
              <div className="space-y-1.5 text-xs">
                <label className="font-semibold text-[var(--text-primary)]">
                  Public Resume URL
                </label>
                <input
                  type="url"
                  required
                  value={pendingUrl}
                  onChange={(e) => setPendingUrl(e.target.value)}
                  placeholder="https://gist.githubusercontent.com/.../raw/resume.json"
                  className="w-full h-8.5 px-2.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] text-xs font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-focus)]"
                />
                <span className="text-[11px] text-[var(--text-muted)] block">
                  Example: GitHub Gist raw JSON link or personal site URL.
                </span>
              </div>
            ) : (
              <div className="space-y-2 text-xs">
                <label className="font-semibold text-[var(--text-primary)]">
                  Select Local Resume Document
                </label>
                <input
                  type="file"
                  accept=".json,.txt,.md,.pdf"
                  onChange={handleFileChange}
                  className="w-full text-xs text-[var(--text-secondary)] file:mr-3 file:py-1 file:px-2.5 file:rounded-md file:border file:border-[var(--border-subtle)] file:bg-[var(--surface-sunken)] file:text-xs file:font-semibold file:cursor-pointer"
                />
                {pendingFileName && (
                  <p className="text-[11px] font-mono text-[var(--text-primary)]">
                    Selected: {pendingFileName}
                  </p>
                )}
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
              <button
                type="button"
                onClick={() => setIsSourceModalOpen(false)}
                className="px-3 py-1.5 rounded-md border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmSourceChange}
                disabled={pendingSourceType === "remote_url" ? !pendingUrl.trim() : !pendingFileContent}
                className="px-4 py-1.5 rounded-md bg-[var(--border-focus)] text-white text-xs font-semibold hover:opacity-90 transition-opacity disabled:opacity-40 cursor-pointer shadow-xs"
              >
                Confirm Source
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}
