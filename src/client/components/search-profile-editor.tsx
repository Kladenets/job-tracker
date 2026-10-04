import React, { useState, useEffect } from "react";
import { Filter, DollarSign, MapPin, Building, ShieldX, Check, Save, Plus, X } from "lucide-react";

export interface SearchProfile {
  id: string;
  name: string;
  isActive: boolean;
  candidate: {
    targetTitles: string[];
    skills: string[];
    requiresSponsorship?: boolean;
    hasSecurityClearance?: boolean;
  };
  discovery: {
    searchTerms: string[];
    targetLocation: {
      city: string;
      state: string;
      zip?: string;
      radiusMiles: number;
      bufferMiles?: number;
    };
  };
  deterministicFilterRules: {
    workplace: {
      allowedTypes: string[];
      maxOnsiteDaysPerWeek?: number;
      commuteRadiusMiles?: number;
      commuteBufferMiles?: number;
      allowMissingWorkplace?: boolean;
    };
    compensation: {
      minSalaryAnnual: number;
      tolerancePercentage?: number;
      allowMissingSalary?: boolean;
    };
    postingAge?: {
      maxAgeDays: number;
    };
    seniority?: {
      excludedLevels: string[];
    };
    title: {
      excludedTitleKeywords: string[];
    };
    companies: {
      excludedCompanies: string[];
    };
    workAuthorization?: {
      excludeUsCitizenshipOnly?: boolean;
      excludeRequiresActiveClearance?: boolean;
    };
  };
  jevScreening: {
    enabled: boolean;
    model: string;
    minConfidenceRecommend: number;
  };
}

interface SearchProfileEditorProps {
  initialProfile: SearchProfile;
  onSave: (updated: SearchProfile) => Promise<void>;
  isSaving: boolean;
  onDirtyChange?: (isDirty: boolean) => void;
}

export function SearchProfileEditor({
  initialProfile,
  onSave,
  isSaving,
  onDirtyChange,
}: SearchProfileEditorProps) {
  const [profile, setProfile] = useState<SearchProfile>(initialProfile);
  const [newTitle, setNewTitle] = useState("");
  const [newExcludedKeyword, setNewExcludedKeyword] = useState("");
  const [newExcludedCompany, setNewExcludedCompany] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    setProfile(initialProfile);
  }, [initialProfile]);

  const isDirty = JSON.stringify(profile) !== JSON.stringify(initialProfile);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const handleAddTitle = () => {
    const trimmed = newTitle.trim();
    if (!trimmed) return;
    if (!profile.candidate.targetTitles.includes(trimmed)) {
      setProfile((prev) => ({
        ...prev,
        candidate: {
          ...prev.candidate,
          targetTitles: [...prev.candidate.targetTitles, trimmed],
        },
      }));
    }
    setNewTitle("");
  };

  const handleRemoveTitle = (t: string) => {
    setProfile((prev) => ({
      ...prev,
      candidate: {
        ...prev.candidate,
        targetTitles: prev.candidate.targetTitles.filter((item) => item !== t),
      },
    }));
  };

  const handleAddExcludedKeyword = () => {
    const trimmed = newExcludedKeyword.trim();
    if (!trimmed) return;
    if (!profile.deterministicFilterRules.title.excludedTitleKeywords.includes(trimmed.toLowerCase())) {
      setProfile((prev) => ({
        ...prev,
        deterministicFilterRules: {
          ...prev.deterministicFilterRules,
          title: {
            ...prev.deterministicFilterRules.title,
            excludedTitleKeywords: [
              ...prev.deterministicFilterRules.title.excludedTitleKeywords,
              trimmed.toLowerCase(),
            ],
          },
        },
      }));
    }
    setNewExcludedKeyword("");
  };

  const handleRemoveExcludedKeyword = (kw: string) => {
    setProfile((prev) => ({
      ...prev,
      deterministicFilterRules: {
        ...prev.deterministicFilterRules,
        title: {
          ...prev.deterministicFilterRules.title,
          excludedTitleKeywords: prev.deterministicFilterRules.title.excludedTitleKeywords.filter(
            (item) => item !== kw
          ),
        },
      },
    }));
  };

  const handleAddExcludedCompany = () => {
    const trimmed = newExcludedCompany.trim();
    if (!trimmed) return;
    if (!profile.deterministicFilterRules.companies.excludedCompanies.includes(trimmed)) {
      setProfile((prev) => ({
        ...prev,
        deterministicFilterRules: {
          ...prev.deterministicFilterRules,
          companies: {
            ...prev.deterministicFilterRules.companies,
            excludedCompanies: [
              ...prev.deterministicFilterRules.companies.excludedCompanies,
              trimmed,
            ],
          },
        },
      }));
    }
    setNewExcludedCompany("");
  };

  const handleRemoveExcludedCompany = (c: string) => {
    setProfile((prev) => ({
      ...prev,
      deterministicFilterRules: {
        ...prev.deterministicFilterRules,
        companies: {
          ...prev.deterministicFilterRules.companies,
          excludedCompanies: prev.deterministicFilterRules.companies.excludedCompanies.filter(
            (item) => item !== c
          ),
        },
      },
    }));
  };

  const toggleWorkplaceType = (type: string) => {
    const current = profile.deterministicFilterRules.workplace.allowedTypes;
    const exists = current.includes(type);
    const updated = exists ? current.filter((t) => t !== type) : [...current, type];
    setProfile((prev) => ({
      ...prev,
      deterministicFilterRules: {
        ...prev.deterministicFilterRules,
        workplace: {
          ...prev.deterministicFilterRules.workplace,
          allowedTypes: updated,
        },
      },
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSave(profile);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-[var(--border-subtle)]">
        <div>
          <h2 className="text-sm font-bold text-[var(--text-primary)]">
            Deterministic Filtering Rules & Thresholds
          </h2>
          <p className="text-xs text-[var(--text-secondary)]">
            Hard boundaries evaluated on every scraped job before advancing to JEV qualification scoring.
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
              Rules Saved
            </span>
          )}
          <button
            type="submit"
            disabled={isSaving || !isDirty}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[var(--border-focus)] text-white text-xs font-semibold hover:opacity-90 transition-opacity disabled:opacity-40 cursor-pointer shadow-xs"
          >
            <Save className="h-3.5 w-3.5" />
            <span>{isSaving ? "Saving..." : "Save Rules"}</span>
          </button>
        </div>
      </div>

      {/* Target Titles & Aliases */}
      <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] space-y-2.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-[var(--text-primary)]">
            Target Job Titles & Aliases ({profile.candidate.targetTitles.length})
          </label>
          <span className="text-[11px] text-[var(--text-muted)]">
            Matches crawl titles against these role classifications
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {profile.candidate.targetTitles.map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--surface-sunken)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)]"
            >
              <span>{t}</span>
              <button
                type="button"
                onClick={() => handleRemoveTitle(t)}
                className="text-[var(--text-muted)] hover:text-[var(--status-danger-fg)] cursor-pointer"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}

          <div className="inline-flex items-center gap-1">
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddTitle();
                }
              }}
              placeholder="Add title alias..."
              className="h-6 px-2 rounded border border-[var(--border-subtle)] bg-[var(--surface-base)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-focus)] w-36"
            />
            {newTitle.trim() && (
              <button
                type="button"
                onClick={handleAddTitle}
                className="p-1 rounded bg-[var(--border-focus)] text-white hover:opacity-90 cursor-pointer"
              >
                <Plus className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Row 2: Workplace, Compensation, Location */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Workplace Type Preferences */}
        <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] space-y-3">
          <label className="text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
            <Filter className="h-3.5 w-3.5 text-[var(--text-muted)]" />
            Allowed Workplace Types
          </label>
          <div className="space-y-2 text-xs">
            {["remote", "hybrid", "onsite", "unknown"].map((type) => {
              const checked = profile.deterministicFilterRules.workplace.allowedTypes.includes(type);
              return (
                <label key={type} className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleWorkplaceType(type)}
                    className="rounded border-[var(--border-subtle)] text-[var(--border-focus)] focus:ring-0"
                  />
                  <span className="capitalize text-[var(--text-primary)] font-medium">
                    {type === "unknown" ? "Unspecified / Flexible" : type}
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        {/* Compensation Floor */}
        <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] space-y-3">
          <label className="text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
            <DollarSign className="h-3.5 w-3.5 text-[var(--text-muted)]" />
            Minimum Annual Salary Floor
          </label>
          <div className="space-y-2 text-xs">
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] font-mono-tabular">
                $
              </span>
              <input
                type="number"
                step={5000}
                min={0}
                value={profile.deterministicFilterRules.compensation.minSalaryAnnual}
                onChange={(e) =>
                  setProfile({
                    ...profile,
                    deterministicFilterRules: {
                      ...profile.deterministicFilterRules,
                      compensation: {
                        ...profile.deterministicFilterRules.compensation,
                        minSalaryAnnual: parseInt(e.target.value || "0", 10),
                      },
                    },
                  })
                }
                className="w-full h-8.5 pl-6 pr-2 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] text-xs font-mono-tabular text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-focus)]"
              />
            </div>
            <label className="flex items-center gap-2 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={profile.deterministicFilterRules.compensation.allowMissingSalary ?? true}
                onChange={(e) =>
                  setProfile({
                    ...profile,
                    deterministicFilterRules: {
                      ...profile.deterministicFilterRules,
                      compensation: {
                        ...profile.deterministicFilterRules.compensation,
                        allowMissingSalary: e.target.checked,
                      },
                    },
                  })
                }
                className="rounded border-[var(--border-subtle)] text-[var(--border-focus)] focus:ring-0"
              />
              <span className="text-[11px] text-[var(--text-secondary)]">
                Allow postings with undisclosed salary
              </span>
            </label>
          </div>
        </div>

        {/* Geographic Bounds */}
        <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] space-y-3">
          <label className="text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 text-[var(--text-muted)]" />
            Commute & Geo Perimeter
          </label>
          <div className="space-y-2 text-xs font-mono-tabular">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={profile.discovery.targetLocation.city}
                onChange={(e) =>
                  setProfile({
                    ...profile,
                    discovery: {
                      ...profile.discovery,
                      targetLocation: { ...profile.discovery.targetLocation, city: e.target.value },
                    },
                  })
                }
                placeholder="City"
                className="flex-1 h-8 px-2 rounded border border-[var(--border-subtle)] bg-[var(--surface-base)] text-xs text-[var(--text-primary)]"
              />
              <input
                type="text"
                value={profile.discovery.targetLocation.state}
                onChange={(e) =>
                  setProfile({
                    ...profile,
                    discovery: {
                      ...profile.discovery,
                      targetLocation: { ...profile.discovery.targetLocation, state: e.target.value },
                    },
                  })
                }
                placeholder="State"
                className="w-16 h-8 px-2 rounded border border-[var(--border-subtle)] bg-[var(--surface-base)] text-xs text-[var(--text-primary)]"
              />
            </div>
            <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)]">
              <span>Max Commute Radius:</span>
              <span className="font-semibold text-[var(--text-primary)]">
                {profile.discovery.targetLocation.radiusMiles} miles
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Row 3: Hard Excluded Keywords & Excluded Companies */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Excluded Title Keywords */}
        <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] space-y-2.5">
          <label className="text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
            <ShieldX className="h-3.5 w-3.5 text-[var(--status-danger-fg)]" />
            Hard Excluded Title Keywords ({profile.deterministicFilterRules.title.excludedTitleKeywords.length})
          </label>
          <p className="text-[11px] text-[var(--text-muted)]">
            Postings containing any of these keywords in the title are immediately rejected.
          </p>

          <div className="flex flex-wrap items-center gap-1.5 max-h-36 overflow-y-auto">
            {profile.deterministicFilterRules.title.excludedTitleKeywords.map((kw) => (
              <span
                key={kw}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[var(--status-danger-bg)] text-[var(--status-danger-fg)] border border-[var(--status-danger-fg)]/20 text-[11px] font-mono-tabular"
              >
                <span>{kw}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveExcludedKeyword(kw)}
                  className="hover:opacity-75 cursor-pointer"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            ))}
          </div>

          <div className="flex items-center gap-1 pt-1">
            <input
              type="text"
              value={newExcludedKeyword}
              onChange={(e) => setNewExcludedKeyword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddExcludedKeyword();
                }
              }}
              placeholder="e.g. clearance required, unpaid..."
              className="flex-1 h-7 px-2 rounded border border-[var(--border-subtle)] bg-[var(--surface-base)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-focus)]"
            />
            <button
              type="button"
              onClick={handleAddExcludedKeyword}
              className="px-2 py-1 rounded bg-[var(--surface-sunken)] border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-elevated)] cursor-pointer"
            >
              Add
            </button>
          </div>
        </div>

        {/* Excluded Companies */}
        <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] space-y-2.5">
          <label className="text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
            <Building className="h-3.5 w-3.5 text-[var(--status-danger-fg)]" />
            Excluded Companies & Staffing Agencies ({profile.deterministicFilterRules.companies.excludedCompanies.length})
          </label>
          <p className="text-[11px] text-[var(--text-muted)]">
            Postings from these agencies or employers are filtered out automatically.
          </p>

          <div className="flex flex-wrap items-center gap-1.5 max-h-36 overflow-y-auto">
            {profile.deterministicFilterRules.companies.excludedCompanies.map((comp) => (
              <span
                key={comp}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[var(--status-danger-bg)] text-[var(--status-danger-fg)] border border-[var(--status-danger-fg)]/20 text-[11px] font-mono-tabular"
              >
                <span>{comp}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveExcludedCompany(comp)}
                  className="hover:opacity-75 cursor-pointer"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            ))}
          </div>

          <div className="flex items-center gap-1 pt-1">
            <input
              type="text"
              value={newExcludedCompany}
              onChange={(e) => setNewExcludedCompany(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddExcludedCompany();
                }
              }}
              placeholder="e.g. CyberCoders, Revature..."
              className="flex-1 h-7 px-2 rounded border border-[var(--border-subtle)] bg-[var(--surface-base)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-focus)]"
            />
            <button
              type="button"
              onClick={handleAddExcludedCompany}
              className="px-2 py-1 rounded bg-[var(--surface-sunken)] border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-elevated)] cursor-pointer"
            >
              Add
            </button>
          </div>
        </div>
      </div>

      {/* Row 4: JEV Qualification Threshold */}
      <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="text-xs font-bold text-[var(--text-primary)]">
            JEV Recommendation Confidence Threshold
          </h3>
          <p className="text-[11px] text-[var(--text-secondary)]">
            Jobs scoring equal to or above this percentage qualify as "High Fit" recommendations in the inbox.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <input
            type="range"
            min={0.50}
            max={0.95}
            step={0.05}
            value={profile.jevScreening.minConfidenceRecommend}
            onChange={(e) =>
              setProfile({
                ...profile,
                jevScreening: {
                  ...profile.jevScreening,
                  minConfidenceRecommend: parseFloat(e.target.value),
                },
              })
            }
            className="w-32 accent-[var(--border-focus)]"
          />
          <span className="text-xs font-bold font-mono-tabular px-2.5 py-1 rounded bg-[var(--status-recommended-bg)] text-[var(--status-recommended-fg)] border border-[var(--status-recommended-fg)]/20 min-w-14 text-center">
            {Math.round(profile.jevScreening.minConfidenceRecommend * 100)}%
          </span>
        </div>
      </div>
    </form>
  );
}
