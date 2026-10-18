// Shared Supabase client. Created on first use, so the app still runs before
// Supabase is configured; only account features need it.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!client) {
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) {
      throw new Error(
        "Supabase isn't configured: copy frontend/app/.env.example to .env.local and fill in its values.",
      );
    }
    client = createClient(url, key);
  }
  return client;
}
