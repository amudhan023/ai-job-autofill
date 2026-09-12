/** Value transforms applied between profile values and form values. */

export function boolToYesNo(value: unknown): string {
  return value ? "Yes" : "No";
}

export function stringifyNumber(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  return String(value);
}

/** Combines personal.firstName + personal.lastName into a full name string. */
export function toFullName(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const p = value as { firstName?: string; lastName?: string };
  return [p.firstName?.trim(), p.lastName?.trim()].filter(Boolean).join(" ");
}

/** Preferred/display name; falls back to the full name when not set. */
export function toPreferredName(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const p = value as { preferredName?: string };
  return p.preferredName?.trim() || toFullName(value);
}

/** Combines personal.location.city + .state into "City, State" format. */
export function toCityState(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const loc = value as { city?: string; state?: string };
  return [loc.city, loc.state].filter(Boolean).join(", ").trim();
}

/** Joins a string array ("skills", "languages") into a comma-separated list. */
export function joinList(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value.filter((v) => typeof v === "string" && v.trim()).join(", ");
}

/**
 * Dial code → representative country name, for phone country-code dropdowns.
 * Widgets list countries by name ("United States+1", "United States (+1)"),
 * so the name is the robust match key across ATSs. Unknown codes pass through
 * unchanged so exact-value selects can still match.
 */
const DIAL_TO_COUNTRY: Record<string, string> = {
  "+1": "United States",
  "+44": "United Kingdom",
  "+91": "India",
  "+61": "Australia",
  "+49": "Germany",
  "+33": "France",
  "+81": "Japan",
  "+86": "China",
  "+65": "Singapore",
  "+971": "United Arab Emirates",
  "+31": "Netherlands",
  "+34": "Spain",
  "+39": "Italy",
  "+55": "Brazil",
  "+52": "Mexico",
};

export function dialCodeToCountry(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "";
  const code = value.trim();
  return DIAL_TO_COUNTRY[code] ?? code;
}

/** Options for the profile page's phone-country dropdown. */
export const PHONE_COUNTRY_OPTIONS = Object.entries(DIAL_TO_COUNTRY).map(([code, name]) => ({
  value: code,
  label: `${name} (${code})`,
}));

/**
 * "Are you a US citizen?" from workAuth.visaType: USC → Yes, any other known
 * status → No, unset ("") → empty string (never guess citizenship).
 */
export function visaToCitizenship(value: unknown): string {
  if (typeof value !== "string" || value === "") return "";
  return value === "USC" ? "Yes" : "No";
}

/**
 * "Do you currently live in the United States?" from personal.location.country.
 * Unset country → "" (never guess residency). Matches the common spellings an
 * ATS profile might hold; anything else is a truthful "No".
 */
const US_COUNTRY = /^(us|usa|u\.s\.a?\.?|united\s?states( of america)?)$/i;

export function countryToUsResidency(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "";
  return US_COUNTRY.test(value.trim()) ? "Yes" : "No";
}

/**
 * Screening gates that state their own bar in the label ("Do you have 5+ years
 * of ... experience?"). Reads the threshold out of the question and compares it
 * to meta.totalYearsExp. Returns "" when either side is missing — an unset
 * profile (totalYearsExp defaults to 0) must not answer "No" to every gate.
 */
export function yearsMeetsThreshold(value: unknown, label: string): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return "";
  const m = /(\d+)\s*\+?\s*(?:or more\s*)?years?/i.exec(label);
  if (!m) return "";
  return value >= Number(m[1]) ? "Yes" : "No";
}

/**
 * Skill gates ("Do you have hands-on experience with Terraform, Pulumi, or
 * CDK?"). Decides Yes/No by comparing the user's technical skills against the
 * technologies named in the question itself.
 *
 * Confirm-flagged at the rule level: this is a heuristic about the user's own
 * qualifications, so the popup surfaces the answer for review and the executor
 * never writes it to the page.
 */
export function skillsMatchLabel(value: unknown, label: string): string {
  if (!Array.isArray(value) || !label.trim()) return "";
  const skills = value.filter((s): s is string => typeof s === "string" && s.trim().length >= 2);
  if (skills.length === 0) return "";
  // Word-boundary match so "Go" doesn't hit "good" and "R" doesn't hit
  // everything. \b is useless next to a non-word character, though — "C++"
  // and ".NET" end/start on punctuation — so anchor on a non-word char (or
  // string edge) instead of \b on those sides.
  const hit = skills.some((skill) => {
    const s = skill.trim();
    const esc = s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const left = /^\w/.test(s) ? "\\b" : "(?:^|\\W)";
    const right = /\w$/.test(s) ? "\\b" : "(?:$|\\W)";
    return new RegExp(`${left}${esc}${right}`, "i").test(label);
  });
  // One overlap is enough for "Yes" — these gates read "such as X, Y, or Z".
  // Zero overlap is *unknown*, not "No": the question may name a technology
  // the user simply never listed, and a wrong "No" kills the application.
  return hit ? "Yes" : "";
}
