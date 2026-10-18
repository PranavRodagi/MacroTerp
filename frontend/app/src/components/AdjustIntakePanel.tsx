import { useState } from "react";
import { NumberField } from "./NumberField";
import { SidePanel } from "./SidePanel";
import { NUTRIENTS, type NutrientKey, type Totals } from "../lib/nutrition";

// Manually set what's been eaten today (Mark consumed adds to these automatically).
export function AdjustIntakePanel({ initialValues, onClose, onSave }: { initialValues: Totals; onClose: () => void; onSave: (consumed: Totals) => void }) {
  const [consumed, setConsumed] = useState(initialValues);
  const set = (key: NutrientKey, value: number) => setConsumed((c) => ({ ...c, [key]: value }));

  return (
    <SidePanel onClose={onClose} title="Adjust intake">
      <fieldset>
        <legend>Intake so far</legend>
        <div className="field-grid">
          {NUTRIENTS.map((n) => (
            <NumberField key={n.key} label={n.label} onChange={(v) => set(n.key, v)} unit={n.unit || "cal"} value={consumed[n.key]} />
          ))}
        </div>
      </fieldset>

      <button
        className="primary-button panel-save"
        onClick={() => {
          onSave(consumed);
          onClose();
        }}
        type="button"
      >
        Update today's intake
      </button>
    </SidePanel>
  );
}
