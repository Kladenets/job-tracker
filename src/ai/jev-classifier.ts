import { UnifiedJobPosting } from "../types/job-posting";
import { SearchProfile, getSearchProfile } from "../config/search-profile";
import { getRepository } from "../db";

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
 * Creates the concise state context sent to TypeSafe System One.
 */
export function buildJevInputPayload(posting: UnifiedJobPosting, profile: SearchProfile) {
  const candidate = profile.candidate;

  return {
    candidateProfile: {
      targetTitles: candidate.targetTitles,
      skills: candidate.skills,
      requiresSponsorship: candidate.requiresSponsorship,
      hasSecurityClearance: candidate.hasSecurityClearance,
      targetLocation: profile.discovery.targetLocation,
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
      descriptionSummary: posting.description_text.slice(0, 1500),
    },
  };
}

/**
 * Simulation / Fallback Classifier for local testing and offline operation.
 */
export class SimulatedJevClassifier implements FitClassifier {
  async classify(posting: UnifiedJobPosting, profile?: SearchProfile): Promise<JevFitDecision> {
    const startTime = Date.now();
    const activeProfile = profile || await getSearchProfile(getRepository().repository);
    const candidateSkills = new Set(activeProfile.candidate.skills.map((s) => s.toLowerCase()));

    const detectedTech = (posting.crawler_data?.detected_technologies || []).map((t) => t.toLowerCase());
    const matchedSkills = detectedTech.filter((t) => candidateSkills.has(t));

    const titleLower = posting.title.toLowerCase();
    const titleMatch = activeProfile.candidate.targetTitles.some((t) =>
      titleLower.includes(t.toLowerCase())
    );

    let confidence = 0.5;
    if (titleMatch) confidence += 0.25;
    if (matchedSkills.length > 0) confidence += Math.min(0.25, matchedSkills.length * 0.08);

    confidence = Math.min(0.99, Math.max(0.1, confidence));
    const threshold = activeProfile.jevScreening.minConfidenceRecommend ?? 0.70;
    const fit = confidence >= threshold;

    return {
      fit,
      confidence: Number(confidence.toFixed(2)),
      reason: fit
        ? `Strong candidate alignment on skills (${matchedSkills.join(", ") || "core match"}) and title relevance.`
        : `Insufficient skill/title overlap for screening threshold ${threshold}`,
      model: "jev-simulated-system-1",
      latencyMs: Date.now() - startTime,
    };
  }
}

/**
 * Production TypeSafe AI System One Classifier
 * Evaluates candidate fit via POST /v1/systemone using the native 'noul' probability primitive.
 */
export class TypeSafeJevClassifier implements FitClassifier {
  private fallback = new SimulatedJevClassifier();

  async classify(posting: UnifiedJobPosting, profile?: SearchProfile): Promise<JevFitDecision> {
    const activeProfile = profile || await getSearchProfile(getRepository().repository);
    const apiKey = (process.env.TYPESAFE_API_KEY || process.env.TYPESAFE_AI_API_KEY || "").trim();
    let endpoint = (process.env.TYPESAFE_API_ENDPOINT || "https://api.typesafe.ai/v1/systemone").trim();
    if (endpoint.endsWith("/v1/noul") || endpoint.endsWith("/noul")) {
      endpoint = endpoint.replace(/\/noul$/, "/systemone");
    }

    if (!apiKey) {
      return this.fallback.classify(posting, activeProfile);
    }

    const startTime = Date.now();
    const payload = buildJevInputPayload(posting, activeProfile);
    const model = activeProfile.jevScreening.model === "jev-system-1" ? "jev-latest" : (activeProfile.jevScreening.model || "jev-latest");

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          state: payload,
          questions: {
            is_job_fit: {
              type: "noul",
              instructions: "Is this job posting a strong qualification and career fit for this candidate based on their skills, target roles, and location preferences?",
            },
          },
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.warn(`[TypeSafe JEV] API returned ${response.status}: ${errText}, falling back to simulator`);
        return this.fallback.classify(posting, activeProfile);
      }

      const data: any = await response.json();
      const latencyMs = Date.now() - startTime;
      const noulProbability = Number(data.answers?.is_job_fit?.noul ?? 0.5);
      const threshold = activeProfile.jevScreening.minConfidenceRecommend || 0.70;
      const fit = noulProbability >= threshold;

      return {
        fit,
        confidence: Number(noulProbability.toFixed(2)),
        reason: fit
          ? `Qualified with ${(noulProbability * 100).toFixed(0)}% JEV confidence score (meets >= ${(threshold * 100).toFixed(0)}% threshold).`
          : `Marginal fit with ${(noulProbability * 100).toFixed(0)}% JEV confidence score (below ${(threshold * 100).toFixed(0)}% threshold).`,
        model: data.model || model,
        latencyMs,
      };
    } catch (err) {
      console.warn("[TypeSafe JEV] Network error, falling back to simulator:", err);
      return this.fallback.classify(posting, activeProfile);
    }
  }
}

export const jevClassifier = new TypeSafeJevClassifier();
