import type { FieldRule } from "@/shared/types";
import { boolToYesNo } from "./transforms";

/**
 * Deterministic field rules. Order matters: more specific patterns first.
 * `profile` is a dot-path into UserProfile; `null` marks free-text fields that
 * are left for the user / AI (Phase 3) rather than filled deterministically.
 *
 * Legal/sensitive fields (SSN, EIN) are intentionally absent and additionally
 * hard-blocked by BLOCKLIST_PATTERNS below — they must never be auto-filled.
 */
export const FIELD_RULES: FieldRule[] = [
  { id: "firstName", patterns: [/first.?name/i, /given.?name/i], profile: "personal.firstName", type: "text" },
  { id: "lastName", patterns: [/last.?name/i, /family.?name/i, /surname/i], profile: "personal.lastName", type: "text" },
  { id: "fullName", patterns: [/full.?name/i, /^name$/i], profile: "personal.firstName", type: "text" },
  { id: "email", patterns: [/e-?mail/i], profile: "personal.email", type: "email" },
  { id: "phone", patterns: [/phone|mobile|cell/i], profile: "personal.phone", type: "tel" },
  { id: "linkedin", patterns: [/linked.?in/i], profile: "links.linkedin", type: "url" },
  { id: "github", patterns: [/git.?hub/i], profile: "links.github", type: "url" },
  { id: "portfolio", patterns: [/portfolio|personal.?site|website/i], profile: "links.portfolio", type: "url" },
  { id: "city", patterns: [/city|town/i], profile: "personal.location.city", type: "text" },
  { id: "state", patterns: [/state|province/i], profile: "personal.location.state", type: "text" },
  { id: "country", patterns: [/country/i], profile: "personal.location.country", type: "text" },
  { id: "postalCode", patterns: [/zip|postal/i], profile: "personal.location.postalCode", type: "text" },
  { id: "currentCompany", patterns: [/current.?(company|employer)|present.?company/i], profile: "experience[0].company", type: "text" },
  { id: "currentTitle", patterns: [/current.?(title|position|role)/i], profile: "experience[0].title", type: "text" },
  { id: "yearsExp", patterns: [/years.?(of.)?exp/i, /experience.*years/i], profile: "meta.totalYearsExp", type: "number" },
  { id: "salary", patterns: [/salary|compensation|expected.?pay|ctc/i], profile: "preferences.salaryExpected", type: "text", flags: ["confirm"] },
  { id: "usAuthorized", patterns: [/authoriz.*(work|us|united.?states)|legally.?authorized/i], profile: "workAuth.usAuthorized", type: "radio", transform: boolToYesNo },
  { id: "sponsorship", patterns: [/sponsor/i, /require.*visa/i], profile: "workAuth.sponsorshipNeeded", type: "radio", transform: boolToYesNo },
  { id: "noticePeriod", patterns: [/notice.?period|availab|start.?date|when.?can.?you.?start/i], profile: "preferences.noticePeriod", type: "text", flags: ["confirm"] },
  { id: "relocate", patterns: [/reloca/i], profile: "preferences.willingToRelocate", type: "radio", transform: boolToYesNo },
  { id: "degree", patterns: [/highest.?(education|degree)|degree/i], profile: "education[0].degree", type: "select" },
  { id: "school", patterns: [/school|university|college|institution/i], profile: "education[0].school", type: "text" },
  { id: "major", patterns: [/major|field.?of.?study|discipline/i], profile: "education[0].major", type: "text" },
  { id: "gradYear", patterns: [/graduation|grad.?year|year.?of.?completion/i], profile: "education[0].year", type: "text" },
  { id: "gpa", patterns: [/gpa|grade.?point/i], profile: "education[0].gpa", type: "text" },
  // Free-text → AI (Phase 3); detected and flagged, not deterministically filled.
  { id: "coverLetter", patterns: [/cover.?letter/i], profile: null, type: "textarea", flags: ["ai_generate"] },
  { id: "whyCompany", patterns: [/why.*(company|us|role|join)|motivation/i], profile: null, type: "textarea", flags: ["ai_generate"] },
  { id: "aboutYou", patterns: [/tell.*(yourself|about.?you)|background|introduction/i], profile: null, type: "textarea", flags: ["ai_generate"] },
  { id: "behavioral", patterns: [/describe.?a.?time|tell.?me.?about.?a.?time|give.?an.?example/i], profile: null, type: "textarea", flags: ["ai_generate"] },
];

/**
 * Sensitive patterns that must NEVER be auto-filled, even if a rule matched.
 * Checked before any rule application.
 */
export const BLOCKLIST_PATTERNS: RegExp[] = [
  /ssn|social.?security/i,
  /\bein\b|employer.?identification/i,
  /tax.?id/i,
  /passport.?number/i,
  /bank|routing|account.?number/i,
  // Diversity questions are user-only; never AI-generated or auto-filled.
  /race|ethnicity|gender|disability|veteran|sexual.?orientation/i,
];

export function isBlocked(label: string): boolean {
  return BLOCKLIST_PATTERNS.some((re) => re.test(label));
}
