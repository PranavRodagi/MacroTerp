// User profiles: the Supabase `profiles` table when Supabase is configured (schema in
// supabase/migrations/), otherwise localStorage (lib/fakeProfile.ts).
//
// The app works with `Profile`; the table stores the same data as validated columns,
// and toRow()/toProfile() convert between the two.
import { DEFAULT_PERSONALIZATION, type Personalization, type Totals } from "./nutrition";
import { fakeProfiles } from "./fakeProfile";
import { supabase } from "./supabase";

export type Profile = {
  id: string;
  username: string | null;
  onboarded: boolean; // true once the goals step is finished
  personalization: Personalization;
};

type StoreError = { message: string } | null;

export type ProfileStore = {
  getProfile(userId: string): Promise<{ data: Profile | null; error: StoreError }>;
  upsertProfile(profile: Profile): Promise<{ error: StoreError }>;
  /** Whether no account uses `username` yet (ignoring case). */
  isUsernameAvailable(username: string): Promise<{ data: boolean | null; error: StoreError }>;
};

// ---------------------------------------------------------------- Supabase

// One row of public.profiles (only the columns the app reads or writes).
type ProfileRow = {
  id: string;
  username: string | null;
  onboarded: boolean;
  calorie_goal: number | null;
  protein_goal_g: number | null;
  dietary_restrictions: string[];
  consumed: Partial<Totals>;
};

const COLUMNS = "id, username, onboarded, calorie_goal, protein_goal_g, dietary_restrictions, consumed";

const toProfile = (row: ProfileRow): Profile => ({
  id: row.id,
  username: row.username,
  onboarded: row.onboarded,
  personalization: {
    calorieGoal: row.calorie_goal ?? DEFAULT_PERSONALIZATION.calorieGoal,
    proteinGoal: row.protein_goal_g ?? DEFAULT_PERSONALIZATION.proteinGoal,
    restrictions: row.dietary_restrictions,
    consumed: { ...DEFAULT_PERSONALIZATION.consumed, ...row.consumed },
  },
});

const toRow = ({ id, username, onboarded, personalization: p }: Profile): ProfileRow => ({
  id,
  username,
  onboarded,
  calorie_goal: p.calorieGoal,
  protein_goal_g: p.proteinGoal,
  dietary_restrictions: p.restrictions,
  consumed: p.consumed,
});

export const supabaseProfiles = (client: NonNullable<typeof supabase>): ProfileStore => ({
  async getProfile(userId) {
    const { data, error } = await client.from("profiles").select(COLUMNS).eq("id", userId).maybeSingle();
    return { data: data && toProfile(data as ProfileRow), error };
  },

  async upsertProfile(profile) {
    const { error } = await client.from("profiles").upsert(toRow(profile));
    return { error };
  },

  async isUsernameAvailable(username) {
    // A database function, since row-level security hides other users' profiles.
    const { data, error } = await client.rpc("username_available", { candidate: username.trim() });
    return { data: typeof data === "boolean" ? data : null, error };
  },
});

const store: ProfileStore = supabase ? supabaseProfiles(supabase) : fakeProfiles;

export const { getProfile, upsertProfile, isUsernameAvailable } = store;

export const newProfile = (userId: string, username: string | null): Profile => ({
  id: userId,
  username,
  onboarded: false,
  personalization: DEFAULT_PERSONALIZATION,
});
