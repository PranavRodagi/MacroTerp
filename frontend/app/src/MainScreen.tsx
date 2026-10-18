import { useEffect, useMemo, useState } from "react";
import { Icon } from "./components/Icon";
import { PlateView } from "./components/PlateView";
import { DailyProgress } from "./components/DailyProgress";
import { MealNutritionChart } from "./components/MealNutritionChart";
import { UserSettingsPanel, type UserSettings } from "./components/UserSettingsPanel";
import { AdjustIntakePanel } from "./components/AdjustIntakePanel";
import { fetchMeals, type MealPeriod } from "./lib/api";
import { Logo } from "./components/Logo";
import { NUTRIENTS, goalsOf, type Personalization, type Totals } from "./lib/nutrition";
import type { Macros, Meal, MealsResponse } from "./lib/types";

const MEAL_PERIODS: MealPeriod[] = ["Breakfast", "Lunch", "Dinner"];
// Placeholder hours from the design; the menu data has no serving times yet.
const AVAILABLE_UNTIL: Record<MealPeriod, string> = { Breakfast: "10:30 AM", Lunch: "3:30 PM", Dinner: "9:00 PM" };

// Hall order and short tab labels from the design. Names must match meal_recommender.HALL_NAMES.
const HALLS = ["Yahentamitsi Dining Hall", "251 North", "South Campus"];
const HALL_LABEL: Record<string, string> = { "Yahentamitsi Dining Hall": "Yahentamitsi" };
// The recommender always returns exactly this many alternatives per hall (meal_recommender.MEALS_PER_HALL).
const OPTIONS = [0, 1] as const;

const round1 = (n: number) => Math.round(n * 10) / 10;

// A meal's totals in the Daily progress shape (unknown values count as 0), to 0.1.
const mealTotals = (m: Macros): Totals =>
  Object.fromEntries(NUTRIENTS.map(({ key }) => [key, round1(m[key] ?? 0)])) as Totals;

function periodNow(): MealPeriod {
  const minutes = new Date().getHours() * 60 + new Date().getMinutes();
  if (minutes < 10 * 60 + 30) return "Breakfast";
  if (minutes < 15 * 60 + 30) return "Lunch";
  return "Dinner";
}

// The meal screen for a signed-in, onboarded user. Settings come from their profile (see App.tsx).
export function MainScreen({
  personalization,
  onSavePersonalization,
  onLogOut,
}: {
  personalization: Personalization;
  onSavePersonalization: (p: Personalization) => Promise<string | null>; // resolves to an error message, or null
  onLogOut: () => void;
}) {
  const [period, setPeriod] = useState<MealPeriod>(periodNow);
  const [hall, setHall] = useState(HALLS[2]);
  const [option, setOption] = useState<0 | 1>(0);
  const [panel, setPanel] = useState<"settings" | "intake" | null>(null);
  const [marking, setMarking] = useState(false);
  // Meals marked consumed this session, keyed by mealKey(), with what each added to intake.
  const [marked, setMarked] = useState<Record<string, { period: MealPeriod; totals: Totals }>>({});
  const [notice, setNotice] = useState<string | null>(null); // save errors
  const [data, setData] = useState<MealsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [swipeStart, setSwipeStart] = useState<number | null>(null);

  // Ask the recommender as if this period's marked meals weren't eaten yet, so marking or
  // unmarking one keeps the same meals on screen (other periods still count them).
  const fetchInput = useMemo(() => {
    const thisPeriod = Object.values(marked).filter((m) => m.period === period);
    const consumed = Object.fromEntries(
      NUTRIENTS.map(({ key }) => [key, Math.max(0, round1(thisPeriod.reduce((v, m) => v - m.totals[key], personalization.consumed[key])))]),
    ) as Totals;
    return JSON.stringify({ ...personalization, consumed });
  }, [marked, period, personalization]);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    fetchMeals(period, JSON.parse(fetchInput) as Personalization, ctrl.signal)
      .then((res) => {
        setData(res);
        setOption(0);
      })
      .catch((e) => {
        if (ctrl.signal.aborted) return;
        setError(e instanceof TypeError ? "Couldn't reach the meal server. Is `python server.py` running?" : e.message);
      })
      .finally(() => !ctrl.signal.aborted && setLoading(false));
    return () => ctrl.abort();
  }, [period, fetchInput]);

  // [option 1, option 2] for this hall; an entry with no items means nothing fit.
  const hallMeals = useMemo(
    () => OPTIONS.map((i) => (data?.meals ?? []).find((m) => m.dining_hall === hall && m.meal_option === i + 1) ?? null),
    [data, hall],
  );
  const meal = hallMeals[option];
  const hasPlate = !!meal && meal.items.length > 0;
  const available = (i: 0 | 1) => !!hallMeals[i]?.items.length;
  const movePeriod = (dir: number) =>
    setPeriod((p) => MEAL_PERIODS[(MEAL_PERIODS.indexOf(p) + dir + MEAL_PERIODS.length) % MEAL_PERIODS.length]);

  // Saves; shows the error if it fails. Returns true on success.
  const save = async (next: Personalization) => {
    const err = await onSavePersonalization(next);
    setNotice(err);
    return !err;
  };
  const saveSettings = (s: UserSettings) => save({ ...personalization, ...s });
  const saveIntake = (consumed: Totals) => save({ ...personalization, consumed });

  const mealKey = (m: Meal) => `${period}|${m.dining_hall}|${m.meal_option}|${m.meal_name}`;
  const isConsumed = !!meal && !!marked[mealKey(meal)];

  // "Mark consumed" ⇄ "Consumed": adds the shown meal to today's intake, or takes it back off.
  const toggleConsumed = async () => {
    if (!meal || !hasPlate) return;
    const key = mealKey(meal);
    const entry = marked[key];
    const totals = entry?.totals ?? mealTotals(meal.meal_macros_total);
    const sign = entry ? -1 : 1;
    const consumed = Object.fromEntries(
      NUTRIENTS.map(({ key: k }) => [k, Math.max(0, round1(personalization.consumed[k] + sign * totals[k]))]),
    ) as Totals;
    const nextMarked = { ...marked };
    if (entry) delete nextMarked[key];
    else nextMarked[key] = { period, totals };

    setMarking(true);
    setMarked(nextMarked); // together with the new intake, fetchInput stays the same: no refetch
    if (!(await save({ ...personalization, consumed }))) setMarked(marked);
    setMarking(false);
  };

  // Error messages hide themselves after a few seconds.
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(t);
  }, [notice]);

  const chooseHall = (h: string) => {
    setHall(h);
    setOption(0);
  };

  return (
    <div className="app-shell">
      <header className="site-header">
        {/* Placeholder branding (from the onboarding design); not final yet. */}
        <Logo compact />
        <div className="header-actions">
          <button aria-label="Adjust intake" className="preferences-button" onClick={() => setPanel("intake")} type="button">
            <Icon name="sliders" size={18} />
            <span>Adjust intake</span>
          </button>
          <button aria-label="User settings" className="preferences-button" onClick={() => setPanel("settings")} type="button">
            <Icon name="user" size={18} />
            <span>User settings</span>
          </button>
        </div>
      </header>

      <main>
        <section className="intro">
          <div
            aria-label="Choose meal period"
            className="meal-period-picker"
            onTouchEnd={(e) => {
              if (swipeStart === null) return;
              const distance = e.changedTouches[0].clientX - swipeStart;
              if (Math.abs(distance) > 45) movePeriod(distance < 0 ? 1 : -1);
              setSwipeStart(null);
            }}
            onTouchStart={(e) => setSwipeStart(e.touches[0].clientX)}
            role="group"
          >
            {MEAL_PERIODS.map((p) => (
              <button
                aria-pressed={period === p}
                className={`meal-period-option ${period === p ? "active" : ""}`}
                key={p}
                onClick={() => setPeriod(p)}
                type="button"
              >
                {p}
              </button>
            ))}
          </div>
        </section>

        <section className="meal-layout">
          <article className="meal-card" aria-busy={loading}>
            <div className="meal-card-header">
              <div className="meal-title">
                <h2>{meal ? meal.meal_name : loading ? "Building your meals…" : "No meals yet"}</h2>
              </div>
              <div aria-label="Dining hall selection" className="hall-tabs header-hall-tabs" role="group">
                {HALLS.map((h) => (
                  <button
                    aria-pressed={hall === h}
                    className={`hall-tab ${hall === h ? "active" : ""}`}
                    key={h}
                    onClick={() => chooseHall(h)}
                    type="button"
                  >
                    {HALL_LABEL[h] ?? h}
                  </button>
                ))}
              </div>
              <button
                aria-pressed={isConsumed}
                className={`mark-consumed-button ${isConsumed ? "is-consumed" : ""}`}
                disabled={!hasPlate || loading || marking}
                onClick={toggleConsumed}
                type="button"
              >
                <Icon name="check" size={17} />
                {isConsumed ? "Consumed" : "Mark consumed"}
              </button>
            </div>

            <div className={`visualizer-area ${loading ? "is-loading" : ""}`}>
              {/* Two options per hall, no wrap-around: the arrow with nowhere to go is disabled. */}
              <button
                aria-label="Previous meal"
                className="arrow-button arrow-left"
                disabled={option === 0 || !available(0)}
                onClick={() => setOption(0)}
                type="button"
              >
                <Icon name="arrow-left" size={25} />
              </button>
              {error ? (
                <p className="visualizer-message">{error}</p>
              ) : hasPlate ? (
                <div className="visualizer-shell" key={`${hall}-${option}-${meal.meal_name}`}>
                  <PlateView meal={meal} />
                </div>
              ) : (
                !loading && <p className="visualizer-message">No meal at this hall fits your settings for {period.toLowerCase()}.</p>
              )}
              <button
                aria-label="Next meal"
                className="arrow-button arrow-right"
                disabled={option === 1 || !available(1)}
                onClick={() => setOption(1)}
                type="button"
              >
                <Icon name="arrow-right" size={25} />
              </button>
            </div>

            <div className="visualizer-pagination">
              <div className="meal-dots" aria-label={`Meal ${option + 1} of ${OPTIONS.length}`}>
                {OPTIONS.map((i) => (
                  <button
                    aria-label={available(i) ? `Show ${hallMeals[i]!.meal_name}` : "No other meal fits your settings"}
                    className={`meal-dot ${option === i ? "active" : ""}`}
                    disabled={!available(i) && option !== i}
                    key={i}
                    onClick={() => setOption(i)}
                    type="button"
                  />
                ))}
              </div>
            </div>

            <div className="nutrition-dashboard">
              <DailyProgress
                consumed={personalization.consumed}
                goals={goalsOf(personalization)}
                preview={hasPlate && !isConsumed ? mealTotals(meal.meal_macros_total) : null}
              />
              {hasPlate && <MealNutritionChart totals={meal.meal_macros_total} />}
            </div>

            <div className="meal-footer">
              <p className="availability">
                <span /> Available now until {AVAILABLE_UNTIL[period]}
              </p>
            </div>
          </article>
        </section>
      </main>

      {panel === "settings" && (
        <UserSettingsPanel initialValues={personalization} onClose={() => setPanel(null)} onLogOut={onLogOut} onSave={saveSettings} />
      )}
      {panel === "intake" && (
        <AdjustIntakePanel initialValues={personalization.consumed} onClose={() => setPanel(null)} onSave={(consumed) => saveIntake(consumed)} />
      )}

      {notice && (
        <div className="toast" role="alert">
          <span>{notice}</span>
          <button aria-label="Dismiss" className="toast-close" onClick={() => setNotice(null)} type="button">
            <Icon name="x" size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
