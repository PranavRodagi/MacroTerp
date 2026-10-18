// Auth for the app: Supabase Auth when it's configured (lib/supabase.ts), otherwise a
// local fake (lib/fakeAuth.ts) so the app still runs without a backend.
//
// Both implement AuthService, the subset of supabase-js `supabase.auth` the app uses,
// with the same arguments and `{ data, error }` results. Screens only use: signUp,
// signInWithPassword, signOut, getSession, onAuthStateChange, and read `user.id`,
// `user.email` and `user.user_metadata.username`.
// Errors carry Supabase's `code` (e.g. user_already_exists, invalid_credentials, weak_password);
// screens show `message` as-is and use `code` only to pick the form field.

import type { AuthChangeEvent, Session as SupabaseSession, SupabaseClient, User as SupabaseUser } from "@supabase/supabase-js";
import { fakeAuth } from "./fakeAuth";
import { supabase } from "./supabase";

export type User = { id: string; email: string; user_metadata: { username?: string } };
export type Session = { user: User };
export type AuthError = { message: string; code?: string };
export type AuthEvent = AuthChangeEvent;
export type AuthResult = { data: { user: User | null; session: Session | null }; error: AuthError | null };

export type AuthService = {
  signUp(credentials: { email: string; password: string; options?: { data?: { username?: string } } }): Promise<AuthResult>;
  signInWithPassword(credentials: { email: string; password: string }): Promise<AuthResult>;
  signOut(): Promise<{ error: AuthError | null }>;
  getSession(): Promise<{ data: { session: Session | null }; error: AuthError | null }>;
  onAuthStateChange(callback: (event: AuthEvent, session: Session | null) => void): {
    data: { subscription: { unsubscribe: () => void } };
  };
};

// ---------------------------------------------------------------- Supabase

const toUser = (user: SupabaseUser): User => ({
  id: user.id,
  email: user.email ?? "",
  user_metadata: { username: typeof user.user_metadata.username === "string" ? user.user_metadata.username : undefined },
});

const toSession = (session: SupabaseSession | null): Session | null => (session ? { user: toUser(session.user) } : null);

const toError = (error: { message: string; code?: string }): AuthError => ({ message: error.message, code: error.code });

const failed = (error: AuthError): AuthResult => ({ data: { user: null, session: null }, error });

export function supabaseAuth(client: SupabaseClient): AuthService {
  return {
    async signUp(credentials) {
      const { data, error } = await client.auth.signUp(credentials);
      if (error) return failed(toError(error));
      // With "Confirm email" on, Supabase doesn't reveal that an email is registered:
      // a repeat sign-up "succeeds" with no identities. Report it the way Supabase
      // does when confirmation is off.
      if (data.user?.identities?.length === 0) return failed({ code: "user_already_exists", message: "User already registered" });
      return { data: { user: data.user && toUser(data.user), session: toSession(data.session) }, error: null };
    },

    async signInWithPassword(credentials) {
      const { data, error } = await client.auth.signInWithPassword(credentials);
      if (error) return failed(toError(error));
      return { data: { user: toUser(data.user), session: toSession(data.session) }, error: null };
    },

    async signOut() {
      const { error } = await client.auth.signOut();
      return { error: error && toError(error) };
    },

    async getSession() {
      const { data, error } = await client.auth.getSession();
      return { data: { session: toSession(data.session) }, error: error && toError(error) };
    },

    onAuthStateChange(callback) {
      return client.auth.onAuthStateChange((event, session) => callback(event, toSession(session)));
    },
  };
}

export const auth: AuthService = supabase ? supabaseAuth(supabase) : fakeAuth;
