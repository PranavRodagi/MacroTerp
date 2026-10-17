import { useEffect, useMemo, useState } from "react";
import { Icon } from "./components/Icon";
import { PlateView } from "./components/PlateView";
import { DailyProgress } from "./components/DailyProgress";
import { MealNutritionChart } from "./components/MealNutritionChart";
import { PreferencesPanel } from "./components/PreferencesPanel";
import { fetchMeals, type MealPeriod } from "./lib/api";
import { goalsOf, loadPersonalization, savePersonalization, type Personalization } from "./lib/nutrition";
import type { MealsResponse } from "./lib/types";

const MEAL_PERIODS: MealPeriod[] = ["Breakfast", "Lunch", "Dinner"];
// Placeholder hours from the design; the menu data has no serving times yet.
const AVAILABLE_UNTIL: Record<MealPeriod, string> = { Breakfast: "10:30 AM", Lunch: "3:30 PM", Dinner: "9:00 PM" };

// Hall order and short tab labels from the design. Names must match meal_recommender.HALL_NAMES.
const HALLS = ["Yahentamitsi Dining Hall", "251 North", "South Campus"];
const HALL_LABEL: Record<string, string> = { "Yahentamitsi Dining Hall": "Yahentamitsi" };
// The recommender always returns exactly this many alternatives per hall (meal_recommender.MEALS_PER_HALL).
const OPTIONS = [0, 1] as const;

function periodNow(): MealPeriod {
  const minutes = new Date().getHours() * 60 + new Date().getMinutes();
  if (minutes < 10 * 60 + 30) return "Breakfast";
  if (minutes < 15 * 60 + 30) return "Lunch";
  return "Dinner";
}

export default function App() {
  const [period, setPeriod] = useState<MealPeriod>(periodNow);
  const [hall, setHall] = useState(HALLS[2]);
  const [option, setOption] = useState<0 | 1>(0);
  const [personalization, setPersonalization] = useState<Personalization>(loadPersonalization);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [data, setData] = useState<MealsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [swipeStart, setSwipeStart] = useState<number | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    fetchMeals(period, personalization, ctrl.signal)
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
  }, [period, personalization]);

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
  const chooseHall = (h: string) => {
    setHall(h);
    setOption(0);
  };
  const savePrefs = (p: Personalization) => {
    setPersonalization(p);
    savePersonalization(p);
  };

  return (
    <div className="app-shell">
      <header className="site-header">
        {/* Placeholder logo and app name; the final branding isn't decided yet. */}
        <div className="brand">
          <div className="brand-mark">
            <Icon name="leaf" size={22} />
          </div>
          <span>Meal Maker</span>
        </div>
        <button aria-label="Personalize" className="preferences-button" onClick={() => setPreferencesOpen(true)} type="button">
          <Icon name="sliders" size={18} />
          <span>Personalize</span>
        </button>
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
              <DailyProgress consumed={personalization.consumed} goals={goalsOf(personalization)} />
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

      {preferencesOpen && (
        <PreferencesPanel initialValues={personalization} onClose={() => setPreferencesOpen(false)} onSave={savePrefs} />
      )}
    </div>
  );
}
