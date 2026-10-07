export interface MetricsOptions {
  startDate?: string;
  endDate?: string;
}

export interface MetricsPosting {
  id: string;
  source: string;
  job_status: string;
  jev_fit?: boolean | null;
  date_discovered?: string | Date | null;
  created_at: string | Date;
}

export interface MetricsApplication {
  id: string;
  job_posting_id: string;
  status: string;
  applied_at?: string | Date | null;
  created_at: string | Date;
}

export interface DashboardMetrics {
  dateRange: { startDate: string | null; endDate: string | null };
  funnel: {
    discoveredCount: number;
    filteredOutCount: number;
    recommendedCount: number;
    savedCount: number;
    dismissedCount: number;
  };
  applications: {
    appliedCount: number;
    recruiterScreenCount: number;
    interviewCount: number;
    offerCount: number;
    rejectedCount: number;
    recruiterScreenRate: number;
    interviewRate: number;
    offerRate: number;
    rejectionRate: number;
    isSmallSample: boolean;
    sampleSizeWarning: string | null;
  };
  sources: Record<string, {
    discovered: number;
    recommended: number;
    applied: number;
    callbackCount: number;
    callbackRate: number;
  }>;
}

function timestamp(value: string | Date): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

function inRange(value: string | Date, start: number, end: number): boolean {
  const time = timestamp(value);
  return time >= start && time <= end;
}

export function calculateDashboardMetrics(
  postings: MetricsPosting[],
  applications: MetricsApplication[],
  options?: MetricsOptions
): DashboardMetrics {
  const start = options?.startDate ? timestamp(options.startDate) : 0;
  const end = options?.endDate ? timestamp(options.endDate) : Date.now();
  const filteredPostings = postings.filter((posting) =>
    inRange(posting.date_discovered || posting.created_at, start, end)
  );
  const filteredApplications = applications.filter((application) =>
    inRange(application.applied_at || application.created_at, start, end)
  );
  const submittedApplications = filteredApplications.filter((application) => application.status !== "preparing");

  const discoveredCount = filteredPostings.length;
  const filteredOutCount = filteredPostings.filter((posting) => posting.job_status === "filtered_out").length;
  const recommendedCount = filteredPostings.filter((posting) =>
    posting.job_status === "recommended" || posting.jev_fit === true
  ).length;
  const savedCount = filteredPostings.filter((posting) =>
    posting.job_status === "saved" || posting.job_status === "reviewing"
  ).length;
  const dismissedCount = filteredPostings.filter((posting) => posting.job_status === "dismissed").length;

  const appliedCount = submittedApplications.length;
  const recruiterScreenCount = submittedApplications.filter((application) =>
    ["recruiter_screen", "interviewing", "assessment", "offer", "accepted"].includes(application.status)
  ).length;
  const interviewCount = submittedApplications.filter((application) =>
    ["interviewing", "assessment", "offer", "accepted"].includes(application.status)
  ).length;
  const offerCount = submittedApplications.filter((application) =>
    ["offer", "accepted"].includes(application.status)
  ).length;
  const rejectedCount = submittedApplications.filter((application) => application.status === "rejected").length;
  const rate = (count: number) => appliedCount > 0 ? Math.round((count / appliedCount) * 100) : 0;

  const sources: DashboardMetrics["sources"] = {};
  const ensureSource = (source: string) => {
    sources[source] ??= { discovered: 0, recommended: 0, applied: 0, callbackCount: 0, callbackRate: 0 };
    return sources[source];
  };

  for (const posting of filteredPostings) {
    const source = ensureSource(posting.source);
    source.discovered += 1;
    if (posting.job_status === "recommended" || posting.jev_fit === true) {
      source.recommended += 1;
    }
  }

  const postingsById = new Map(postings.map((posting) => [posting.id, posting]));
  for (const application of submittedApplications) {
    const sourceName = postingsById.get(application.job_posting_id)?.source || "manual";
    const source = ensureSource(sourceName);
    source.applied += 1;
    if (["recruiter_screen", "interviewing", "assessment", "offer", "accepted"].includes(application.status)) {
      source.callbackCount += 1;
    }
  }

  for (const source of Object.values(sources)) {
    source.callbackRate = source.applied > 0
      ? Math.round((source.callbackCount / source.applied) * 100)
      : 0;
  }

  return {
    dateRange: {
      startDate: options?.startDate || null,
      endDate: options?.endDate || null,
    },
    funnel: { discoveredCount, filteredOutCount, recommendedCount, savedCount, dismissedCount },
    applications: {
      appliedCount,
      recruiterScreenCount,
      interviewCount,
      offerCount,
      rejectedCount,
      recruiterScreenRate: rate(recruiterScreenCount),
      interviewRate: rate(interviewCount),
      offerRate: rate(offerCount),
      rejectionRate: rate(rejectedCount),
      isSmallSample: appliedCount < 10,
      sampleSizeWarning: appliedCount < 10 ? "Early signal: N < 10 applications" : null,
    },
    sources,
  };
}