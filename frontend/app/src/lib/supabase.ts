// The Supabase client, or null when frontend/app/.env.local isn't filled in.
// lib/auth.ts and lib/profile.ts use Supabase when it's set, and their local
// fakes (fakeAuth.ts, fakeProfile.ts) when it isn't, so the app runs either way.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const configured = Boolean(url && key && !url.includes("your-project-ref"));

export const supabase: SupabaseClient | null = configured ? createClient(url!, key!) : null;
