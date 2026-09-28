import fs from "fs";
import path from "path";
import { z } from "zod";

export const SearchProfileSchema = z.object({
  id: z.string().default("profile-default-fullstack"),
  name: z.string().default("Full-Stack Remote & Bucks County Hybrid"),
  isActive: z.boolean().default(true),
  candidate: z.object({
    targetTitles: z.array(z.string()).default([]),
    skills: z.array(z.string()).default([]),
    requiresSponsorship: z.boolean().default(false),
    hasSecurityClearance: z.boolean().default(false),
  }),
  discovery: z.object({
    searchTerms: z.array(z.string()).default([]),
    targetLocation: z.object({
      city: z.string().default("Doylestown"),
      state: z.string().default("PA"),
      zip: z.string().default("18901"),
      radiusMiles: z.number().default(35),
      bufferMiles: z.number().default(15),
    }),
  }),
  deterministicFilterRules: z.object({
    workplace: z.object({
      allowedTypes: z.array(z.string()).default(["remote", "hybrid", "onsite", "unknown"]),
      maxOnsiteDaysPerWeek: z.number().default(2),
      commuteRadiusMiles: z.number().default(35),
      commuteBufferMiles: z.number().default(15),
      allowMissingWorkplace: z.boolean().default(true),
    }),
    compensation: z.object({
      minSalaryAnnual: z.number().default(120000),
      tolerancePercentage: z.number().default(15),
      allowMissingSalary: z.boolean().default(true),
    }),
    postingAge: z.object({
      maxAgeDays: z.number().default(45),
    }),
    seniority: z.object({
      excludedLevels: z.array(z.string()).default([]),
    }),
    title: z.object({
      excludedTitleKeywords: z.array(z.string()).default([]),
    }),
    companies: z.object({
      excludedCompanies: z.array(z.string()).default([]),
    }),
    workAuthorization: z.object({
      excludeUsCitizenshipOnly: z.boolean().default(false),
      excludeRequiresActiveClearance: z.boolean().default(true),
    }),
  }),
  jevScreening: z.object({
    enabled: z.boolean().default(true),
    model: z.string().default("jev-system-1"),
    minConfidenceRecommend: z.number().default(0.70),
  }),
});

export type SearchProfile = z.infer<typeof SearchProfileSchema>;

let cachedProfile: SearchProfile | null = null;
let lastLoadedTime = 0;

export function loadSearchProfile(customPath?: string): SearchProfile {
  const filePath = customPath || path.join(process.cwd(), "config", "search_profile.json");
  const now = Date.now();

  // Cache for 5 seconds to enable fast runtime reloads without reading disk on every single record
  if (cachedProfile && now - lastLoadedTime < 5000) {
    return cachedProfile;
  }

  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(content);
      const validated = SearchProfileSchema.parse(parsed);
      cachedProfile = validated;
      lastLoadedTime = now;
      return validated;
    }
  } catch (err) {
    console.warn(`[SearchProfile] Failed to load config from ${filePath}, using defaults:`, err);
  }

  const defaultProfile = SearchProfileSchema.parse({
    candidate: {
      targetTitles: ["Software Engineer", "Full Stack Engineer"],
      skills: ["typescript", "react", "node.js"],
      requiresSponsorship: false,
    },
    discovery: {
      searchTerms: ["Software Engineer"],
      targetLocation: { city: "Doylestown", state: "PA", zip: "18901", radiusMiles: 35, bufferMiles: 15 },
    },
    deterministicFilterRules: {
      workplace: { allowedTypes: ["remote", "hybrid", "onsite", "unknown"] },
      compensation: { minSalaryAnnual: 120000, tolerancePercentage: 15, allowMissingSalary: true },
      postingAge: { maxAgeDays: 45 },
      seniority: { excludedLevels: ["intern", "student", "director", "executive"] },
      title: { excludedTitleKeywords: ["intern", "unpaid", "director", "vp"] },
      companies: { excludedCompanies: [] },
      workAuthorization: { excludeUsCitizenshipOnly: false, excludeRequiresActiveClearance: true },
    },
    jevScreening: { enabled: true, model: "jev-system-1", minConfidenceRecommend: 0.70 },
  });

  cachedProfile = defaultProfile;
  lastLoadedTime = now;
  return defaultProfile;
}
