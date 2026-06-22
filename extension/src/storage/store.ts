import { create } from "zustand";
import type { UserProfile } from "@/shared/profile";
import { emptyProfile } from "@/shared/profile";
import { loadProfile, saveProfile } from "./profile";

interface ProfileStore {
  profile: UserProfile;
  loaded: boolean;
  hydrate: () => Promise<void>;
  setProfile: (profile: UserProfile) => void;
  persist: () => Promise<void>;
}

/** Shared profile store for popup + options UIs. */
export const useProfileStore = create<ProfileStore>((set, get) => ({
  profile: emptyProfile(),
  loaded: false,
  hydrate: async () => {
    const profile = await loadProfile();
    set({ profile, loaded: true });
  },
  setProfile: (profile) => set({ profile }),
  persist: async () => {
    await saveProfile(get().profile);
  },
}));
