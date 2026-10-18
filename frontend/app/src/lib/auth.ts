// FAKE auth for now. Accounts live in this browser's localStorage.
//
// The exported `auth` object mirrors the subset of supabase-js `supabase.auth` we use,
// with the same arguments and `{ data, error }` results. To switch to Supabase,
// replace this file with:
//
//   import { createClient } from "@supabase/supabase-js";
//   export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);
//   export const auth = supabase.auth;
//   export type { User, Session } from "@supabase/supabase-js";
//
// Screens only use: signUp, signInWithPassword, signOut, getSession, onAuthStateChange,
// and read `user.id`, `user.email` and `user.user_metadata.username`.
// Errors carry Supabase's `code` (e.g. user_already_exists, invalid_credentials, weak_password);
// screens show `message` as-is and use `code` only to pick the form field.

import { DEFAULT_AUTH_CONFIG } from "./authConfig";

export type User = { id: string; email: string; user_metadata: { username?: string } };
export type Session = { user: User };
export type AuthError = { message: string; code?: string };
type AuthResult = { data: { user: User | null; session: Session | null }; error: AuthError | null };
type AuthEvent = "SIGNED_IN" | "SIGNED_OUT";

const USERS_KEY = "nourish:fake-users";
const SESSION_KEY = "nourish:fake-session";
type StoredUser = User & { passwordHash: string };

const listeners = new Set<(event: AuthEvent, session: Session | null) => void>();

function read<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) || "null") ?? fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: the session just won't persist */
  }
}

// Not real security; it just avoids keeping plain-text passwords in localStorage.
async function hash(password: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(password));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

const delay = () => new Promise((r) => setTimeout(r, 250)); // feel like a network call
const publicUser = ({ passwordHash: _, ...user }: StoredUser): User => user;

function startSession(user: User): AuthResult {
  const session = { user };
  write(SESSION_KEY, session);
  listeners.forEach((fn) => fn("SIGNED_IN", session));
  return { data: { user, session }, error: null };
}

const fail = (code: string, message: string): AuthResult => ({ data: { user: null, session: null }, error: { code, message } });

export const auth = {
  async signUp({ email, password, options }: { email: string; password: string; options?: { data?: { username?: string } } }) {
    await delay();
    const users = read<Record<string, StoredUser>>(USERS_KEY, {});
    const key = email.trim().toLowerCase();
    // The fake service enforces the same rule the form uses; the real backend will have its own.
    const min = DEFAULT_AUTH_CONFIG.rules.passwordMinLength;
    if (users[key]) return fail("user_already_exists", "User already registered");
    if (password.length < min) return fail("weak_password", `Password should be at least ${min} characters.`);
    const user: StoredUser = {
      id: crypto.randomUUID(),
      email: key,
      user_metadata: { username: options?.data?.username },
      passwordHash: await hash(password),
    };
    write(USERS_KEY, { ...users, [key]: user });
    return startSession(publicUser(user));
  },

  async signInWithPassword({ email, password }: { email: string; password: string }) {
    await delay();
    const user = read<Record<string, StoredUser>>(USERS_KEY, {})[email.trim().toLowerCase()];
    if (!user || user.passwordHash !== (await hash(password))) return fail("invalid_credentials", "Invalid login credentials");
    return startSession(publicUser(user));
  },

  async signOut() {
    write(SESSION_KEY, null);
    listeners.forEach((fn) => fn("SIGNED_OUT", null));
    return { error: null };
  },

  async getSession() {
    return { data: { session: read<Session | null>(SESSION_KEY, null) }, error: null };
  },

  onAuthStateChange(callback: (event: AuthEvent, session: Session | null) => void) {
    listeners.add(callback);
    const unsubscribe = () => {
      listeners.delete(callback);
    };
    return { data: { subscription: { unsubscribe } } };
  },
};
