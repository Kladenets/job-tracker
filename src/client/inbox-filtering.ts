import { UnifiedJobPosting } from "../types/job-posting";

export type InboxSegment = "all" | "recommended" | "marginal" | "saved" | "dismissed" | "hidden";
export type InboxSort = "fit_desc" | "date_desc" | "salary_desc";

export interface InboxFilterCriteria {
  workplaceType: "all" | "remote" | "hybrid" | "onsite";
  source: string;
  missingSalary: boolean;
  missingLocation: boolean;
}

export function getJobFitScore(job: UnifiedJobPosting): number | null {
  const score = job.ai_analysis?.overall_fit_score;
  return typeof score === "number" && Number.isFinite(score) ? score : null;
}

export function filterInboxJobs(
  jobs: readonly UnifiedJobPosting[],
  segment: InboxSegment,
  query: string,
  criteria: InboxFilterCriteria
): UnifiedJobPosting[] {
  const term = query.trim().toLowerCase();

  return jobs.filter((job) => {
    const isHidden = job.job_status === "dismissed" || job.job_status === "filtered_out";
    const score = getJobFitScore(job);

    if (segment === "recommended" && (isHidden || score === null || score < 70)) return false;
    if (segment === "marginal" && (isHidden || score === null || score < 40 || score >= 70)) return false;
    if (segment === "saved" && job.job_status !== "saved" && job.job_status !== "reviewing") return false;
    if (segment === "dismissed" && job.job_status !== "dismissed") return false;
    if (segment === "hidden" && !isHidden) return false;
    if (segment === "all" && isHidden) return false;

    if (term) {
      const searchable = [
        job.title,
        job.company,
        job.location || "",
        ...(job.crawler_data?.detected_technologies || []),
      ].join(" ").toLowerCase();
      if (!searchable.includes(term)) return false;
    }

    if (criteria.workplaceType !== "all" && job.workplace_type !== criteria.workplaceType) return false;
    if (criteria.source !== "all" && job.source !== criteria.source) return false;
    if (criteria.missingSalary && job.salary_min_annual == null && job.salary_max_annual == null) return false;
    if (criteria.missingLocation && !job.location?.trim()) return false;
    return true;
  });
}

export function sortInboxJobs(jobs: readonly UnifiedJobPosting[], sort: InboxSort): UnifiedJobPosting[] {
  return [...jobs].sort((left, right) => {
    if (sort === "fit_desc") {
      const leftScore = getJobFitScore(left);
      const rightScore = getJobFitScore(right);
      if (leftScore === null) return rightScore === null ? 0 : 1;
      if (rightScore === null) return -1;
      return rightScore - leftScore;
    }

    if (sort === "date_desc") {
      return new Date(right.date_posted || right.date_discovered).getTime() -
        new Date(left.date_posted || left.date_discovered).getTime();
    }

    const leftSalary = left.salary_max_annual ?? left.salary_min_annual;
    const rightSalary = right.salary_max_annual ?? right.salary_min_annual;
    if (leftSalary == null) return rightSalary == null ? 0 : 1;
    if (rightSalary == null) return -1;
    return rightSalary - leftSalary;
  });
}