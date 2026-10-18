// FAKE auth, used when Supabase isn't configured (see lib/auth.ts). Accounts live in
// this browser's localStorage. Mirrors supabase-js `supabase.auth`: same arguments,
// `{ data, error }` results, and Supabase's error codes and messages.

import { DEFAULT_AUTH_CONFIG } from "./authConfig";
import type { AuthEvent, AuthResult, AuthService, Session, User } from "./auth";

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

export const fakeAuth: AuthService = {
  async signUp({ email, password, options }) {
    await delay();
    const users = read<Record<string, StoredUser>>(USERS_KEY, {});
    const key = email.trim().toLowerCase();
    // The fake service enforces the same rule the form uses; Supabase has its own.
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

  async signInWithPassword({ email, password }) {
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

  onAuthStateChange(callback) {
    listeners.add(callback);
    const unsubscribe = () => {
      listeners.delete(callback);
    };
    return { data: { subscription: { unsubscribe } } };
  },
};
