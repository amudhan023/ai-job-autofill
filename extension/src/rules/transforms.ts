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
 * "Are you a US citizen?" from workAuth.visaType: USC → Yes, any other known
 * status → No, unset ("") → empty string (never guess citizenship).
 */
export function visaToCitizenship(value: unknown): string {
  if (typeof value !== "string" || value === "") return "";
  return value === "USC" ? "Yes" : "No";
}
