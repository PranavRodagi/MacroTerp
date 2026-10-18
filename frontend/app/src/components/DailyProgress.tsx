import { NUTRIENTS, type BarColor, type Totals } from "../lib/nutrition";

const fmt = (n: number) => Math.round(n).toLocaleString();
const pct = (n: number, goal: number) => (goal > 0 ? Math.min((n / goal) * 100, 100) : 0);

function NutritionMetric({
  label,
  value,
  added,
  goal,
  unit,
  color,
}: {
  label: string;
  value: number;
  added: number | null; // the shown meal's amount, drawn as a lighter segment after `value`
  goal: number;
  unit: string;
  color: BarColor;
}) {
  const eaten = pct(value, goal);
  const preview = added ? Math.min(pct(added, goal), 100 - eaten) : 0;
  const summary = `${label}: ${fmt(value)}${unit}${added ? ` plus ${fmt(added)}${unit} from this meal` : ""} of ${fmt(goal)}${unit}`;
  return (
    <div className="nutrition-metric">
      <div className="progress-label">
        <span>{label}</span>
        <span className="progress-value">
          {fmt(value)}
          {unit}
          {added ? <em className="progress-added"> + {fmt(added)}{unit}</em> : null}{" "}
          <span>
            / {fmt(goal)}
            {unit}
          </span>
        </span>
      </div>
      <div aria-label={summary} aria-valuemax={goal} aria-valuemin={0} aria-valuenow={value} className="progress-track" role="progressbar">
        <div className={`progress-fill ${color} ${preview ? "progress-fill--joined" : ""}`} style={{ width: `${eaten}%` }} />
        <div className={`progress-fill progress-fill--preview ${color}`} style={{ width: `${preview}%` }} />
      </div>
    </div>
  );
}

// Bars show what's been eaten today (solid) plus the meal currently on screen (lighter), if any.
export function DailyProgress({ consumed, goals, preview }: { consumed: Totals; goals: Totals; preview: Totals | null }) {
  return (
    <div className="daily-progress">
      <div className="section-heading">
        <div>
          <span>Today</span>
          <h3>Daily progress</h3>
        </div>
        <span className="progress-key">
          <i className="progress-key-swatch" /> Consumed so far
          {preview && (
            <>
              <i className="progress-key-swatch progress-key-swatch--preview" /> This meal
            </>
          )}
        </span>
      </div>
      <div className="daily-metrics-grid">
        {NUTRIENTS.map((n) => (
          <NutritionMetric
            added={preview ? preview[n.key] : null}
            color={n.color}
            goal={goals[n.key]}
            key={n.key}
            label={n.label}
            unit={n.unit}
            value={consumed[n.key]}
          />
        ))}
      </div>
    </div>
  );
}
