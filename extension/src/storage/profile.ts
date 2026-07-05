import type { UserProfile } from "@/shared/profile";
import { emptyProfile, migrateProfile } from "@/shared/profile";

const PROFILE_KEY = "userProfile";

/**
 * Load the profile from chrome.storage.local, or a blank one if unset.
 * Stored profiles from older extension versions are migrated on read:
 * fields added by newer schemas are filled with blank defaults.
 */
export async function loadProfile(): Promise<UserProfile> {
  const stored = await chrome.storage.local.get(PROFILE_KEY);
  const value = stored[PROFILE_KEY];
  return value ? migrateProfile(value) : emptyProfile();
}

/** Persist the profile to chrome.storage.local. */
export async function saveProfile(profile: UserProfile): Promise<void> {
  await chrome.storage.local.set({ [PROFILE_KEY]: profile });
}

/** Subscribe to profile changes (e.g. options page edits). */
export function onProfileChanged(cb: (profile: UserProfile) => void): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[PROFILE_KEY]?.newValue) {
      cb(changes[PROFILE_KEY].newValue as UserProfile);
    }
  });
}

/**
 * Serialize the profile for local export (backup/migration). Local-only:
 * this never leaves the device unless the user explicitly saves the
 * downloaded file elsewhere.
 */
export function exportProfileJson(profile: UserProfile): string {
  return JSON.stringify(profile, null, 2);
}

/**
 * Parse a previously exported profile JSON string back into a valid
 * `UserProfile`, backfilling any fields missing from an older export the
 * same way `loadProfile` migrates older stored profiles. Throws a
 * descriptive `Error` if `json` isn't valid JSON or isn't an object.
 */
export function importProfileJson(json: string): UserProfile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("Not valid JSON.");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Expected a profile object.");
  }
  return migrateProfile(parsed);
}
