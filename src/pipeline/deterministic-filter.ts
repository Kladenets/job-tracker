import { UnifiedJobPosting } from "../types/job-posting";
import { SearchProfile, loadSearchProfile } from "../config/search-profile";
import { distance as distanceBetweenZips, lookup as lookupZip, lookupByName } from "zipcodes";

export interface FilterRuleResult {
  rule_id: string;
  rule_name: string;
  passed: boolean;
  evidence?: string;
}

export interface DeterministicEvaluation {
  passed: boolean;
  matchedRules: FilterRuleResult[];
}

function zipCodesForLocation(location: string): string[] {
  const zipMatch = location.match(/\b(\d{5})(?:-\d{4})?\b/);
  if (zipMatch) {
    return lookupZip(zipMatch[1]) ? [zipMatch[1]] : [];
  }

  const parts = location.split(",").map((part) => part.trim());
  for (let index = 0; index < parts.length - 1; index += 1) {
    const stateMatch = parts[index + 1].match(/^([a-z]{2})(?:\b|\s|$)/i);
    if (!stateMatch || !parts[index]) continue;
    const matches = lookupByName(parts[index], stateMatch[1].toUpperCase());
    if (matches.length > 0) return matches.map((match) => match.zip);
  }

  return [];
}

function getCommuteDistanceMiles(location: string, targetZip: string): number | null {
  const target = lookupZip(targetZip);
  if (!target) return null;

  const distances = zipCodesForLocation(location)
    .map((zip) => distanceBetweenZips(target.zip, zip))
    .filter((distance): distance is number => distance !== null && Number.isFinite(distance));
  return distances.length > 0 ? Math.min(...distances) : null;
}

/**
 * Deterministic Hard Gate Filter
 * Evaluates binary pass/fail constraints without soft scoring.
 * Missing/unknown fields (nulls) are strictly preserved and never trigger rejections.
 */
export function evaluateDeterministicFilter(
  posting: UnifiedJobPosting,
  profile?: SearchProfile
): DeterministicEvaluation {
  const activeProfile = profile || loadSearchProfile();
  const rules = activeProfile.deterministicFilterRules;
  const matchedRules: FilterRuleResult[] = [];

  const titleLower = posting.title.toLowerCase();
  const descLower = posting.description_text.toLowerCase();
  const companyLower = posting.company.toLowerCase();

  // 1. Excluded Companies / Agencies
  for (const excludedCo of rules.companies.excludedCompanies) {
    if (companyLower.includes(excludedCo.toLowerCase())) {
      matchedRules.push({
        rule_id: "excluded_company",
        rule_name: "Blacklisted Company / Agency",
        passed: false,
        evidence: `Company '${posting.company}' matches blacklisted entity '${excludedCo}'`,
      });
      break;
    }
  }

  // 2. Excluded Titles & Seniority
  for (const excludedTitle of rules.title.excludedTitleKeywords) {
    const escaped = excludedTitle.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, "\\$1");
    const regex = new RegExp(`(^|[^a-zA-Z0-9])${escaped}($|[^a-zA-Z0-9])`, "i");
    if (regex.test(titleLower)) {
      matchedRules.push({
        rule_id: "excluded_title_keyword",
        rule_name: "Excluded Title Keyword",
        passed: false,
        evidence: `Title '${posting.title}' matches excluded keyword '${excludedTitle}'`,
      });
      break;
    }
  }

  if (rules.seniority.excludedLevels.includes(posting.seniority)) {
    matchedRules.push({
      rule_id: "excluded_seniority",
      rule_name: "Excluded Seniority Level",
      passed: false,
      evidence: `Seniority '${posting.seniority}' is in excluded levels list`,
    });
  }

  // 3. Compensation Floor with Tolerance
  // CRITICAL: Missing salary (null) is NEVER an exclusion!
  const hasSalary = posting.salary_max_annual != null || posting.salary_min_annual != null;
  if (hasSalary) {
    const effectiveSalary = posting.salary_max_annual || posting.salary_min_annual || 0;
    const toleranceMargin = rules.compensation.minSalaryAnnual * (1 - rules.compensation.tolerancePercentage / 100);

    if (effectiveSalary > 0 && effectiveSalary < toleranceMargin) {
      matchedRules.push({
        rule_id: "compensation_below_tolerance",
        rule_name: "Compensation Floor with Tolerance",
        passed: false,
        evidence: `Max listed compensation $${effectiveSalary.toLocaleString()} is below minimum tolerance threshold $${Math.round(toleranceMargin).toLocaleString()} (target $${rules.compensation.minSalaryAnnual.toLocaleString()} - ${rules.compensation.tolerancePercentage}%)`,
      });
    }
  }

  // 4. Workplace & Commute Radius
  // CRITICAL: Unknown workplace (null / "unknown") is NEVER an exclusion!
  if (
    posting.workplace_type !== "unknown" &&
    !rules.workplace.allowedTypes.includes(posting.workplace_type)
  ) {
    matchedRules.push({
      rule_id: "workplace_type_not_allowed",
      rule_name: "Workplace Type Not Allowed",
      passed: false,
      evidence: `Workplace type '${posting.workplace_type}' is not in the allowed types list`,
    });
  }

  if (posting.workplace_type === "onsite") {
    const targetLoc = activeProfile.discovery.targetLocation;
    const distanceMiles = posting.location
      ? getCommuteDistanceMiles(posting.location, targetLoc.zip)
      : null;
    const maxCommuteMiles = targetLoc.radiusMiles + targetLoc.bufferMiles;

    if (distanceMiles !== null && distanceMiles > maxCommuteMiles) {
      matchedRules.push({
        rule_id: "onsite_exceeds_commute",
        rule_name: "100% On-site Outside Commute Radius",
        passed: false,
        evidence: `Job requires 100% on-site presence in '${posting.location}' (${Math.round(distanceMiles)} miles from ${targetLoc.zip}), beyond the configured ${maxCommuteMiles}-mile radius including buffer`,
      });
    }
  }

  // 5. Posting Staleness / Age
  if (posting.date_posted) {
    try {
      const postedTime = new Date(posting.date_posted).getTime();
      const now = Date.now();
      const ageDays = (now - postedTime) / (1000 * 60 * 60 * 24);
      if (ageDays > rules.postingAge.maxAgeDays) {
        matchedRules.push({
          rule_id: "posting_stale",
          rule_name: "Posting Exceeds Maximum Age",
          passed: false,
          evidence: `Posting age of ${Math.round(ageDays)} days exceeds maximum allowable age of ${rules.postingAge.maxAgeDays} days`,
        });
      }
    } catch {
      // ignore invalid date parsing
    }
  }

  // 6. Mandatory Active Security Clearance (if candidate lacks it)
  if (rules.workAuthorization.excludeRequiresActiveClearance) {
    const clearanceTerms = [
      "active ts/sci",
      "active top secret",
      "active secret clearance",
      "must possess an active security clearance",
      "current active secret clearance required",
    ];
    for (const term of clearanceTerms) {
      if (descLower.includes(term)) {
        matchedRules.push({
          rule_id: "requires_security_clearance",
          rule_name: "Mandatory Active Security Clearance",
          passed: false,
          evidence: `Job description requires '${term}' which candidate does not possess`,
        });
        break;
      }
    }
  }

  // If any rule failed, posting fails deterministic gate
  const passed = matchedRules.length === 0;

  return {
    passed,
    matchedRules,
  };
}
