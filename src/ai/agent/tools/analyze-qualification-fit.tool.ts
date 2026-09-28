import { Tool, ToolContext } from "../tool";
import { UnifiedJobPosting } from "../../../types/job-posting";

export class AnalyzeQualificationFitTool implements Tool {
  readonly name = "analyze_qualification_fit";
  readonly description =
    "Perform a deep qualification match and gap analysis between candidate skills and a specific job posting.";

  readonly parameters = {
    type: "object" as const,
    properties: {
      job_id: {
        type: "string",
        description: "The unique UUID of the job posting to analyze.",
      },
      query: {
        type: "string",
        description: "Company name or title if job UUID is not known.",
      },
    },
  };

  async execute(params: unknown, context: ToolContext): Promise<string> {
    const { repository, profile, conversation } = context;
    const args = (typeof params === "object" && params !== null ? params : {}) as {
      job_id?: string;
      query?: string;
    };

    let targetJob: UnifiedJobPosting | null = null;

    if (args.job_id) {
      targetJob = await repository.getById(args.job_id);
    } else if (args.query) {
      const list = await repository.listPostings({ company: args.query, limit: 5 });
      if (list.length > 0) targetJob = list[0];
    } else if (conversation.job_ids.length > 0) {
      const lastJobId = conversation.job_ids[conversation.job_ids.length - 1];
      targetJob = await repository.getById(lastJobId);
    }

    if (!targetJob) {
      return JSON.stringify({
        error: "Job posting not found for analysis",
        searchedFor: args,
      });
    }

    conversation.tagJobId(targetJob.id);

    const candidateSkills = new Set(profile.candidate.skills.map((s) => s.toLowerCase()));
    const detectedTech = targetJob.crawler_data?.detected_technologies || [];
    const descLower = targetJob.description_text.toLowerCase();

    const matchedQualifications: Array<{ skill: string; evidence: string }> = [];
    const potentialGaps: Array<{ requirement: string; importance: string; advice: string }> = [];

    // Check candidate skills against detected technologies and description
    for (const skill of profile.candidate.skills) {
      if (descLower.includes(skill.toLowerCase())) {
        matchedQualifications.push({
          skill,
          evidence: `Referenced directly in job description or required stack`,
        });
      }
    }

    // Identify technologies in posting that candidate hasn't listed
    for (const tech of detectedTech) {
      if (!candidateSkills.has(tech.toLowerCase())) {
        potentialGaps.push({
          requirement: tech,
          importance: "preferred/secondary",
          advice: `Demonstrate related foundational competence or fast ramp-up ability with ${tech}.`,
        });
      }
    }

    const fitScore = Math.min(
      95,
      Math.max(40, 50 + matchedQualifications.length * 10 - potentialGaps.length * 5)
    );

    return JSON.stringify({
      job_id: targetJob.id,
      job_title: targetJob.title,
      company: targetJob.company,
      overallFitScore: fitScore,
      recommendation: fitScore >= 75 ? "recommend" : fitScore >= 60 ? "consider" : "gap_heavy",
      matchedQualifications,
      qualificationGaps: potentialGaps.slice(0, 5),
      candidateProfileUsed: {
        targetTitles: profile.candidate.targetTitles,
        skillsCount: profile.candidate.skills.length,
      },
    });
  }
}
