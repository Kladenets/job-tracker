import fs from "fs";
import path from "path";
import { StructuredResume, ResumeSource } from "../types/resume";

const candidateProfilePath = path.join(process.cwd(), "config", "candidate_profile.json");
const candidateResumePath = path.join(process.cwd(), "config", "candidate_resume.json");

/**
 * Load active candidate profile
 */
export function getCandidateProfile(): any {
  if (fs.existsSync(candidateProfilePath)) {
    try {
      return JSON.parse(fs.readFileSync(candidateProfilePath, "utf8"));
    } catch (e) {
      console.warn("Failed reading candidate profile:", e);
    }
  }
  return {
    fullName: "Candidate",
    email: process.env.ALLOWED_USER_EMAIL || "candidate@example.com",
    targetTitle: "Software Engineer",
    skills: ["TypeScript", "Node.js", "React", "PostgreSQL"],
    yearsExperience: 5,
    location: "Remote US",
    remotePreference: "remote_or_hybrid",
    resumeSource: {
      type: "remote_url",
      url: "https://kylekent.dev/resume.json",
    },
    additionalExperience: "",
  };
}

/**
 * Load structured candidate resume compliant with JSON Resume spec
 */
export function getCandidateResume(): StructuredResume {
  if (fs.existsSync(candidateResumePath)) {
    try {
      return JSON.parse(fs.readFileSync(candidateResumePath, "utf8"));
    } catch (e) {
      console.warn("Failed reading candidate resume:", e);
    }
  }
  return {
    basics: {
      name: "Candidate",
      label: "Software Engineer",
      email: "candidate@example.com",
    },
    work: [],
    skills: [],
    education: [],
    projects: [],
  };
}

/**
 * Calculate total years of experience from work history items
 */
export function calculateYearsExperience(workItems?: Array<{ startDate?: string; endDate?: string }>): number {
  if (!workItems || workItems.length === 0) return 5;

  let totalMonths = 0;
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  for (const item of workItems) {
    if (!item.startDate) continue;
    const startParts = item.startDate.split("-").map((p) => parseInt(p, 10));
    const startYear = startParts[0];
    const startMonth = startParts[1] || 1;

    let endYear = currentYear;
    let endMonth = currentMonth;

    if (item.endDate && item.endDate.toLowerCase() !== "present") {
      const endParts = item.endDate.split("-").map((p) => parseInt(p, 10));
      endYear = endParts[0] || currentYear;
      endMonth = endParts[1] || 12;
    }

    const months = (endYear - startYear) * 12 + (endMonth - startMonth);
    if (months > 0) {
      totalMonths += months;
    }
  }

  const computed = Math.round(totalMonths / 12);
  return Math.max(1, Math.min(40, computed || 5));
}

/**
 * Extract flattened deduplicated skills list from structured resume
 * (Aggregates from skills categories, work technologies, and project keywords)
 */
export function extractSkillsFromResume(resume: StructuredResume): string[] {
  const skillsSet = new Set<string>();

  if (Array.isArray(resume.skills)) {
    for (const cat of resume.skills) {
      if (Array.isArray(cat.keywords)) {
        for (const kw of cat.keywords) {
          if (kw && typeof kw === "string") skillsSet.add(kw.trim());
        }
      }
      if (cat.name && typeof cat.name === "string" && !cat.name.includes("&")) {
        skillsSet.add(cat.name.trim());
      }
    }
  }

  if (Array.isArray(resume.work)) {
    for (const w of resume.work) {
      if (Array.isArray(w.technologies)) {
        for (const t of w.technologies) {
          if (t && typeof t === "string") skillsSet.add(t.trim());
        }
      }
    }
  }

  if (Array.isArray(resume.projects)) {
    for (const p of resume.projects) {
      if (Array.isArray(p.keywords)) {
        for (const kw of p.keywords) {
          if (kw && typeof kw === "string") skillsSet.add(kw.trim());
        }
      }
    }
  }

  return Array.from(skillsSet);
}

/**
 * Normalize an external resume JSON payload to the complete JSON Resume standard schema
 */
export function normalizeStructuredResume(raw: any): StructuredResume {
  const basics = raw.basics || {};

  const work = Array.isArray(raw.work)
    ? raw.work.map((w: any) => ({
        company: w.company || w.name || "Company",
        name: w.name || w.company,
        position: w.position || w.role || "Software Engineer",
        startDate: w.startDate,
        endDate: w.endDate || (w.current ? "Present" : undefined),
        current: Boolean(w.current || w.endDate === "Present"),
        summary: w.summary,
        highlights: Array.isArray(w.highlights) ? w.highlights : [],
        technologies: Array.isArray(w.technologies) ? w.technologies : [],
        location: w.location,
        url: w.url,
      }))
    : [];

  const volunteer = Array.isArray(raw.volunteer)
    ? raw.volunteer.map((v: any) => ({
        organization: v.organization || "Organization",
        position: v.position || "Volunteer",
        startDate: v.startDate,
        endDate: v.endDate,
        summary: v.summary,
        highlights: Array.isArray(v.highlights) ? v.highlights : [],
        url: v.url,
      }))
    : undefined;

  const education = Array.isArray(raw.education)
    ? raw.education.map((e: any) => ({
        institution: e.institution || e.school || "University",
        area: e.area || e.degree,
        studyType: e.studyType || e.degreeType,
        startDate: e.startDate,
        endDate: e.endDate,
        score: e.score || e.gpa,
        courses: Array.isArray(e.courses) ? e.courses : undefined,
        url: e.url,
      }))
    : [];

  const awards = Array.isArray(raw.awards)
    ? raw.awards.map((a: any) => ({
        title: a.title,
        date: a.date,
        awarder: a.awarder,
        summary: a.summary,
      }))
    : undefined;

  const certificates = Array.isArray(raw.certificates)
    ? raw.certificates.map((c: any) => ({
        name: c.name,
        date: c.date,
        issuer: c.issuer,
        url: c.url,
      }))
    : undefined;

  const publications = Array.isArray(raw.publications)
    ? raw.publications.map((p: any) => ({
        name: p.name,
        publisher: p.publisher,
        releaseDate: p.releaseDate,
        url: p.url,
        summary: p.summary,
      }))
    : undefined;

  const skills = Array.isArray(raw.skills)
    ? raw.skills.map((s: any) => {
        if (typeof s === "string") {
          return { name: "Core Skills", keywords: [s] };
        }
        return {
          name: s.name || "Skills",
          level: s.level,
          keywords: Array.isArray(s.keywords) ? s.keywords : [],
        };
      })
    : [];

  const languages = Array.isArray(raw.languages)
    ? raw.languages.map((l: any) => ({
        language: l.language,
        fluency: l.fluency,
      }))
    : undefined;

  const interests = Array.isArray(raw.interests)
    ? raw.interests.map((i: any) => ({
        name: i.name,
        keywords: Array.isArray(i.keywords) ? i.keywords : [],
      }))
    : undefined;

  const references = Array.isArray(raw.references)
    ? raw.references.map((r: any) => ({
        name: r.name,
        reference: r.reference,
      }))
    : undefined;

  const projects = Array.isArray(raw.projects)
    ? raw.projects.map((p: any) => ({
        name: p.name || "Project",
        description: p.description,
        highlights: Array.isArray(p.highlights) ? p.highlights : [],
        keywords: Array.isArray(p.keywords) ? p.keywords : [],
        startDate: p.startDate,
        endDate: p.endDate,
        url: p.url,
        roles: Array.isArray(p.roles) ? p.roles : undefined,
        entity: p.entity,
        type: p.type,
      }))
    : [];

  return {
    meta: raw.meta,
    basics: {
      name: basics.name || raw.name || "Candidate",
      label: basics.label || raw.title || "Software Engineer",
      image: basics.image,
      email: basics.email || raw.email,
      phone: basics.phone || raw.phone,
      url: basics.url || basics.website || raw.url,
      website: basics.website || basics.url,
      summary: basics.summary || raw.summary || raw.bio,
      location: basics.location || raw.location,
      profiles: Array.isArray(basics.profiles) ? basics.profiles : [],
    },
    work,
    volunteer,
    education,
    awards,
    certificates,
    publications,
    skills,
    languages,
    interests,
    references,
    projects,
  };
}

/**
 * Save candidate resume and update synchronized profile
 */
export function persistResumeAndProfile(
  resume: StructuredResume,
  sourceUpdate: Partial<ResumeSource>
): { profile: any; resumeData: StructuredResume } {
  const currentProfile = getCandidateProfile();

  // Compute fields from resume
  const computedSkills = extractSkillsFromResume(resume);
  const computedYears = calculateYearsExperience(resume.work);
  const derivedTitle = resume.basics.label || currentProfile.targetTitle;
  const derivedLocation =
    typeof resume.basics.location === "object"
      ? `${resume.basics.location.city || ""}, ${resume.basics.location.region || ""}`.trim().replace(/^,\s*|,\s*$/g, "")
      : currentProfile.location;

  const updatedSource: ResumeSource = {
    ...currentProfile.resumeSource,
    ...sourceUpdate,
    lastSyncedAt: new Date().toISOString(),
    lastSyncStatus: "success",
    lastSyncError: undefined,
  };

  const updatedProfile = {
    ...currentProfile,
    fullName: resume.basics.name || currentProfile.fullName,
    email: resume.basics.email || currentProfile.email,
    targetTitle: derivedTitle,
    yearsExperience: computedYears,
    location: derivedLocation || currentProfile.location,
    skills: computedSkills.length > 0 ? computedSkills : currentProfile.skills,
    resumeSource: updatedSource,
  };

  fs.writeFileSync(candidateResumePath, JSON.stringify(resume, null, 2), "utf8");
  fs.writeFileSync(candidateProfilePath, JSON.stringify(updatedProfile, null, 2), "utf8");

  return { profile: updatedProfile, resumeData: resume };
}
