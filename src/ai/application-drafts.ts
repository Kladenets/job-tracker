import { z } from "zod";
import type { JobPostingRepository } from "../db/repository-interface.js";
import type { UnifiedJobPosting } from "../types/job-posting.js";
import { getCandidateProfile, getCandidateResume } from "../utils/resume-sync.js";

export const ApplicationDraftTypeSchema = z.enum(["cover_letter", "application_answer"]);
export type ApplicationDraftType = z.infer<typeof ApplicationDraftTypeSchema>;

export const ApplicationDraftStatusSchema = z.enum(["draft", "approved"]);
export type ApplicationDraftStatus = z.infer<typeof ApplicationDraftStatusSchema>;

export const ApplicationDraftSourceFactSchema = z.object({
  id: z.string().min(1).max(160),
  source: z.enum(["candidate_profile", "resume", "job_posting", "approved_answer"]),
  label: z.string().min(1).max(160),
  value: z.string().min(1).max(2000),
});
export type ApplicationDraftSourceFact = z.infer<typeof ApplicationDraftSourceFactSchema>;

export const ApplicationDraftVersionSchema = z.object({
  version: z.number().int().positive(),
  content: z.string().max(20000),
  subject_line: z.string().max(500).nullable(),
  source_facts: z.array(ApplicationDraftSourceFactSchema),
  assumptions: z.array(z.string().max(500)),
  author: z.enum(["assistant", "user"]),
  model_id: z.string().max(160).nullable(),
  prompt_version: z.string().max(160).nullable(),
  created_at: z.string().datetime(),
  approved_at: z.string().datetime().nullable(),
  approved_by: z.string().max(160).nullable(),
});
export type ApplicationDraftVersion = z.infer<typeof ApplicationDraftVersionSchema>;

export const ApplicationDraftSchema = z.object({
  id: z.string().uuid(),
  job_posting_id: z.string().uuid(),
  conversation_id: z.string().max(64).nullable(),
  draft_type: ApplicationDraftTypeSchema,
  question: z.string().max(2000).nullable(),
  sensitive: z.boolean(),
  status: ApplicationDraftStatusSchema,
  current_version: z.number().int().positive(),
  versions: z.array(ApplicationDraftVersionSchema).min(1),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});
export type ApplicationDraft = z.infer<typeof ApplicationDraftSchema>;

export const NewApplicationDraftSchema = z.object({
  id: z.string().uuid(),
  job_posting_id: z.string().uuid(),
  conversation_id: z.string().max(64).nullable().optional(),
  draft_type: ApplicationDraftTypeSchema,
  question: z.string().trim().min(1).max(2000).nullable().optional(),
  sensitive: z.boolean().optional(),
  content: z.string().trim().min(1).max(20000),
  subject_line: z.string().max(500).nullable().optional(),
  source_facts: z.array(ApplicationDraftSourceFactSchema).max(50).default([]),
  assumptions: z.array(z.string().max(500)).max(20).default([]),
  author: z.enum(["assistant", "user"]),
  model_id: z.string().max(160).nullable().optional(),
  prompt_version: z.string().max(160).nullable().optional(),
}).superRefine((draft, context) => {
  if (draft.draft_type === "application_answer" && !draft.question) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["question"],
      message: "Application-answer drafts require the original question",
    });
  }
  if (draft.draft_type === "cover_letter" && draft.question) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["question"],
      message: "Cover-letter drafts do not accept a question",
    });
  }
});
export type NewApplicationDraft = z.input<typeof NewApplicationDraftSchema>;

export interface ApplicationDraftListOptions {
  jobPostingId?: string;
  draftType?: ApplicationDraftType;
  status?: ApplicationDraftStatus;
  includeSensitive?: boolean;
  hasApprovedVersion?: boolean;
  limit?: number;
}

export function buildGroundedCoverLetterDraft(
  job: UnifiedJobPosting,
  facts: ApplicationDraftSourceFact[],
  concise = false
): { content: string; subject_line: string; source_facts: ApplicationDraftSourceFact[] } {
  const sourceFacts: ApplicationDraftSourceFact[] = [];
  const name = facts.find((fact) => fact.id === "candidate.full_name");
  if (name) sourceFacts.push(name);
  const skills = facts.filter((fact) => fact.id.startsWith("candidate.skill.")).slice(0, concise ? 3 : 6);
  sourceFacts.push(...skills);
  const work = facts.find((fact) => fact.id.startsWith("resume.work."));
  if (!concise && work) sourceFacts.push(work);

  const content = [
    `Dear Hiring Team at ${job.company},`,
    "",
    `I am interested in the ${job.title} position at ${job.company}.`,
    skills.length
      ? `My candidate profile lists experience with ${skills.map((fact) => fact.value).join(", ")}.`
      : "",
    !concise && work ? `My resume describes the following experience: ${work.value}` : "",
    "",
    `I would welcome the opportunity to discuss the role and how my documented experience may align with your team's needs.`,
    "",
    "Sincerely,",
    name?.value || "Candidate",
  ].filter(Boolean).join("\n");

  return {
    content,
    subject_line: `Application for ${job.title} - ${job.company}`,
    source_facts: sourceFacts,
  };
}

export function detectSensitiveApplicationQuestion(question: string): string | null {
  const normalized = question.toLowerCase();
  const asksForAnswer =
    /\b(application|application question|application form|draft|write|answer|respond|how should i|what should i)\b/.test(normalized);
  if (!asksForAnswer) return null;

  const restrictedCategories: Array<[RegExp, string]> = [
    [/\b(work authorization|authorized to work|right to work|work eligibility|employment eligibility|work permit|visa status|sponsorship|immigration status)\b/, "work authorization or sponsorship"],
    [/\b(criminal history|criminal record|felony|misdemeanor|conviction|ever convicted|arrest record)\b/, "criminal history"],
    [/\b(disability|disabled|medical condition|medical history|accommodation request|reasonable accommodation|need accommodations)\b/, "disability or medical information"],
    [/\b(veteran|military service|military status)\b/, "veteran or military status"],
    [/\b(race|ethnicity|gender identity|gender|sex|sexual orientation|religion|national origin|demographic|pronouns)\b/, "demographic information"],
    [/\b(salary expectation|salary requirements|expected salary|desired salary|compensation expectation|desired compensation|pay expectation|salary commitment)\b/, "compensation commitments"],
    [/\b(conflict of interest|conflicts of interest|non.?compete|outside employment)\b/, "conflicts of interest"],
    [/\b(legal attestation|attest|certify|electronic signature|signature|sign this application)\b/, "legal attestations or signatures"],
  ];

  return restrictedCategories.find(([pattern]) => pattern.test(normalized))?.[1] ?? null;
}

export async function buildApplicationDraftSourceFacts(
  repository: JobPostingRepository,
  job: UnifiedJobPosting
): Promise<ApplicationDraftSourceFact[]> {
  const [profile, resume] = await Promise.all([
    getCandidateProfile(repository),
    getCandidateResume(repository),
  ]);
  const facts: ApplicationDraftSourceFact[] = [];
  const add = (
    id: string,
    source: ApplicationDraftSourceFact["source"],
    label: string,
    value: unknown
  ) => {
    if (typeof value !== "string" && typeof value !== "number") return;
    const text = String(value).trim();
    if (!text) return;
    facts.push({
      id,
      source,
      label: label.slice(0, 160),
      value: text.slice(0, 1000),
    });
  };
  const joinText = (values: unknown[]) =>
    values.filter((value): value is string => typeof value === "string" && value.trim().length > 0).join(" ");

  add("candidate.full_name", "candidate_profile", "Candidate name", profile.fullName || resume.basics?.name);
  add("candidate.years_experience", "candidate_profile", "Years of experience", profile.yearsExperience);
  add(
    "candidate.additional_experience",
    "candidate_profile",
    "Additional candidate experience",
    profile.additionalExperience
  );
  const profileSkills = Array.isArray(profile.skills)
    ? profile.skills.filter((skill: unknown): skill is string => typeof skill === "string")
    : [];
  const skills = profileSkills.length
    ? profileSkills
    : (resume.skills || []).flatMap((category) => category.keywords || []);
  const skillSource = profileSkills.length ? "candidate_profile" : "resume";
  skills.slice(0, 15).forEach((skill: string, index: number) =>
    add(`candidate.skill.${index}`, skillSource, `Candidate skill: ${skill}`, skill)
  );

  (resume.work || []).slice(0, 8).forEach((work, index) => {
    add(
      `resume.work.${index}`,
      "resume",
      `${work.position}${work.company ? ` at ${work.company}` : ""}`,
      joinText([
        work.position,
        work.company ? `at ${work.company}` : "",
        work.startDate,
        work.endDate,
        work.summary,
        ...(work.highlights || []),
      ])
    );
  });
  (resume.projects || []).slice(0, 8).forEach((project, index) =>
    add(
      `resume.project.${index}`,
      "resume",
      `Project: ${project.name}`,
      joinText([project.name, project.description, ...(project.highlights || [])])
    )
  );
  (resume.education || []).slice(0, 4).forEach((education, index) =>
    add(
      `resume.education.${index}`,
      "resume",
      `Education: ${education.institution}`,
      joinText([education.studyType, education.area, education.institution, education.endDate])
    )
  );
  add("job.title", "job_posting", "Job title", job.title);
  add("job.company", "job_posting", "Company", job.company);
  add("job.workplace_type", "job_posting", "Workplace type", job.workplace_type);

  return facts.slice(0, 50);
}
