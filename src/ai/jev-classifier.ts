import { UnifiedJobPosting } from "../types/job-posting";
import { SearchProfile, loadSearchProfile } from "../config/search-profile";

export interface JevFitDecision {
  fit: boolean;
  confidence: number;
  reason: string;
  model: string;
  latencyMs: number;
  inputSnapshotHash?: string;
}

export interface FitClassifier {
  classify(posting: UnifiedJobPosting, profile?: SearchProfile): Promise<JevFitDecision>;
}

/**
 * Creates the normalized, concise payload sent to JEV.
 * Raw web boilerplate is excluded to maintain consistent confidence scores.
 */
export function buildJevInputPayload(posting: UnifiedJobPosting, profile: SearchProfile) {
  const candidate = profile.candidate;

  return {
    candidateSummary: {
      targetTitles: candidate.targetTitles,
      skills: candidate.skills,
      requiresSponsorship: candidate.requiresSponsorship,
    },
    jobPosting: {
      title: posting.title,
      company: posting.company,
      location: posting.location || "unknown",
      workplaceType: posting.workplace_type,
      seniority: posting.seniority,
      compensation: posting.salary_min_annual
        ? `$${posting.salary_min_annual.toLocaleString()} - $${(posting.salary_max_annual || posting.salary_min_annual).toLocaleString()} ${posting.currency}`
        : "unknown / unstated",
      detectedTechnologies: posting.crawler_data?.detected_technologies || [],
      // Clean description summary (truncated to avoid noise)
      descriptionSummary: posting.description_text.slice(0, 1500),
    },
    question: "Is this job a good fit for this candidate based on their profile, skills, and search criteria?",
  };
}

/**
 * Simulation / Fallback Classifier for local testing and offline operation
 * when TypeSafe AI signups are paused or API credentials are not set.
 */
export class SimulatedJevClassifier implements FitClassifier {
  async classify(posting: UnifiedJobPosting, profile?: SearchProfile): Promise<JevFitDecision> {
    const startTime = Date.now();
    const activeProfile = profile || loadSearchProfile();
    const candidateSkills = new Set(activeProfile.candidate.skills.map((s) => s.toLowerCase()));

    const detectedTech = (posting.crawler_data?.detected_technologies || []).map((t) => t.toLowerCase());
    const matchedSkills = detectedTech.filter((t) => candidateSkills.has(t));

    const titleLower = posting.title.toLowerCase();
    const titleMatches = activeProfile.candidate.targetTitles.some((t) =>
      titleLower.includes(t.toLowerCase())
    );

    // Calculate simulated confidence
    let baseConfidence = 0.50;

    // Tech overlap adds confidence
    if (matchedSkills.length >= 3) {
      baseConfidence += 0.25;
    } else if (matchedSkills.length >= 1) {
      baseConfidence += 0.15;
    }

    // Target title alignment adds confidence
    if (titleMatches) {
      baseConfidence += 0.15;
    }

    // Workplace alignment
    if (posting.workplace_type === "remote" || posting.workplace_type === "hybrid") {
      baseConfidence += 0.05;
    }

    // Missing salary slightly affects confidence as unknown
    if (!posting.salary_min_annual) {
      baseConfidence -= 0.05;
    }

    const confidence = Math.min(0.98, Math.max(0.20, Number(baseConfidence.toFixed(2))));
    const fit = confidence >= 0.65;

    const latencyMs = Date.now() - startTime;

    return {
      fit,
      confidence,
      reason: fit
        ? `Strong candidate alignment on skills (${matchedSkills.slice(0, 4).join(", ") || "software engineering"}) and title relevance.`
        : `Moderate overlap; missing key preferred skills or title divergence.`,
      model: "jev-simulated-system-1",
      latencyMs,
    };
  }
}

/**
 * Live TypeSafe AI (JEV) Classifier
 * Makes real HTTP call to TypeSafe AI if API key is provided,
 * falling back gracefully to SimulatedJevClassifier if unavailable or during platform pause.
 */
export class TypeSafeJevClassifier implements FitClassifier {
  private fallback: SimulatedJevClassifier = new SimulatedJevClassifier();
  private apiKey: string | undefined;
  private endpoint: string;

  constructor() {
    this.apiKey = process.env.TYPESAFE_API_KEY;
    this.endpoint = process.env.TYPESAFE_API_ENDPOINT || "https://api.typesafe.ai/v1/noul";
  }

  async classify(posting: UnifiedJobPosting, profile?: SearchProfile): Promise<JevFitDecision> {
    const activeProfile = profile || loadSearchProfile();

    if (!this.apiKey) {
      // Graceful fallback during platform signup pause
      return this.fallback.classify(posting, activeProfile);
    }

    const startTime = Date.now();
    const payload = buildJevInputPayload(posting, activeProfile);

    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: activeProfile.jevScreening.model || "jev-system-1",
          question: payload.question,
          context: payload,
          format: "boolean_confidence",
        }),
      });

      if (!response.ok) {
        console.warn(`[TypeSafe JEV] API returned ${response.status}, falling back to simulator`);
        return this.fallback.classify(posting, activeProfile);
      }

      const data: any = await response.json();
      const latencyMs = Date.now() - startTime;

      return {
        fit: Boolean(data.result ?? data.fit),
        confidence: Number(data.confidence ?? 0.8),
        reason: data.reason || "Evaluated via TypeSafe AI JEV noul",
        model: data.model || "jev-system-1",
        latencyMs,
      };
    } catch (err) {
      console.warn("[TypeSafe JEV] Request error, falling back to simulator:", err);
      return this.fallback.classify(posting, activeProfile);
    }
  }
}

export const jevClassifier = new TypeSafeJevClassifier();
