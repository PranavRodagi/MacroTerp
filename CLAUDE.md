# CLAUDE.md

Technica 2026 hackathon project **MacroTerp**: recommends UMD dining hall meals that fit a student's goals and shows each one as a plated meal.

## Running it

```bash
python server.py                       # meal API on :8000 (stdlib only; reads menu.json)
cd frontend/app && npm install && npm run dev   # app on :5173, proxies /api → :8000
```

Accounts use Supabase when `frontend/app/.env.local` has the project URL and publishable key (copy `.env.example`); otherwise the app uses local fakes, so it runs without them. Database setup: run each file in `supabase/migrations/` once, in order, in the Supabase SQL Editor. `account_cli.py` is a temporary terminal client for testing accounts; delete it once it's no longer needed.

**Deploy:** the frontend is on Vercel (project root `frontend/app`, Vite preset) and the API on Render (`render.yaml` Blueprint, free plan, health check `GET /api/health`). `frontend/app/vercel.json` forwards `/api/*` to `https://nourishumd-api.onrender.com` and sends every other path to `index.html`; update that URL if the Render service gets a different one. `server.py` reads `$PORT`. Both deploy from the fork `mahirhalani/MacroTerp-deployment` (Vercel project `technica26`, https://technica26.vercel.app; Render service `nourishumd-api`), not from this repo, until the repo owner grants the access to connect them here. So pushing to `main` doesn't go live: sync the fork (GitHub → Sync fork) to redeploy. The Render service keeps its old `nourishumd-api` name/URL on purpose (renaming means a new service and URL); users never see it. Supabase keys go in Vercel's environment variables (they're read at build time). Render's free plan sleeps after ~15 min idle, so the first request then takes 30–60s.

Backend data refresh: `pip install -r requirements.txt`, then `python scraper.py scrape` and `python scraper.py export --date YYYY-MM-DD` (writes `menu_<date>.json`; `server.py` reads `menu.json`, so copy or rename it).

## Project structure

```
scraper.py                 # (backend teammate) scrapes nutrition.umd.edu → SQLite cache → menu JSON
meal_recommender.py        # (backend teammate) generate_meals(menu, UserSettings) → 2 meals per hall
meal_recommender_runner.py # (backend teammate) CLI example that writes meals.json
food_categories.toml       # menu item name → generic_name rules (drives plate images)
menu.json / meals.json     # sample scraper output / sample recommender output
server.py                  # JSON API wrapping meal_recommender for the frontend (POST /api/meals)
account_cli.py             # TEMPORARY terminal client for Supabase accounts (register, log in, preferences)
supabase/migrations/       # database schema: profiles table, row-level security, sign-up trigger (run in order)
frontend/
  app/                     # React + Vite + TS app (from two Figma Make prototypes)
    src/App.tsx            # top-level flow: picks onboarding screen vs main screen from session + profile
    src/MainScreen.tsx     # main screen: period picker, hall tabs, Mark consumed, plate, progress, panels
    src/onboarding/        # Welcome, SignUp (step 1), LogIn, Goals (step 2), parts.tsx, onboarding.css
    src/components/        # Icon, Logo, PlateView, DailyProgress, MealNutritionChart, SidePanel,
                           # UserSettingsPanel, AdjustIntakePanel, NumberField
    src/lib/               # api.ts (meals fetch), auth.ts + profile.ts (Supabase, or fakeAuth.ts + fakeProfile.ts
                           # without it), supabase.ts (client), authConfig.ts, demo.ts, router.ts,
                           # nutrition.ts (nutrients, goals, restrictions, defaults), types.ts
    src/assets/logo-mark.svg  # MacroTerp logo (also the favicon)
    src/assets/onboarding/ # welcome-screen images from the onboarding Make file
    src/styles.css         # main screen styles + all app design tokens
  plate-visualizer/        # standalone plate component (vanilla JS); source of truth for the plate
    plate-visualizer.js/.css, food-assets.js, sample-meals.js, assets/food/*.webp, index.html (demo)
  tools/process_food_images.py   # raw food photos → transparent WebP cut-outs
```

**Ownership:** the Python files other than `server.py` belong to the backend teammate. Don't edit them for frontend work; adapt in `server.py` instead.

**Branding:** the app is **MacroTerp** (formerly NourishUMD). The logo is `src/assets/logo-mark.svg` (a plate with chicken and leafy greens on a sage disc), used by `components/Logo.tsx` in the onboarding and main screen header, and as the favicon.

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
- Create account → checks the username is free (`isUsernameAvailable`), signs up, creates the profile → goals. If Supabase's "Confirm email" is on, it stops with the `confirmEmail` message instead; the user logs in after confirming. Back from goals returns to sign-up with username and email kept. Resubmitting with the same email doesn't create a second account.
- Goals → Continue saves `onboarded: true` and the goals/restrictions → `/meals`. New accounts start with 0 intake.
- Log in → `/meals`, or the goals step if that account never finished onboarding.
- **Log out** is in the User settings panel. It returns to Welcome (onboarding).
- Sign-up asks for **Username** (not full name), email, password and confirm password. The username is saved as `user_metadata.username` and `profile.username`.
- **No hard-coded rules or messages.** Every client-side rule (currently: username 3–30 letters/digits/underscores, email pattern, **password ≥ 8**, passwords match, calorie goal 1–10000, protein goal 1–1000) and every message lives in `lib/authConfig.ts` (`DEFAULT_AUTH_CONFIG`). Screens read them via `useAuthConfig()`. The rules mirror the database's CHECK constraints in `supabase/migrations/`; change both together, or the database rejects what the form accepts. The backend will own these later: make `loadAuthConfig()` fetch them and merge over the defaults. Don't add literal rules or error strings to screens.
- Errors from the auth service are shown **as the service sends them** (`error.message`). Only `error.code` is used, through `errorFields` in the config, to pick the field (`user_already_exists` → email, `weak_password` → password, …), and the rest show below the form. Don't match on message text. The fake service uses Supabase's codes and messages. "Username taken" is the one app-side check, with its own config message.
- Client-side errors show after the first submit.

**Demo mode is ON by default when Supabase isn't configured** (`lib/demo.ts`, `DEMO_MODE`), so the demo needs no typing. With Supabase configured it's off by default, so real accounts aren't signed out or filled with demo sign-ups. Force it either way with `VITE_DEMO_MODE=true` or `false`. While on:
- Every page load signs out and starts at Welcome, even on `/meals`. Saved accounts and settings are kept.
- Sign up skips validation, and blank fields get demo values (a fresh `demo-…@macroterp.demo` email and `demo_…` username each time).
- Log in with blank or wrong credentials opens a shared, already-onboarded demo account and goes straight to `/meals`.
- Correct credentials still log into that account.
- Any account whose "intake so far" is all zero shows sample intake (`DEMO_INTAKE`: 720 cal, 42 g protein, …) so Daily progress isn't empty. It's applied on sign-up, demo log-in and profile load (`withDemoIntake`). With demo mode off, new accounts start at 0.

The real validation and auth paths are untouched, only bypassed behind `DEMO_MODE` checks in `SignUp.tsx`, `LogIn.tsx` and `App.tsx`. Don't remove the real code paths.

**Accounts: Supabase, with local fakes as a fallback.** `lib/auth.ts` exports `auth` (an `AuthService`: `signUp`, `signInWithPassword`, `signOut`, `getSession`, `onAuthStateChange`, `{ data, error }` results, same API as `supabase.auth`). `lib/profile.ts` exports `getProfile`, `upsertProfile` and `isUsernameAvailable` (a `ProfileStore`) for `Profile = { id, username, onboarded, personalization }`. When `lib/supabase.ts` has a client, they use Supabase Auth and the `profiles` table: the table stores the profile as validated columns (`calorie_goal`, `protein_goal_g`, `dietary_restrictions`, `consumed` jsonb, …) and `profile.ts` converts with `toRow`/`toProfile`. Without one, they use `fakeAuth.ts`/`fakeProfile.ts` (localStorage, `macroterp:*` keys; `legacyStorage.ts` moves old `nourish:*` keys over once; profiles saved before the `full_name` rename still load). Supabase passwords are bcrypt-hashed by Supabase Auth; row-level security limits each user to their own row; a trigger creates the profile from the sign-up's `user_metadata.username`. Screens must only use `auth.ts` and `profile.ts` for accounts. Don't read localStorage or call Supabase directly.

The onboarding prototype is desktop-only. The phone layout (single column under 900px, stacked goal cards under 760px) is ours.

## Data flow

1. `MainScreen.tsx` calls `fetchMeals(period, personalization)` (personalization comes from the signed-in user's profile) → `POST /api/meals` with `{ period, restrictions, goals, consumed }` (goals and consumed cover all 7 nutrients).
2. `server.py` builds `meal_recommender.UserSettings`. Calorie/protein go in directly. What's left of carbs, fiber, sodium and sugar is divided by the meals remaining today and passed as `carb_max_g`, `fiber_min_g`, `sodium_limit_mg` and `sugar_limit_g`. **Fat has no recommender setting, so it's display only.** Results are cached per request body, since one run takes 1.5–3.5s.
3. The response is `generate_meals()` output: `{ source_menu_date, meals: [{ dining_hall, meal_option, meal_name, items[], meal_macros_total }] }`. Items have `name`, `generic_name`, `serving_g` and `macros`, with no `servings` (the plate defaults to 1).
4. Every hall has **exactly two** meals (`meal_option` 1 and 2, `MEALS_PER_HALL` in the recommender, `OPTIONS` in `App.tsx`). The design's round arrows and two dots switch between them without looping. On option 1 the left arrow is disabled, and on option 2 the right one is (`.arrow-button:disabled` is greyed out). A meal with `items: []` means nothing fit: the arrow and dot that lead to it are disabled too.

5. **Daily progress** bars show intake so far (solid, from the profile's `consumed`) plus the meal on screen as a lighter segment, with labels like "720 + 590 / 2,000". The preview follows period, hall and option changes and isn't saved anywhere. Bars cap at 100%, with no special over-goal styling yet.
6. The header has two buttons that open side panels (`SidePanel`), replacing the old single "Personalize" panel:
   - **Adjust intake** (sliders icon, `AdjustIntakePanel`): the 7 "intake so far" fields and an **Update today's intake** button.
   - **User settings** (`user` icon, `UserSettingsPanel`): daily goals (calories, protein), dietary restrictions, the allergen note, **Save settings** and **Log out**.
7. **Mark consumed ⇄ Consumed** (card header, right of the hall tabs) is a toggle. Tapping it adds the shown meal's `meal_macros_total` to `consumed` and saves; tapping again subtracts the same amount. There's no toast or undo; a toast only appears for save errors. Marked meals are tracked per period/hall/option in `MainScreen` state (session only, lost on reload). So the meal doesn't swap when you mark it, the meals request leaves out meals marked in the current period (`fetchInput`), while other periods still plan around them. A consumed meal shows no preview segment on Daily progress. Values are rounded to 0.1 on both sides so the request doesn't change by rounding noise. Every save goes through `onSavePersonalization` (`App.tsx`), which updates the screen right away and rolls back if the save fails.

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
- Panel number fields (`components/NumberField.tsx`) are `type="text" inputMode="decimal"`, not `type="number"`. They keep the typed text while editing, select all on focus, strip leading zeros and non-numeric characters, and treat empty as 0. Use the same approach for any new numeric input.
- Use native `<button type="button">` with `aria-pressed` for toggles (tabs, chips, periods) and `aria-label` on icon-only buttons.
- **`PlateView`** wraps the vanilla plate component: it imports `food-assets.js`/`plate-visualizer.js` for their `window.*` side effects, rewrites `FOOD_ASSETS[*].src` to Vite-built URLs (`import.meta.glob`), and mounts with `assetBase: ""`. Change plate behavior in `frontend/plate-visualizer/`, not in the wrapper. That folder must keep working standalone (`index.html`).
- The plate re-mounts per meal (`key` on `.visualizer-shell`) to replay the `plate-enter` animation. Foods and labels also slide in from their label side with a fade (`.pv-enter` in `plate-visualizer.css`), in waves set by `ENTER_WAVE` (mains, then starches + veg together, then the rest and side bowls; each leader line moves with its label): slow (1.6s) for the first plate of the session, faster (1s) after that. `PlateView` passes `firstEnter: "fast"` once a plate has been shown, and the standalone demo goes fast after its first `render()`. Resizing redraws without animating. It switches itself to numbered pins plus a legend below 620px container width.
- **Plate layout** (`plate-visualizer.js`): foods fill the plate out to the rim and touch lightly, like real plated food, rather than sitting as small separate islands. `ARRANGE` sets, per count, a tight ring and a generous `size`: 1 goes in the center; 2–4 go in a ring with the main pulled in (`MAIN_PULL`); 5–6 put the main in the center (`CENTER_SIZE`) with the rest around it. The ring alternates the front and back of the role-sorted list, so similar foods (two mains) end up across from each other. Second and later mains are drawn at `EXTRA_MAIN_SIZE`, and a repeated picture gets `REPEAT_TWIST` extra rotation. Draw order: bowls, then on-plate foods biggest first (sides sit on top of a ring main), and a centered main last. Items are shrunk if they'd reach past 93% of the plate radius (`RIM_LIMIT`), and the rim is narrow (`WELL` = 0.87, roughly half the original width; the gradient stops in `plateSVG()` match it). Rings are wide enough that foods spread out to the rim; pulling them in tighter looked clumped. Each meal gets small seeded nudges (`JITTER`, seeded from item names), so it looks natural but renders the same every time. **Only `kind: "bowl"` items go in the side slots beside the plate.** Every other food stays on the plate (the recommender allows up to 6). Labels split left/right by position, and near-center items take the emptier side. Food shadows are a very light contact shadow (`plate-visualizer.css`).
- **Garnish (idea, not built):** small decorative images (herb sprig, lemon wedge, sauce smear) would need assets from the user. Keep them subtle, since they're food that isn't in the meal.
- There's no Storybook. Use `npm run dev` for the app and `frontend/plate-visualizer/index.html` for the plate alone.

## Styling approach

- Plain global CSS with descriptive kebab-case classes, kept from the Make prototype (`.meal-card`, `.hall-tab.active`, `.progress-fill.pink`). Plate classes use the `.pv-` prefix. State uses `.active`/`.selected` classes and `aria-*`.
- Onboarding classes use the **`.ob-` prefix** (`onboarding/onboarding.css`), because both designs define `.primary-button`/`.choice-chip` with different looks. Main-screen page rules are scoped to `.app-shell` (e.g. `.app-shell > main`) so they don't leak into onboarding. Keep new global element selectors out of `styles.css`.
- The onboarding prototype is Tailwind-only. Its utilities were translated into the `.ob-*` rules, and where a Tailwind utility lost to the prototype's own CSS (e.g. the goals panel's `max-w-[760px]`, the Continue button's `ml-auto`), we match what it actually renders.
- Responsive: one `@media (max-width: 760px)` block at the end of `styles.css`, plus `clamp()` and grid. On mobile the header buttons (Adjust intake, User settings) are icon-only, and Mark consumed sits beside the meal title.
- Loading: `.visualizer-area.is-loading` dims the plate, and `aria-busy` is set on `.meal-card`.

## Assets & icons

- **Food images:** `frontend/plate-visualizer/assets/food/<generic-name>.webp` (transparent WebP, ≤900px). Each item's `generic_name` (from `food_categories.toml`) is normalized to kebab-case ("mac and cheese" → `mac-and-cheese`) and looked up in `food-assets.js`. `plant-based-<meat>` entries reuse the meat's image, and `spaghetti`/`salmon` are aliases of `pasta`/`fish` for the standalone demo. Names with no entry render a placeholder disc. Currently every TOML name has an image (51 of 51). `beans` shows black beans (the category also covers red/garbanzo beans, chili, edamame).
- **Adding images:** the teammate adds transparent PNG cut-outs (any name) to `assets/food/`. Run `npm run food-images` in `frontend/app` (`frontend/tools/process_food_pngs.mjs`, uses `sharp`, a devDependency). It trims, pads 8px, fits 900px (upscaling smaller images with Lanczos) and writes `<generic-name>.webp`; map PNG names that don't match the TOML in its `RENAMES`. For a JPEG/PNG with a fake checkerboard or plain white background, from any folder: `npm run food-images -- --checker --name <generic name> <file>` (add `--out <dir>` to preview elsewhere first). Its background removal keeps background pockets inside loose foods (noodles, beans) transparent. Check the cut-out on a coloured background before adding it. Then add a `food-assets.js` entry (`src`, `scale`, `role`, `kind`, `repeat`, `rotate`, and optionally `copies`) and check it on a plate. `copies: N` always draws at least N tightly overlapped copies, for pictures that look thin alone; tofu and beef use `copies: 2`. Only `.webp` files are bundled, so the source PNGs (1–3 MB each) stay in the folder but never ship. `frontend/tools/process_food_images.py` (Python: pillow/numpy/scipy, not installed here) is the original tool; it's still needed for sprite sheets.
- **After a TOML change, restart `python server.py`.** It caches meal results per request, so it keeps serving meals built with the old categories.
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
