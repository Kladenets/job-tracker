import { ApplicationStatus } from "../../types/job-posting";

export interface ApplicationStageDefinition {
  id: ApplicationStatus;
  label: string;
  badgeColor: string;
}

export const APPLICATION_STAGE_DEFINITIONS: ApplicationStageDefinition[] = [
  { id: "preparing", label: "Preparing", badgeColor: "bg-slate-400" },
  { id: "applied", label: "Applied", badgeColor: "bg-blue-500" },
  { id: "recruiter_screen", label: "Recruiter Screen", badgeColor: "bg-amber-500" },
  { id: "interviewing", label: "Interviewing", badgeColor: "bg-purple-500" },
  { id: "assessment", label: "Assessment", badgeColor: "bg-indigo-500" },
  { id: "offer", label: "Offer", badgeColor: "bg-emerald-500" },
  { id: "accepted", label: "Accepted", badgeColor: "bg-teal-500" },
  { id: "rejected", label: "Rejected", badgeColor: "bg-rose-500" },
  { id: "withdrawn", label: "Withdrawn", badgeColor: "bg-zinc-500" },
  { id: "inactive", label: "Inactive", badgeColor: "bg-neutral-500" },
];

export const ARCHIVED_APPLICATION_STATUSES: ReadonlySet<ApplicationStatus> = new Set([
  "accepted",
  "rejected",
  "withdrawn",
  "inactive",
]);

export function isApplicationInSegment(
  status: ApplicationStatus,
  segment: "active" | "archived" | "all"
): boolean {
  if (segment === "all") return true;
  const isArchived = ARCHIVED_APPLICATION_STATUSES.has(status);
  return segment === "archived" ? isArchived : !isArchived;
}