# CLAUDE.md

Technica 2026 hackathon project **Meal Maker**: recommends UMD dining hall meals that fit a student's goals and shows each one as a plated meal.

## Running it

```bash
python server.py                       # meal API on :8000 (stdlib only; reads menu.json)
cd frontend/app && npm install && npm run dev   # app on :5173, proxies /api → :8000
```

Backend data refresh: `pip install -r requirements.txt`, then `python scraper.py scrape` and `python scraper.py export --date YYYY-MM-DD` (writes `menu_<date>.json`; `server.py` reads `menu.json`, so copy or rename it).

## Project structure

```
scraper.py                 # (backend teammate) scrapes nutrition.umd.edu → SQLite cache → menu JSON
meal_recommender.py        # (backend teammate) generate_meals(menu, UserSettings) → 2 meals per hall
meal_recommender_runner.py # (backend teammate) CLI example that writes meals.json
food_categories.toml       # menu item name → generic_name rules (drives plate images)
menu.json / meals.json     # sample scraper output / sample recommender output
server.py                  # JSON API wrapping meal_recommender for the frontend (POST /api/meals)
frontend/
  app/                     # React + Vite + TS main screen (from the Figma Make prototype)
    src/App.tsx            # main screen: period picker, hall tabs, plate, progress, Personalize
    src/components/        # Icon, PlateView, DailyProgress, MealNutritionChart, PreferencesPanel
    src/lib/               # api.ts (fetch), nutrition.ts (nutrients, goals, restrictions, storage), types.ts
    src/styles.css         # all app styles + app design tokens
  plate-visualizer/        # standalone plate component (vanilla JS); source of truth for the plate
    plate-visualizer.js/.css, food-assets.js, sample-meals.js, assets/food/*.webp, index.html (demo)
  tools/process_food_images.py   # raw food photos → transparent WebP cut-outs
```

**Ownership:** the Python files other than `server.py` belong to the backend teammate. Don't edit them for frontend work; adapt in `server.py` instead.

**Placeholder branding:** the "Meal Maker" name and leaf logo in the header (`.brand` in `App.tsx`) are placeholders. Don't polish them or reuse them elsewhere as final branding.

**Scope:** `frontend/app` is only the main screen. Onboarding screens come later from a separate Figma Make prototype and will feed the same `Personalization` values (`src/lib/nutrition.ts`), which are currently set in the Personalize panel and saved in `localStorage`.

## Data flow

1. `App.tsx` calls `fetchMeals(period, personalization)` → `POST /api/meals` with `{ period, restrictions, goals, consumed }` (goals and consumed cover all 7 nutrients).
2. `server.py` builds `meal_recommender.UserSettings`. Calorie/protein go in directly. What's left of carbs, fiber, sodium and sugar is divided by the meals remaining today and passed as `carb_max_g`, `fiber_min_g`, `sodium_limit_mg` and `sugar_limit_g`. **Fat has no recommender setting, so it's display only.** Results are cached per request body, since one run takes 1.5–3.5s.
3. The response is `generate_meals()` output: `{ source_menu_date, meals: [{ dining_hall, meal_option, meal_name, items[], meal_macros_total }] }`. Items have `name`, `generic_name`, `serving_g` and `macros`, with no `servings` (the plate defaults to 1).
4. Every hall has **exactly two** meals (`meal_option` 1 and 2, `MEALS_PER_HALL` in the recommender, `OPTIONS` in `App.tsx`). The design's round arrows and two dots switch between them without looping. On option 1 the left arrow is disabled, and on option 2 the right one is (`.arrow-button:disabled` is greyed out). A meal with `items: []` means nothing fit: the arrow and dot that lead to it are disabled too.

Mappings to keep in sync:
- Hall names in `App.tsx` `HALLS` must match `meal_recommender.HALL_NAMES` ("Yahentamitsi Dining Hall" is shown as "Yahentamitsi").
- Restriction labels map to `DIETARY_OPTIONS` values in `nutrition.ts` `RESTRICTIONS` (e.g. Halal → `halal_friendly`).
- The 5 non-calorie/protein goals are fixed in `FIXED_GOALS` (240g carbs, 65g fat, 28g fiber, 2300mg sodium, 50g sugar). Only intake is editable.
- `AVAILABLE_UNTIL` times are placeholders from the design. The default period comes from the clock using those same times.

## Frameworks & build

| Concern | What's used |
|---|---|
| UI | React 19 + TypeScript in `frontend/app` |
| Build | Vite 8 (`npm run dev`, `npm run build` = `tsc --noEmit && vite build`) |
| Styling | Plain CSS in `src/styles.css`. **No Tailwind** (the Make prototype imports it but uses none of it) and no CSS Modules or CSS-in-JS |
| Plate | Vanilla JS component in `frontend/plate-visualizer`, mounted via `PlateView.tsx` |
| Fonts | Noto Serif (Google Fonts `<link>` in `index.html`). Arial (`--font-ui`) for small numeric labels |
| API | Python 3 stdlib `http.server` (`server.py`). Scraper needs `requests`, `beautifulsoup4` |

## Design tokens

There are two token sets, both CSS custom properties with no build-time pipeline:

**App tokens** live in `frontend/app/src/styles.css` `:root`, from the Make prototype:
```css
--pink: #e58f83;  --pink-deep: #bd6258;  --pink-soft: #fff1ed;   /* primary, active, CTA */
--sage: #a9bf9d;  --sage-deep: #617957;  --sage-soft: #f0f5ed;   /* selected chips, notes */
--blue: #9dbcd9;  --blue-soft: #eff6fb;
--coral / --teal / --gold / --lavender                           /* extra progress-bar colors */
--ink: #283029;  --ink-soft: #657067;  --ink-faint: #9a9f9a;
--cream: #f5f5f7;  --line: #e9e5dd;  --line-soft: #f0ede7;  --track: #f0eee9;  --surface-muted: #fafafa;
--font-serif: "Noto Serif", Georgia, serif;  --font-ui: Arial, sans-serif;
```

**Plate tokens** (`--pv-*`) live in `frontend/plate-visualizer/plate-visualizer.css`: pink/sage/blue at steps 50/200/400/700 (700 = the text-safe step), plus `--pv-protein/carbs/fat`.

Rules:
- Macro colors are always **protein = pink, carbs = sage, fat = blue**, on the plate and in the "Nutrition split" donut. The Make prototype had carbs and fat swapped in the donut; that was fixed on purpose.
- Daily progress bars use the per-nutrient colors in `NUTRIENTS` (`nutrition.ts`): pink, coral, gold, sage, teal, blue and lavender.
- Map Figma colors to an existing token before adding one. New app tokens go in `styles.css` `:root`. Some one-off greys/hexes from the Make CSS remain inline (e.g. `#ddd9d0` dots, `#80aa6e` availability dot).
- There's no spacing or type scale. Sizes are literal px or `clamp()`, copied from the design.

## Components

- Function components with props typed inline. Shared types live in `src/lib/types.ts` (API shapes) and `nutrition.ts` (settings).
- Use native `<button type="button">` with `aria-pressed` for toggles (tabs, chips, periods) and `aria-label` on icon-only buttons.
- **`PlateView`** wraps the vanilla plate component: it imports `food-assets.js`/`plate-visualizer.js` for their `window.*` side effects, rewrites `FOOD_ASSETS[*].src` to Vite-built URLs (`import.meta.glob`), and mounts with `assetBase: ""`. Change plate behavior in `frontend/plate-visualizer/`, not in the wrapper. That folder must keep working standalone (`index.html`).
- The plate re-mounts per meal (`key` on `.visualizer-shell`) to replay the `plate-enter` animation. It switches itself to numbered pins plus a legend below 620px container width.
- There's no Storybook. Use `npm run dev` for the app and `frontend/plate-visualizer/index.html` for the plate alone.

## Styling approach

- Plain global CSS with descriptive kebab-case classes, kept from the Make prototype (`.meal-card`, `.hall-tab.active`, `.progress-fill.pink`). Plate classes use the `.pv-` prefix. State uses `.active`/`.selected` classes and `aria-*`.
- Responsive: one `@media (max-width: 760px)` block at the end of `styles.css`, plus `clamp()` and grid. On mobile the design hides Personalize. We keep it as an icon-only button so it stays reachable.
- Loading: `.visualizer-area.is-loading` dims the plate, and `aria-busy` is set on `.meal-card`.

## Assets & icons

- **Food images:** `frontend/plate-visualizer/assets/food/<generic-name>.webp` (transparent WebP, ≤900px, made by `frontend/tools/process_food_images.py`). Each item's `generic_name` (from `food_categories.toml`) is normalized to kebab-case, so "plant-based chicken" becomes `plant-based-chicken`, and looked up in `food-assets.js`. Missing images render a placeholder disc, which is expected for now. The user is supplying images for the remaining generic names. To add one: process it, then add an entry to `food-assets.js` (`src`, `scale`, `role`, `kind`, `repeat`, `rotate`).
- The Make prototype's `public/plates/*.png` are static screenshots of the plate component. **Don't use them**, use `PlateView`.
- **Icons:** inline stroke SVGs in `src/components/Icon.tsx` (24×24 viewBox, `currentColor`, stroke 1.8), named in kebab-case (`arrow-left`, `sliders`, `leaf`, `x`). Add new icons there. Don't add an icon library.
- No CDN. Vite fingerprints imported assets at build time.

## Figma → code workflow

- Make files (`figma.com/make/<key>/…`): call `get_design_context` with nodeId `0:1`, then read `src/App.tsx` and `src/index.css` via the MCP resources. Load the figma-design-to-code skill first.
- Port Make React code into `frontend/app` following the conventions above: plain CSS (drop Tailwind), existing tokens and components, `PlateView` for any plate, real API data in place of hardcoded arrays.
- Check the result in a browser at ~1440px and ~390px wide against the design.
