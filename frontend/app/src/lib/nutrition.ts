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
// Order and wording follow the onboarding design; Personalize uses the same list.
export const RESTRICTIONS: { label: string; value: string }[] = [
  { label: "Vegan", value: "vegan" },
  { label: "Vegetarian", value: "vegetarian" },
  { label: "Lactose intolerant", value: "lactose_intolerant" },
  { label: "Gluten free", value: "gluten_free" },
  { label: "Halal friendly", value: "halal_friendly" },
  { label: "Nut allergy", value: "nut_allergy" },
];

export type Personalization = {
  calorieGoal: number;
  proteinGoal: number;
  consumed: Totals;
  restrictions: string[]; // DIETARY_OPTIONS values
};

// Starting values for a new account (goals match the onboarding design's defaults).
export const DEFAULT_PERSONALIZATION: Personalization = {
  calorieGoal: 2000,
  proteinGoal: 150,
  consumed: { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, sodium_mg: 0, sugar_g: 0 },
  restrictions: [],
};

export const goalsOf = (p: Personalization): Totals => ({
  calories: p.calorieGoal,
  protein_g: p.proteinGoal,
  ...FIXED_GOALS,
});
