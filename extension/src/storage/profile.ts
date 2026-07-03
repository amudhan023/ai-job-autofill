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
