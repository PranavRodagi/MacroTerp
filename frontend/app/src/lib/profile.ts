// FAKE profile storage for now (localStorage, one entry per user id).
//
// Shaped like a Supabase `profiles` table row keyed by the auth user's id. To switch,
// replace the two functions with:
//
//   supabase.from("profiles").select("*").eq("id", userId).maybeSingle()
//   supabase.from("profiles").upsert(profile)
//
// Suggested table: id uuid primary key references auth.users, username text unique,
// onboarded boolean, personalization jsonb, plus a row-level-security policy
// so users can only read and write their own row.
import { DEFAULT_PERSONALIZATION, type Personalization } from "./nutrition";

export type Profile = {
  id: string;
  username: string | null;
  onboarded: boolean; // true once the goals step is finished
  personalization: Personalization;
};

const key = (userId: string) => `nourish:fake-profile:${userId}`;
const delay = () => new Promise((r) => setTimeout(r, 120));

export async function getProfile(userId: string): Promise<{ data: Profile | null; error: { message: string } | null }> {
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
}

export async function upsertProfile(profile: Profile): Promise<{ error: { message: string } | null }> {
  await delay();
  try {
    localStorage.setItem(key(profile.id), JSON.stringify(profile));
    return { error: null };
  } catch {
    return { error: { message: "Couldn't save your profile." } };
  }
}

export const newProfile = (userId: string, username: string | null): Profile => ({
  id: userId,
  username,
  onboarded: false,
  personalization: DEFAULT_PERSONALIZATION,
});
