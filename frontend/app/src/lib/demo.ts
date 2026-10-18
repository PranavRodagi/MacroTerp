// DEMO MODE: lets you click through onboarding without typing anything.
//
// While on:
//   - Every page load starts signed out, at the Welcome screen (accounts and their
//     saved settings are kept; log in again to get back to them).
//   - Sign up and Log in skip form validation; blank fields get demo values.
//   - Log in with blank or unknown credentials signs into a shared demo account
//     that's already onboarded, so it goes straight to the main screen.
//   - Any account whose "intake so far" is all zero shows DEMO_INTAKE instead
//     (applied on sign-up, demo log-in and profile load; saved once you edit Personalize).
// All real validation and auth code is still in place; it's only bypassed.
//
// On by default only when Supabase isn't configured (no frontend/app/.env.local), so
// real accounts aren't signed out or filled with demo sign-ups. Override either way
// with VITE_DEMO_MODE=true or VITE_DEMO_MODE=false (e.g. `VITE_DEMO_MODE=true npm run dev`).
import type { Personalization } from "./nutrition";
import { supabase } from "./supabase";

const demoSetting = import.meta.env.VITE_DEMO_MODE;
export const DEMO_MODE = demoSetting ? demoSetting !== "false" : supabase === null;

export const DEMO_PASSWORD = "demo-password";
export const DEMO_ACCOUNT = { username: "demo_student", email: "demo@macroterp.demo" };

// Sample "intake so far" for demo accounts, so Daily progress isn't empty
// (roughly breakfast eaten; these were the main-screen design's sample values).
export const DEMO_INTAKE = { calories: 720, protein_g: 42, carbs_g: 96, fat_g: 31, fiber_g: 14, sodium_mg: 980, sugar_g: 28 };

export function withDemoIntake<P extends { personalization: Personalization }>(profile: P): P {
  if (!DEMO_MODE || Object.values(profile.personalization.consumed).some((v) => v > 0)) return profile;
  return { ...profile, personalization: { ...profile.personalization, consumed: { ...DEMO_INTAKE } } };
}

// A fresh address for each blank sign-up, so demo sign-ups never collide.
export const demoSignUpEmail = () => `demo-${Date.now().toString(36)}@macroterp.demo`;
// Likewise a fresh username, since usernames must be unique.
export const demoSignUpUsername = () => `demo_${Date.now().toString(36)}`;
