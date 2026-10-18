# Plate Visualizer

Top-down plate with food cut-outs and callout labels. Open `index.html` in a browser (no build or server needed).

## Files
- `plate-visualizer.js` / `.css` – the component. `PlateVisualizer.mount(el).render(meal)`.
- `food-assets.js` – maps `generic_name` → image, size on plate, role, and plate vs. side bowl.
- `sample-meals.js` – the example meals JSON (shape may change).
- `assets/food/` – cleaned-up cut-outs (WebP, transparent).
- `index.html` – preview page; `?meal=1` picks a meal.

## Data it reads
Per item: `name`, `generic_name`, `servings` (optional, default 1), and per-serving `macros.{calories, protein_g, carbs_g, fat_g}`. Labels show totals (per-serving × servings). The demo page also reads `dining_hall`, `meal_name`, `meal_macros_total`.

Extra servings either add overlapping copies of the image (`repeat: true` in `food-assets.js`, e.g. rice, broccoli) or make the one image a bit bigger (e.g. chicken, tofu).

## Palette
Mostly white. Pastel pink (primary), sage (secondary), blue (tertiary): CSS variables at the top of `plate-visualizer.css`. Protein / carbs / fat dots use pink / sage / blue.
An unknown `generic_name` shows a beige placeholder disc instead of breaking.

## Adding a food image
Transparent PNG cut-out (the usual case):
1. Put the PNG in `assets/food/`. If its name doesn't match the `generic_name` in `food_categories.toml`, add it to `RENAMES` in `../tools/process_food_pngs.mjs`.
2. In `../app`, run `npm run food-images` (writes `assets/food/<generic-name>.webp`).
3. Add an entry to `food-assets.js` and adjust `scale` until it looks right next to the others.

Fake checkerboard background or a sprite sheet: use `../tools/process_food_images.py` instead (add the file to `SINGLES` or `SHEETS`, run `python ../tools/process_food_images.py <raw_dir> assets/food`; needs `pillow numpy scipy`).

Below 620px wide, side labels become numbered pins with a legend underneath.
