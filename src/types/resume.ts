/**
 * Complete, strictly-typed implementation of the standard JSON Resume schema specification.
 * Specification: https://jsonresume.org/schema/
 */

export interface ResumeLocation {
  address?: string;
  postalCode?: string;
  city?: string;
  countryCode?: string;
  region?: string;
}

export interface ResumeProfile {
  network: string;
  username?: string;
  url: string;
}

export interface ResumeBasics {
  name: string;
  label?: string;
  image?: string;
  email?: string;
  phone?: string;
  url?: string;
  website?: string;
  summary?: string;
  location?: ResumeLocation;
  profiles?: ResumeProfile[];
}

export interface ResumeWorkItem {
  name?: string;
  company?: string;
  position: string;
  url?: string;
  startDate?: string;
  endDate?: string;
  current?: boolean;
  summary?: string;
  highlights?: string[];
  technologies?: string[];
  location?: string;
}

export interface ResumeVolunteerItem {
  organization: string;
  position: string;
  url?: string;
  startDate?: string;
  endDate?: string;
  summary?: string;
  highlights?: string[];
}

export interface ResumeEducationItem {
  institution: string;
  url?: string;
  area?: string;
  studyType?: string;
  startDate?: string;
  endDate?: string;
  score?: string;
  courses?: string[];
}

export interface ResumeAwardItem {
  title: string;
  date?: string;
  awarder?: string;
  summary?: string;
}

export interface ResumeCertificateItem {
  name: string;
  date?: string;
  issuer?: string;
  url?: string;
}

export interface ResumePublicationItem {
  name: string;
  publisher?: string;
  releaseDate?: string;
  url?: string;
  summary?: string;
}

export interface ResumeSkillCategory {
  name: string;
  level?: string;
  keywords: string[];
}

export interface ResumeLanguageItem {
  language: string;
  fluency?: string;
}

export interface ResumeInterestItem {
  name: string;
  keywords?: string[];
}

export interface ResumeReferenceItem {
  name: string;
  reference: string;
}

export interface ResumeProjectItem {
  name: string;
  description?: string;
  highlights?: string[];
  keywords?: string[];
  startDate?: string;
  endDate?: string;
  url?: string;
  roles?: string[];
  entity?: string;
  type?: string;
}

export interface ResumeMeta {
  canonical?: string;
  version?: string;
  lastModified?: string;
  theme?: string;
}

/**
 * Standard JSON Resume Top-Level Document
 */
export interface StructuredResume {
  meta?: ResumeMeta;
  basics: ResumeBasics;
  work?: ResumeWorkItem[];
  volunteer?: ResumeVolunteerItem[];
  education?: ResumeEducationItem[];
  awards?: ResumeAwardItem[];
  certificates?: ResumeCertificateItem[];
  publications?: ResumePublicationItem[];
  skills?: ResumeSkillCategory[];
  languages?: ResumeLanguageItem[];
  interests?: ResumeInterestItem[];
  references?: ResumeReferenceItem[];
  projects?: ResumeProjectItem[];
}

export interface ResumeSource {
  type: "remote_url" | "file_upload";
  url?: string;
  fileName?: string;
  lastSyncedAt?: string;
  lastSyncStatus?: "success" | "error";
  lastSyncError?: string;
}
