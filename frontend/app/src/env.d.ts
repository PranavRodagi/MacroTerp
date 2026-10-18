/// <reference types="vite/client" />

// Variables read from frontend/app/.env.local (see .env.example).
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly VITE_DEMO_MODE?: string; // "true" or "false"; see lib/demo.ts
}
