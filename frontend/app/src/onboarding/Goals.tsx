import { useState } from "react";
import { Icon } from "../components/Icon";
import { RESTRICTIONS } from "../lib/nutrition";
import { ChoiceChip, ProgressHeader } from "./parts";

export type GoalsValues = { calorieGoal: number; proteinGoal: number; restrictions: string[] };

// Step 2 of 2. `onSubmit` saves the profile and resolves to an error message, or null on success.
export function Goals({ initial, onBack, onSubmit }: { initial: GoalsValues; onBack: () => void; onSubmit: (values: GoalsValues) => Promise<string | null> }) {
  const [restrictions, setRestrictions] = useState(initial.restrictions);
  const [calories, setCalories] = useState(initial.calorieGoal);
  const [protein, setProtein] = useState(initial.proteinGoal);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const toggle = (value: string) => setRestrictions((r) => (r.includes(value) ? r.filter((x) => x !== value) : [...r, value]));
  const digits = (raw: string) => Number(raw.replace(/\D/g, "").slice(0, 5)) || 0;
  const invalid = calories <= 0 || protein <= 0;

  const submit = async () => {
    setSubmitted(true);
    if (invalid) return;
    setBusy(true);
    setServerError(await onSubmit({ calorieGoal: calories, proteinGoal: protein, restrictions }));
    setBusy(false);
  };

  return (
    <main className="ob-screen">
      <ProgressHeader onBack={onBack} step={2} total={2} />
      <div className="ob-content">
        <p className="ob-eyebrow">Your preferences</p>
        <h1 className="ob-screen-title">Set your daily goals</h1>
        <p className="ob-screen-copy">Choose any dietary restrictions and adjust your targets.</p>

        <section className="ob-restrictions">
          <h2 className="ob-section-title">Dietary restrictions</h2>
          <div className="ob-chips">
            {RESTRICTIONS.map((r) => (
              <ChoiceChip key={r.value} label={r.label} onClick={() => toggle(r.value)} selected={restrictions.includes(r.value)} />
            ))}
          </div>
        </section>

        <div className="ob-divider" />

        <section className="ob-goal-grid">
          <div className="ob-goal-card ob-goal-card--calories">
            <label className="ob-goal-label" htmlFor="calorie-goal">
              Daily calories
            </label>
            <div className="ob-goal-row">
              <input
                aria-invalid={submitted && calories <= 0}
                className="ob-goal-input"
                id="calorie-goal"
                inputMode="numeric"
                onChange={(e) => setCalories(digits(e.target.value))}
                type="text"
                value={calories || ""}
              />
              <span className="ob-goal-unit">kcal</span>
            </div>
          </div>
          <div className="ob-goal-card ob-goal-card--protein">
            <label className="ob-goal-label" htmlFor="protein-goal">
              Protein goal
            </label>
            <div className="ob-goal-row">
              <input
                aria-invalid={submitted && protein <= 0}
                className="ob-goal-input"
                id="protein-goal"
                inputMode="numeric"
                onChange={(e) => setProtein(digits(e.target.value))}
                type="text"
                value={protein || ""}
              />
              <span className="ob-goal-unit">g</span>
            </div>
          </div>
        </section>

        {submitted && invalid && <p className="ob-form-error" role="alert">Enter a calorie and protein goal above 0.</p>}
        {serverError && <p className="ob-form-error" role="alert">{serverError}</p>}

        <button className="ob-primary-button ob-goals-continue" disabled={busy} onClick={submit} type="button">
          {busy ? "Saving…" : "Continue"} <Icon name="arrow-right" size={18} />
        </button>
      </div>
    </main>
  );
}
