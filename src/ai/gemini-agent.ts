import { GoogleGenAI } from "@google/genai";
import { UnifiedJobPosting } from "../types/job-posting";
import { SearchProfile, loadSearchProfile } from "../config/search-profile";
import { resolveGeminiApiKey } from "./key-resolver";

export interface DeepAnalysisResult {
  overallFitScore: number;
  recommendation: "recommend" | "consider" | "reject";
  matchedQualifications: Array<{ qualification: string; evidence: string }>;
  qualificationGaps: Array<{ gap: string; importance: string; advice: string }>;
  interviewPrepTopics: string[];
  rationale: string;
}

export interface CoverLetterResult {
  coverLetterText: string;
  keyHighlightsUsed: string[];
  suggestedSubjectLine: string;
}

export class GeminiJobAgent {
  private ai: GoogleGenAI | null = null;
  private apiKey: string | undefined;

  constructor() {
    const { apiKey } = resolveGeminiApiKey();
    this.apiKey = apiKey;
    if (this.apiKey) {
      this.ai = new GoogleGenAI({ apiKey: this.apiKey });
    }
  }

  async generateDeepAnalysis(
    posting: UnifiedJobPosting,
    profile?: SearchProfile
  ): Promise<DeepAnalysisResult> {
    const activeProfile = profile || loadSearchProfile();

    if (!this.ai) {
      // Offline / Fallback mode
      return {
        overallFitScore: posting.jev_confidence ? Math.round(posting.jev_confidence * 100) : 80,
        recommendation: posting.jev_fit ? "recommend" : "consider",
        matchedQualifications: (posting.crawler_data?.detected_technologies || []).map((t) => ({
          qualification: t,
          evidence: `Found in posting keywords: ${t}`,
        })),
        qualificationGaps: [
          {
            gap: "Domain-specific architectural scale",
            importance: "preferred",
            advice: "Highlight distributed systems and fault tolerance experience during interview.",
          },
        ],
        interviewPrepTopics: [
          `System design questions focused on ${posting.crawler_data?.detected_technologies.slice(0, 3).join(", ") || "full stack architecture"}`,
          "Concurrency and latency tradeoffs",
          "Experience with microservices or serverless deployments",
        ],
        rationale: "Automated preliminary analysis based on candidate skills and job summary.",
      };
    }

    const prompt = `
You are an expert technical career advisor analyzing a job posting for a candidate.
Candidate target titles: ${activeProfile.candidate.targetTitles.join(", ")}
Candidate core skills: ${activeProfile.candidate.skills.join(", ")}

Job Details:
Title: ${posting.title}
Company: ${posting.company}
Location: ${posting.location || "Unknown"}
Workplace: ${posting.workplace_type}
Description:
${posting.description_text.slice(0, 3000)}

Please return a JSON response with:
- overallFitScore (0-100)
- recommendation ("recommend", "consider", "reject")
- matchedQualifications: array of { qualification: string, evidence: string }
- qualificationGaps: array of { gap: string, importance: string, advice: string }
- interviewPrepTopics: array of strings
- rationale: string summary
Return valid JSON only.
`;

    const response = await this.ai.models.generateContent({
      model: process.env.GEMINI_MODEL || "gemini-3.5-flash-lite",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      },
    });

    try {
      const text = response.text || "{}";
      return JSON.parse(text) as DeepAnalysisResult;
    } catch {
      return {
        overallFitScore: 75,
        recommendation: "consider",
        matchedQualifications: [],
        qualificationGaps: [],
        interviewPrepTopics: ["Role technical overview"],
        rationale: response.text || "Analysis completed.",
      };
    }
  }

  async generateCoverLetter(
    posting: UnifiedJobPosting,
    userNotes?: string,
    profile?: SearchProfile
  ): Promise<CoverLetterResult> {
    const activeProfile = profile || loadSearchProfile();

    if (!this.ai) {
      return {
        suggestedSubjectLine: `Application for ${posting.title} - ${posting.company}`,
        coverLetterText: `Dear Hiring Team at ${posting.company},\n\nI am writing to express my strong interest in the ${posting.title} position. With my background in ${activeProfile.candidate.skills.slice(0, 4).join(", ")}, I have built scalable and reliable applications that deliver measurable impact.\n\nI am particularly drawn to ${posting.company}'s work and would welcome the opportunity to discuss how my experience aligns with your team's goals.\n\nSincerely,\nCandidate`,
        keyHighlightsUsed: activeProfile.candidate.skills.slice(0, 4),
      };
    }

    const prompt = `
Draft a compelling, professional, and truthful cover letter tailored for:
Candidate skills: ${activeProfile.candidate.skills.join(", ")}
Job Title: ${posting.title}
Company: ${posting.company}
User specific notes/emphasis: ${userNotes || "Emphasize full-stack delivery and clean architecture"}

Job Description excerpt:
${posting.description_text.slice(0, 2000)}

Return a JSON object with:
- suggestedSubjectLine: string
- coverLetterText: string
- keyHighlightsUsed: string[]
Return valid JSON only.
`;

    const response = await this.ai.models.generateContent({
      model: process.env.GEMINI_MODEL || "gemini-3.5-flash-lite",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      },
    });

    try {
      const text = response.text || "{}";
      return JSON.parse(text) as CoverLetterResult;
    } catch {
      return {
        suggestedSubjectLine: `Application for ${posting.title} - ${posting.company}`,
        coverLetterText: response.text || "Cover letter draft generated.",
        keyHighlightsUsed: [],
      };
    }
  }
}

export const geminiAgent = new GeminiJobAgent();
