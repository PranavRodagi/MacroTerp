// Nutrients tracked in "Daily progress", their fixed goals, and the user's saved settings.

export type NutrientKey = "calories" | "protein_g" | "carbs_g" | "fat_g" | "fiber_g" | "sodium_mg" | "sugar_g";
export type Totals = Record<NutrientKey, number>;
export type BarColor = "pink" | "coral" | "gold" | "sage" | "teal" | "blue" | "lavender";

export const NUTRIENTS: { key: NutrientKey; label: string; unit: string; color: BarColor }[] = [
  { key: "calories", label: "Calories", unit: "", color: "pink" },
  { key: "protein_g", label: "Protein", unit: "g", color: "coral" },
  { key: "carbs_g", label: "Carbs", unit: "g", color: "gold" },
  { key: "fat_g", label: "Fat", unit: "g", color: "sage" },
  { key: "fiber_g", label: "Fiber", unit: "g", color: "teal" },
  { key: "sodium_mg", label: "Sodium", unit: "mg", color: "blue" },
  { key: "sugar_g", label: "Sugar", unit: "g", color: "lavender" },
];

// Calories and protein are set by the user; the rest are fixed for now.
export const FIXED_GOALS = { carbs_g: 240, fat_g: 65, fiber_g: 28, sodium_mg: 2300, sugar_g: 50 };

// Label shown in the UI → value meal_recommender.DIETARY_OPTIONS expects.
export const RESTRICTIONS: { label: string; value: string }[] = [
  { label: "Halal", value: "halal_friendly" },
  { label: "Vegetarian", value: "vegetarian" },
  { label: "Vegan", value: "vegan" },
  { label: "Lactose intolerance", value: "lactose_intolerant" },
  { label: "Nut allergy", value: "nut_allergy" },
  { label: "Gluten free", value: "gluten_free" },
];

export type Personalization = {
  calorieGoal: number;
  proteinGoal: number;
  consumed: Totals;
  restrictions: string[]; // DIETARY_OPTIONS values
};

export const DEFAULT_PERSONALIZATION: Personalization = {
  calorieGoal: 1900,
  proteinGoal: 115,
  consumed: { calories: 720, protein_g: 42, carbs_g: 96, fat_g: 31, fiber_g: 14, sodium_mg: 980, sugar_g: 28 },
  restrictions: ["halal_friendly"],
};

export const goalsOf = (p: Personalization): Totals => ({
  calories: p.calorieGoal,
  protein_g: p.proteinGoal,
  ...FIXED_GOALS,
});

// Saved per browser until onboarding provides these values.
const STORAGE_KEY = "meal-maker:personalization";

export function loadPersonalization(): Personalization {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (saved) return { ...DEFAULT_PERSONALIZATION, ...saved, consumed: { ...DEFAULT_PERSONALIZATION.consumed, ...saved.consumed } };
  } catch {
    /* storage unavailable or corrupt: fall back to defaults */
  }
  return DEFAULT_PERSONALIZATION;
}

export function savePersonalization(p: Personalization) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}
