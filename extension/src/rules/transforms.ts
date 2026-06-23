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

/** Combines personal.location.city + .state into "City, State" format. */
export function toCityState(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const loc = value as { city?: string; state?: string };
  return [loc.city, loc.state].filter(Boolean).join(", ").trim();
}
