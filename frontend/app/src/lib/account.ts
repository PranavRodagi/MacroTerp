// Accounts and saved preferences, backed by Supabase (tables in supabase/schema.sql).
//
// A login/register page only needs these functions. Each returns a Result rather
// than throwing, so a form can show `result.error` as-is. Validation mirrors the
// database's CHECK constraints so users get clear messages before a request is sent.
import type { AuthError, PostgrestError } from "@supabase/supabase-js";
import { RESTRICTIONS, type Personalization } from "./nutrition";
import { getSupabase } from "./supabase";

export type Result<T = void> = { ok: true; data: T } | { ok: false; error: string };

// Preferences stored in the account; the rest of Personalization stays per-session.
export type SavedPreferences = Pick<Personalization, "calorieGoal" | "proteinGoal" | "restrictions">;

export type Profile = {
  username: string;
  calorieGoal: number | null; // null until the user sets it
  proteinGoal: number | null;
  restrictions: string[];
};

export const LIMITS = {
  username: /^[A-Za-z0-9_]{3,30}$/,
  passwordMinLength: 8,
  passwordMaxBytes: 72, // bcrypt, which Supabase uses, ignores anything longer
  calorieGoal: { min: 1000, max: 6000 },
  proteinGoal: { min: 0, max: 400 },
};
const RESTRICTION_VALUES = new Set(RESTRICTIONS.map((r) => r.value));
const PROFILE_COLUMNS = "username, calorie_goal, protein_goal_g, dietary_restrictions";

type ProfileRow = {
  username: string;
  calorie_goal: number | null;
  protein_goal_g: number | null;
  dietary_restrictions: string[];
};

const ok = <T>(data: T): Result<T> => ({ ok: true, data });
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

// ---------------------------------------------------------------- validation
// Each returns an error message, or null when the value is valid.

export function validateEmail(email: string): string | null {
  const value = email.trim();
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? null : "Enter a valid email address.";
}

export function validateUsername(username: string): string | null {
  return LIMITS.username.test(username.trim())
    ? null
    : "Usernames are 3–30 characters: letters, numbers, and underscores only.";
}

export function validatePassword(password: string): string | null {
  if (password.length < LIMITS.passwordMinLength) {
    return `Passwords must be at least ${LIMITS.passwordMinLength} characters.`;
  }
  if (new TextEncoder().encode(password).length > LIMITS.passwordMaxBytes) {
    return "That password is too long.";
  }
  return null;
}

export function validatePreferences(prefs: Partial<SavedPreferences>): string | null {
  const { calorieGoal, proteinGoal, restrictions } = prefs;
  const { calorieGoal: cal, proteinGoal: pro } = LIMITS;
  if (calorieGoal !== undefined && !(Number.isInteger(calorieGoal) && calorieGoal >= cal.min && calorieGoal <= cal.max)) {
    return `Calorie goal must be a whole number from ${cal.min} to ${cal.max}.`;
  }
  if (proteinGoal !== undefined && !(Number.isInteger(proteinGoal) && proteinGoal >= pro.min && proteinGoal <= pro.max)) {
    return `Protein goal must be a whole number from ${pro.min} to ${pro.max} g.`;
  }
  if (restrictions !== undefined && !restrictions.every((r) => RESTRICTION_VALUES.has(r))) {
    return "Unknown dietary restriction.";
  }
  return null;
}

// ---------------------------------------------------------------- error messages

function authMessage(error: AuthError): string {
  switch (error.code) {
    case "invalid_credentials":
      // Deliberately doesn't say which was wrong, so accounts can't be discovered.
      return "Incorrect email or password.";
    case "user_already_exists":
    case "email_exists":
      return "An account with this email already exists.";
    case "email_not_confirmed":
      return "Confirm your email address using the link we sent, then log in.";
    case "email_address_invalid":
      return "Enter a valid email address.";
    case "weak_password":
      return error.message; // Supabase explains what the password is missing
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return "Too many attempts. Wait a minute and try again.";
    case "unexpected_failure":
      // The profile trigger rejected the sign-up: almost always a username taken
      // between the availability check and the sign-up.
      return "Couldn't create the account. The username may have just been taken; try another.";
    default:
      return error.message || "Something went wrong. Please try again.";
  }
}

function databaseMessage(error: PostgrestError): string {
  if (error.code === "23505") return "That username is taken.";
  if (error.code === "23514") return "One of the values is outside the allowed range.";
  return error.message || "Something went wrong. Please try again.";
}

const toProfile = (row: ProfileRow): Profile => ({
  username: row.username,
  calorieGoal: row.calorie_goal,
  proteinGoal: row.protein_goal_g,
  restrictions: row.dietary_restrictions,
});

// ---------------------------------------------------------------- accounts

/** Create an account. `needsEmailConfirmation` is true when Supabase's "Confirm email" setting is on. */
export async function register(
  email: string,
  password: string,
  username: string,
): Promise<Result<{ needsEmailConfirmation: boolean }>> {
  email = email.trim();
  username = username.trim();
  const invalid = validateEmail(email) ?? validateUsername(username) ?? validatePassword(password);
  if (invalid) return fail(invalid);

  const supabase = getSupabase();
  const { data: available, error: checkError } = await supabase.rpc("username_available", { candidate: username });
  if (checkError) return fail(databaseMessage(checkError));
  if (!available) return fail("That username is taken.");

  // The username travels as metadata; a database trigger creates the profile row.
  const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { username } } });
  if (error) return fail(authMessage(error));
  // With "Confirm email" on, Supabase hides whether an email is registered: a
  // repeat sign-up "succeeds" but returns a user with no identities.
  if (data.user?.identities?.length === 0) return fail("An account with this email already exists.");
  return ok({ needsEmailConfirmation: data.session === null });
}

/** Log in and return the user's profile. */
export async function logIn(email: string, password: string): Promise<Result<Profile>> {
  email = email.trim();
  if (validateEmail(email) || !password) return fail("Incorrect email or password.");

  const { error } = await getSupabase().auth.signInWithPassword({ email, password });
  if (error) return fail(authMessage(error));
  return getProfile();
}

export async function logOut(): Promise<Result> {
  const { error } = await getSupabase().auth.signOut();
  return error ? fail(authMessage(error)) : ok(undefined);
}

/** True if a user is logged in. Sessions persist across page reloads. */
export async function isLoggedIn(): Promise<boolean> {
  const { data } = await getSupabase().auth.getSession();
  return data.session !== null;
}

/** Calls `callback` whenever the user logs in or out. Returns an unsubscribe function. */
export function onAuthChange(callback: (loggedIn: boolean) => void): () => void {
  const { data } = getSupabase().auth.onAuthStateChange((_event, session) => callback(session !== null));
  return () => data.subscription.unsubscribe();
}

// ---------------------------------------------------------------- preferences

/** The logged-in user's username and saved preferences. */
export async function getProfile(): Promise<Result<Profile>> {
  const supabase = getSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return fail("You're not logged in.");

  const { data, error } = await supabase.from("profiles").select(PROFILE_COLUMNS).eq("id", auth.user.id).single();
  if (error) return fail(databaseMessage(error));
  return ok(toProfile(data as ProfileRow));
}

/** Save any of the user's preferences; omitted fields are left unchanged. Returns the updated profile. */
export async function savePreferences(changes: Partial<SavedPreferences>): Promise<Result<Profile>> {
  const invalid = validatePreferences(changes);
  if (invalid) return fail(invalid);

  const supabase = getSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return fail("You're not logged in.");

  const row: Partial<ProfileRow> = {};
  if (changes.calorieGoal !== undefined) row.calorie_goal = changes.calorieGoal;
  if (changes.proteinGoal !== undefined) row.protein_goal_g = changes.proteinGoal;
  if (changes.restrictions !== undefined) row.dietary_restrictions = [...new Set(changes.restrictions)];

  const { data, error } = await supabase
    .from("profiles")
    .update(row)
    .eq("id", auth.user.id)
    .select(PROFILE_COLUMNS)
    .single();
  if (error) return fail(databaseMessage(error));
  return ok(toProfile(data as ProfileRow));
}
