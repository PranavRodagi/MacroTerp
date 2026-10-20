// Each user's generated meals for today, so they aren't regenerated on every visit:
// the Supabase `daily_meals` table when Supabase is configured (supabase/migrations/003),
// otherwise localStorage. A saved result is reused only on the same day, for the same
// period and the exact same request (goals, restrictions, intake).
import type { MealsResponse } from "./types";
import { supabase } from "./supabase";

export type MealCache = {
  get(userId: string, day: string, period: string, requestKey: string): Promise<MealsResponse | null>;
  put(userId: string, day: string, period: string, requestKey: string, meals: MealsResponse): Promise<void>;
};

// Today in UMD's time zone, as YYYY-MM-DD (the menu's date is UMD's too).
export const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });

// ---------------------------------------------------------------- Supabase

const supabaseCache = (client: NonNullable<typeof supabase>): MealCache => ({
  async get(userId, day, period, requestKey) {
    const { data, error } = await client
      .from("daily_meals")
      .select("meals")
      .match({ user_id: userId, day, period, request_key: requestKey })
      .maybeSingle();
    return error || !data ? null : (data.meals as MealsResponse);
  },

  async put(userId, day, period, requestKey, meals) {
    await client.from("daily_meals").upsert({ user_id: userId, day, period, request_key: requestKey, meals });
    // Earlier days' meals are never shown again.
    await client.from("daily_meals").delete().eq("user_id", userId).lt("day", day);
  },
});

// ---------------------------------------------------------------- localStorage

const PREFIX = "macroterp:meals:";
type Saved = { day: string; requestKey: string; meals: MealsResponse };

const localCache: MealCache = {
  async get(userId, day, period, requestKey) {
    try {
      const saved = JSON.parse(localStorage.getItem(`${PREFIX}${userId}:${period}`) || "null") as Saved | null;
      return saved && saved.day === day && saved.requestKey === requestKey ? saved.meals : null;
    } catch {
      return null;
    }
  },

  async put(userId, day, period, requestKey, meals) {
    try {
      localStorage.setItem(`${PREFIX}${userId}:${period}`, JSON.stringify({ day, requestKey, meals } satisfies Saved));
    } catch {
      /* storage full or blocked: just don't cache */
    }
  },
};

export const mealCache: MealCache = supabase ? supabaseCache(supabase) : localCache;
