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
