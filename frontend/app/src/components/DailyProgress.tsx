import { NUTRIENTS, type BarColor, type Totals } from "../lib/nutrition";

const fmt = (n: number) => Math.round(n).toLocaleString();

function NutritionMetric({ label, value, goal, unit, color }: { label: string; value: number; goal: number; unit: string; color: BarColor }) {
  const percent = goal > 0 ? Math.min((value / goal) * 100, 100) : 0;
  return (
    <div className="nutrition-metric">
      <div className="progress-label">
        <span>{label}</span>
        <span className="progress-value">
          {fmt(value)}
          {unit}{" "}
          <span>
            / {fmt(goal)}
            {unit}
          </span>
        </span>
      </div>
      <div
        aria-label={`${label}: ${fmt(value)}${unit} of ${fmt(goal)}${unit}`}
        aria-valuemax={goal}
        aria-valuemin={0}
        aria-valuenow={value}
        className="progress-track"
        role="progressbar"
      >
        <div className={`progress-fill ${color}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

export function DailyProgress({ consumed, goals }: { consumed: Totals; goals: Totals }) {
  return (
    <div className="daily-progress">
      <div className="section-heading">
        <div>
          <span>Today</span>
          <h3>Daily progress</h3>
        </div>
        <span>Consumed so far</span>
      </div>
      <div className="daily-metrics-grid">
        {NUTRIENTS.map((n) => (
          <NutritionMetric color={n.color} goal={goals[n.key]} key={n.key} label={n.label} unit={n.unit} value={consumed[n.key]} />
        ))}
      </div>
    </div>
  );
}
