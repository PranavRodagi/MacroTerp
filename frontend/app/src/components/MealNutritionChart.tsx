import type { Macros } from "../lib/types";

const r = (n: number | null) => (n == null ? "–" : Math.round(n));

// Macro colors match the plate labels: protein pink, carbs sage, fat blue.
export function MealNutritionChart({ totals }: { totals: Macros }) {
  const protein = totals.protein_g ?? 0;
  const carbs = totals.carbs_g ?? 0;
  const fat = totals.fat_g ?? 0;
  const macroCalories = protein * 4 + carbs * 4 + fat * 9;
  const proteinPercent = macroCalories ? Math.round(((protein * 4) / macroCalories) * 100) : 0;
  const carbsPercent = macroCalories ? Math.round(((carbs * 4) / macroCalories) * 100) : 0;
  const fatPercent = macroCalories ? 100 - proteinPercent - carbsPercent : 0;
  const carbsEnd = proteinPercent + carbsPercent;
  const background = macroCalories
    ? `conic-gradient(var(--pink) 0 ${proteinPercent}%, var(--sage) ${proteinPercent}% ${carbsEnd}%, var(--blue) ${carbsEnd}% 100%)`
    : "var(--line)";

  return (
    <div className="meal-breakdown">
      <div className="section-heading">
        <div>
          <span>This meal</span>
          <h3>Nutrition split</h3>
        </div>
        <span>{r(totals.calories)} cal</span>
      </div>
      <div className="chart-row">
        <div
          aria-label={`${proteinPercent}% protein, ${carbsPercent}% carbs, ${fatPercent}% fat`}
          className="macro-chart"
          role="img"
          style={{ background }}
        >
          <div>
            <strong>{r(totals.calories)}</strong>
            <span>total calories</span>
          </div>
        </div>
        <div className="macro-legend">
          <p>
            <span className="legend-dot pink" />
            Protein <strong>{proteinPercent}%</strong>
          </p>
          <p>
            <span className="legend-dot sage" />
            Carbs <strong>{carbsPercent}%</strong>
          </p>
          <p>
            <span className="legend-dot blue" />
            Fat <strong>{fatPercent}%</strong>
          </p>
        </div>
      </div>
      <div className="micro-list">
        <span>
          Fiber <strong>{r(totals.fiber_g)}g</strong>
        </span>
        <span>
          Sodium <strong>{r(totals.sodium_mg)}mg</strong>
        </span>
        <span>
          Sugar <strong>{r(totals.sugar_g)}g</strong>
        </span>
      </div>
    </div>
  );
}
