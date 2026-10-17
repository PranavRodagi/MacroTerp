import json
from pathlib import Path
from typing import Any

import meal_recommender as recommender

# User settings passed to the recommender.
settings = recommender.UserSettings(
    daily_calorie_goal=2500.0,
    daily_protein_goal_g=160.0,
    calories_consumed=600.0,
    protein_consumed_g=30.0,
    current_meal="Lunch",
    dietary_restrictions={"vegetarian"},
    sodium_limit_mg=1000.0,
    sugar_limit_g=25.0,
    sat_fat_limit_g=8.0,
    carb_min_g=15.0,
    carb_max_g=100.0,
    fiber_min_g=3.0,
    max_items_per_meal=6,
)

# Load the input menu JSON file.
menu_path = Path("menu.json")

with menu_path.open("r", encoding="utf-8") as file:
    menu_data: dict[str, Any] = json.load(file)

# Generate one meal for each dining hall.
meals_data = recommender.generate_meals(menu_data, settings)

# Save the returned data as a formatted JSON file.
output_path = Path("generated_meals.json")

with output_path.open("w", encoding="utf-8") as file:
    json.dump(meals_data, file, indent=2, ensure_ascii=False)

print(f"Generated meals saved to: {output_path.resolve()}")
print(json.dumps(meals_data, indent=2, ensure_ascii=False))
