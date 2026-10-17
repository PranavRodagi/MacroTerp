// Shapes returned by POST /api/meals (meal_recommender.generate_meals).

export type Macros = {
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  sat_fat_g: number | null;
  fiber_g: number | null;
  sugar_g: number | null;
  sodium_mg: number | null;
  cholesterol_mg: number | null;
};

export type MealItem = {
  name: string;
  generic_name: string; // picks the plate image, see plate-visualizer/food-assets.js
  serving_g: number | null;
  servings?: number;
  macros: Macros;
};

export type Meal = {
  dining_hall: string;
  meal_option: number;
  meal_name: string;
  items: MealItem[];
  total_serving_g: number | null;
  meal_macros_total: Macros;
};

export type MealsResponse = {
  source_menu_date: string;
  meals: Meal[];
};
