import type { MealsResponse } from "./types";
import { goalsOf, type Personalization } from "./nutrition";

export type MealPeriod = "Breakfast" | "Lunch" | "Dinner";

export async function fetchMeals(period: MealPeriod, p: Personalization, signal?: AbortSignal): Promise<MealsResponse> {
  const res = await fetch("/api/meals", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ period, restrictions: p.restrictions, goals: goalsOf(p), consumed: p.consumed }),
    signal,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Server error ${res.status}`);
  }
  return res.json();
}
