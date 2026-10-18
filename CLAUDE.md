# CLAUDE.md

Technica 2026 hackathon project **NourishUMD** (placeholder name): recommends UMD dining hall meals that fit a student's goals and shows each one as a plated meal.

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
  app/                     # React + Vite + TS app (from two Figma Make prototypes)
    src/App.tsx            # top-level flow: picks onboarding screen vs main screen from session + profile
    src/MainScreen.tsx     # main screen: period picker, hall tabs, plate, progress, Personalize
    src/onboarding/        # Welcome, SignUp (step 1), LogIn, Goals (step 2), parts.tsx, onboarding.css
    src/components/        # Icon, Logo, PlateView, DailyProgress, MealNutritionChart, PreferencesPanel
    src/lib/               # api.ts (meals fetch), auth.ts + profile.ts (FAKE, Supabase-shaped), router.ts,
                           # nutrition.ts (nutrients, goals, restrictions, defaults), types.ts
    src/assets/onboarding/ # welcome-screen images from the onboarding Make file
    src/styles.css         # main screen styles + all app design tokens
  plate-visualizer/        # standalone plate component (vanilla JS); source of truth for the plate
    plate-visualizer.js/.css, food-assets.js, sample-meals.js, assets/food/*.webp, index.html (demo)
  tools/process_food_images.py   # raw food photos → transparent WebP cut-outs
```

**Ownership:** the Python files other than `server.py` belong to the backend teammate. Don't edit them for frontend work; adapt in `server.py` instead.

**Placeholder branding:** the "NourishUMD" name and bowl logo (`components/Logo.tsx`, from the onboarding design) are placeholders, used in the onboarding and the main screen header. Don't polish them or treat them as final.

## Onboarding & accounts

Flow (`App.tsx` decides the screen; `lib/router.ts` keeps the URL in sync with the History API, no router library):

| Path | Screen | Shown when |
|---|---|---|
| `/` | Welcome | signed out |
| `/signup` | Create account (step 1 of 2) | signed out, or signed in but not onboarded (via Back from goals) |
| `/login` | Log in | signed out |
| `/onboarding/goals` | Restrictions + calorie/protein goals (step 2 of 2) | signed in, `profile.onboarded === false` |
| `/meals` | `MainScreen` | signed in and onboarded |

Any other path redirects to the allowed screen. Wiring that isn't in either Figma file:
- Create account → signs up, creates the profile → goals. Back from goals returns to sign-up with username and email kept. Resubmitting with the same email doesn't create a second account.
- Goals → Continue saves `onboarded: true` and the goals/restrictions → `/meals`. New accounts start with 0 intake.
- Log in → `/meals`, or the goals step if that account never finished onboarding.
- **Log out** is in the Personalize panel (the user's choice). It returns to Welcome. Personalize edits save to the profile.
- Sign-up asks for **Username** (not full name), email, password and confirm password. The username is saved as `user_metadata.username` and `profile.username`.
- **No hard-coded rules or messages.** Every client-side rule (currently: username required, email pattern, **password ≥ 8**, passwords match, goals > 0) and every message lives in `lib/authConfig.ts` (`DEFAULT_AUTH_CONFIG`). Screens read them via `useAuthConfig()`. The backend will own these later: make `loadAuthConfig()` fetch them and merge over the defaults. Don't add literal rules or error strings to screens.
- Errors from the auth service are shown **as the service sends them** (`error.message`). Only `error.code` is used, through `errorFields` in the config, to pick the field (`user_already_exists` → email, `weak_password` → password, …), and the rest show below the form. Don't match on message text. The fake service uses Supabase's codes and messages.
- Client-side errors show after the first submit.

**Demo mode is ON by default** (`lib/demo.ts`, `DEMO_MODE`), so the demo needs no typing:
- Every page load signs out and starts at Welcome, even on `/meals`. Saved accounts and settings are kept.
- Sign up skips validation, and blank fields get demo values (a fresh `demo-…@nourishumd.demo` email each time).
- Log in with blank or wrong credentials opens a shared, already-onboarded demo account and goes straight to `/meals`.
- Correct credentials still log into that account.
- Any account whose "intake so far" is all zero shows sample intake (`DEMO_INTAKE`: 720 cal, 42 g protein, …) so Daily progress isn't empty. It's applied on sign-up, demo log-in and profile load (`withDemoIntake`). With demo mode off, new accounts start at 0.

The real validation and auth paths are untouched, only bypassed behind `DEMO_MODE` checks in `SignUp.tsx`, `LogIn.tsx` and `App.tsx`. Turn it off when the backend is ready: set the constant to `false` or run `VITE_DEMO_MODE=false npm run dev`. Don't remove the real code paths.

**Auth is FAKE for now; a teammate will add Supabase.** `lib/auth.ts` exports `auth` with the same API as `supabase.auth` (`signUp`, `signInWithPassword`, `signOut`, `getSession`, `onAuthStateChange`, `{ data, error }` results). `lib/profile.ts` (`getProfile`, `upsertProfile`) mimics a `profiles` table row `{ id, username, onboarded, personalization }`. Profiles saved before the rename (`full_name`) still load. Both store data in localStorage (`nourish:*` keys) and have comments explaining how to swap in Supabase. Screens must only use these two modules for accounts. Don't read localStorage directly.

The onboarding prototype is desktop-only. The phone layout (single column under 900px, stacked goal cards under 760px) is ours.

## Data flow

1. `MainScreen.tsx` calls `fetchMeals(period, personalization)` (personalization comes from the signed-in user's profile) → `POST /api/meals` with `{ period, restrictions, goals, consumed }` (goals and consumed cover all 7 nutrients).
2. `server.py` builds `meal_recommender.UserSettings`. Calorie/protein go in directly. What's left of carbs, fiber, sodium and sugar is divided by the meals remaining today and passed as `carb_max_g`, `fiber_min_g`, `sodium_limit_mg` and `sugar_limit_g`. **Fat has no recommender setting, so it's display only.** Results are cached per request body, since one run takes 1.5–3.5s.
3. The response is `generate_meals()` output: `{ source_menu_date, meals: [{ dining_hall, meal_option, meal_name, items[], meal_macros_total }] }`. Items have `name`, `generic_name`, `serving_g` and `macros`, with no `servings` (the plate defaults to 1).
4. Every hall has **exactly two** meals (`meal_option` 1 and 2, `MEALS_PER_HALL` in the recommender, `OPTIONS` in `App.tsx`). The design's round arrows and two dots switch between them without looping. On option 1 the left arrow is disabled, and on option 2 the right one is (`.arrow-button:disabled` is greyed out). A meal with `items: []` means nothing fit: the arrow and dot that lead to it are disabled too.

5. **Daily progress** bars show intake so far (solid, from Personalize) plus the meal on screen as a lighter segment, with labels like "720 + 590 / 2,000". The preview follows period, hall and option changes and isn't saved anywhere. Bars cap at 100%, with no special over-goal styling yet.

Mappings to keep in sync:
- Hall names in `MainScreen.tsx` `HALLS` must match `meal_recommender.HALL_NAMES` ("Yahentamitsi Dining Hall" is shown as "Yahentamitsi").
- Restriction labels map to `DIETARY_OPTIONS` values in `nutrition.ts` `RESTRICTIONS`, using the onboarding wording on both screens (e.g. "Halal friendly" → `halal_friendly`, "Lactose intolerant" → `lactose_intolerant`).
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

**App tokens** live in `frontend/app/src/styles.css` `:root`, from the main-screen Make prototype. The onboarding prototype's near-identical colors (ink `#262a25`, muted `#747970`) were mapped onto `--ink`/`--ink-soft`, and its extra colors were added as `--pink-ink`, `--pink-pale`, `--pink-wash`, `--sage-pale`, `--sage-wash`, `--sage-line`, `--surface-warm`, `--track-warm`, `--field-border`, `--placeholder`, `--link`, `--error` and `--error-border`:
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
- Personalize number fields (`NumberField` in `PreferencesPanel.tsx`) are `type="text" inputMode="decimal"`, not `type="number"`. They keep the typed text while editing, select all on focus, strip leading zeros and non-numeric characters, and treat empty as 0. Use the same approach for any new numeric input.
- Use native `<button type="button">` with `aria-pressed` for toggles (tabs, chips, periods) and `aria-label` on icon-only buttons.
- **`PlateView`** wraps the vanilla plate component: it imports `food-assets.js`/`plate-visualizer.js` for their `window.*` side effects, rewrites `FOOD_ASSETS[*].src` to Vite-built URLs (`import.meta.glob`), and mounts with `assetBase: ""`. Change plate behavior in `frontend/plate-visualizer/`, not in the wrapper. That folder must keep working standalone (`index.html`).
- The plate re-mounts per meal (`key` on `.visualizer-shell`) to replay the `plate-enter` animation. It switches itself to numbered pins plus a legend below 620px container width.
- There's no Storybook. Use `npm run dev` for the app and `frontend/plate-visualizer/index.html` for the plate alone.

## Styling approach

- Plain global CSS with descriptive kebab-case classes, kept from the Make prototype (`.meal-card`, `.hall-tab.active`, `.progress-fill.pink`). Plate classes use the `.pv-` prefix. State uses `.active`/`.selected` classes and `aria-*`.
- Onboarding classes use the **`.ob-` prefix** (`onboarding/onboarding.css`), because both designs define `.primary-button`/`.choice-chip` with different looks. Main-screen page rules are scoped to `.app-shell` (e.g. `.app-shell > main`) so they don't leak into onboarding. Keep new global element selectors out of `styles.css`.
- The onboarding prototype is Tailwind-only. Its utilities were translated into the `.ob-*` rules, and where a Tailwind utility lost to the prototype's own CSS (e.g. the goals panel's `max-w-[760px]`, the Continue button's `ml-auto`), we match what it actually renders.
- Responsive: one `@media (max-width: 760px)` block at the end of `styles.css`, plus `clamp()` and grid. On mobile the design hides Personalize. We keep it as an icon-only button so it stays reachable.
- Loading: `.visualizer-area.is-loading` dims the plate, and `aria-busy` is set on `.meal-card`.

## Assets & icons

- **Food images:** `frontend/plate-visualizer/assets/food/<generic-name>.webp` (transparent WebP, ≤900px, made by `frontend/tools/process_food_images.py`). Each item's `generic_name` (from `food_categories.toml`) is normalized to kebab-case, so "plant-based chicken" becomes `plant-based-chicken`, and looked up in `food-assets.js`. Missing images render a placeholder disc, which is expected for now. The user is supplying images for the remaining generic names. To add one: process it, then add an entry to `food-assets.js` (`src`, `scale`, `role`, `kind`, `repeat`, `rotate`).
- The Make prototype's `public/plates/*.png` are static screenshots of the plate component. **Don't use them**, use `PlateView`.
- **Icons:** inline stroke SVGs in `src/components/Icon.tsx` (24×24 viewBox, `currentColor`, stroke 1.8 unless a path overrides it), named in kebab-case (`arrow-left`, `arrow-right`, `sliders`, `leaf`, `x`, `check`, `eye`, `eye-off`). Add new icons there. Don't add an icon library.
- **Onboarding images:** `src/assets/onboarding/food-reference.png` and `foliage-garland.png`, imported in `Welcome.tsx`, used as-is from the Make file. The foliage PNG has no transparency and relies on `mix-blend-mode: multiply`.
- No CDN. Vite fingerprints imported assets at build time.

## Figma → code workflow

- Make files (`figma.com/make/<key>/…`): call `get_design_context` with nodeId `0:1`, then read `src/App.tsx` and `src/index.css` via the MCP resources. Load the figma-design-to-code skill first.
- Port Make React code into `frontend/app` following the conventions above: plain CSS (drop Tailwind), existing tokens and components, `PlateView` for any plate, real API data in place of hardcoded arrays.
- Make files may return no screenshot. To get a visual target, run the Make source (with Tailwind) in a scratch folder and screenshot it. Don't add it to the repo.
- Check the result in a browser at ~1440px and ~390px wide against the design.
- WSL gotcha: a long-running `vite` dev server can miss file edits and serve stale modules. If a change doesn't show up, `touch` the file or restart `npm run dev`.
