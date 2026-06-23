import type { UserProfile } from "@/shared/profile";

/**
 * Resolve a dot-path like `personal.firstName` or `experience[0].company`
 * against a UserProfile. Returns undefined if any segment is missing.
 */
export function resolveProfilePath(profile: UserProfile, path: string): unknown {
  const segments = path
    .replace(/\[(\d+)\]/g, ".$1") // experience[0] → experience.0
    .split(".")
    .filter(Boolean);

  let current: unknown = profile;
  for (const seg of segments) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[seg];
  }
  return current;
}

/** True when a resolved value is non-empty (so we never fill blanks). */
export function hasValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return !Number.isNaN(value);
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "boolean") return true;
  if (typeof value === "object") return true; // objects (e.g. PersonalInfo, Location) for transforms
  return false;
}
