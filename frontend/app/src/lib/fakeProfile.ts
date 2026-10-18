// FAKE profile storage, used when Supabase isn't configured (see lib/profile.ts).
// One localStorage entry per user id.
import "./legacyStorage";
import { DEFAULT_PERSONALIZATION } from "./nutrition";
import type { Profile, ProfileStore } from "./profile";

const PREFIX = "macroterp:fake-profile:";
const key = (userId: string) => PREFIX + userId;
const delay = () => new Promise((r) => setTimeout(r, 120));

function savedProfiles(): Profile[] {
  const profiles: Profile[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const storageKey = localStorage.key(i);
    if (!storageKey?.startsWith(PREFIX)) continue;
    try {
      profiles.push(JSON.parse(localStorage.getItem(storageKey) || "null"));
    } catch {
      /* skip a corrupt entry */
    }
  }
  return profiles.filter(Boolean);
}

export const fakeProfiles: ProfileStore = {
  async getProfile(userId) {
    await delay();
    try {
      const saved = JSON.parse(localStorage.getItem(key(userId)) || "null") as (Profile & { full_name?: string | null }) | null;
      if (!saved) return { data: null, error: null };
      const { full_name, ...rest } = saved; // profiles saved before the rename used full_name
      // Fill in any fields added since this profile was saved.
      const p = saved.personalization ?? DEFAULT_PERSONALIZATION;
      return {
        data: { ...rest, username: rest.username ?? full_name ?? null, personalization: { ...DEFAULT_PERSONALIZATION, ...p, consumed: { ...DEFAULT_PERSONALIZATION.consumed, ...p.consumed } } },
        error: null,
      };
    } catch {
      return { data: null, error: { message: "Couldn't read your profile." } };
    }
  },

  async upsertProfile(profile) {
    await delay();
    try {
      localStorage.setItem(key(profile.id), JSON.stringify(profile));
      return { error: null };
    } catch {
      return { error: { message: "Couldn't save your profile." } };
    }
  },

  async isUsernameAvailable(username) {
    await delay();
    const wanted = username.trim().toLowerCase();
    return { data: !savedProfiles().some((p) => p.username?.toLowerCase() === wanted), error: null };
  },
};
