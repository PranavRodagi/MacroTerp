import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import { NUTRIENTS, RESTRICTIONS, type NutrientKey, type Personalization } from "../lib/nutrition";

// Keeps the typed text as-is while editing (so the field can be cleared and has no stray
// leading zero), selects everything on focus so typing replaces it, and tidies up on blur.
// An empty field counts as 0.
function NumberField({ label, value, unit, onChange }: { label: string; value: number; unit: string; onChange: (value: number) => void }) {
  const [text, setText] = useState(String(value));
  const [editing, setEditing] = useState(false);
  const shown = editing ? text : String(value);

  return (
    <label className="number-field">
      <span>{label}</span>
      <div>
        <input
          inputMode="decimal"
          onBlur={() => setEditing(false)}
          onChange={(e) => {
            const raw = e.target.value
              .replace(/[^\d.]/g, "") // digits and dots only
              .replace(/(\..*)\./g, "$1") // at most one dot
              .replace(/^0+(?=\d)/, ""); // no leading zeros ("08" → "8")
            setText(raw);
            onChange(raw === "" || raw === "." ? 0 : Number(raw));
          }}
          onFocus={(e) => {
            setText(String(value));
            setEditing(true);
            e.target.select();
          }}
          type="text"
          value={shown}
        />
        <span>{unit}</span>
      </div>
    </label>
  );
}

export function PreferencesPanel({
  initialValues,
  onClose,
  onSave,
  onLogOut,
}: {
  initialValues: Personalization;
  onClose: () => void;
  onSave: (values: Personalization) => void;
  onLogOut: () => void;
}) {
  const [values, setValues] = useState(initialValues);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const setConsumed = (key: NutrientKey, value: number) =>
    setValues((v) => ({ ...v, consumed: { ...v.consumed, [key]: value } }));

  const toggleRestriction = (value: string) =>
    setValues((v) => ({
      ...v,
      restrictions: v.restrictions.includes(value) ? v.restrictions.filter((r) => r !== value) : [...v.restrictions, value],
    }));

  return (
    <div className="panel-backdrop" onMouseDown={onClose}>
      <aside aria-label="Personalize meals" aria-modal="true" className="preferences-panel" onMouseDown={(e) => e.stopPropagation()} role="dialog">
        <div className="panel-top">
          <h2>Personalize</h2>
          <button aria-label="Close personalization" className="icon-button soft" onClick={onClose} type="button">
            <Icon name="x" />
          </button>
        </div>

        <fieldset>
          <legend>Daily goals</legend>
          <div className="field-grid">
            <NumberField label="Calories" onChange={(n) => setValues((v) => ({ ...v, calorieGoal: n }))} unit="cal" value={values.calorieGoal} />
            <NumberField label="Protein" onChange={(n) => setValues((v) => ({ ...v, proteinGoal: n }))} unit="g" value={values.proteinGoal} />
          </div>
        </fieldset>

        <fieldset>
          <legend>Intake so far</legend>
          <div className="field-grid">
            {NUTRIENTS.map((n) => (
              <NumberField
                key={n.key}
                label={n.label}
                onChange={(value) => setConsumed(n.key, value)}
                unit={n.unit || "cal"}
                value={values.consumed[n.key]}
              />
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend>Dietary restrictions</legend>
          <div className="choice-grid">
            {RESTRICTIONS.map((r) => (
              <button
                aria-pressed={values.restrictions.includes(r.value)}
                className={`choice-chip ${values.restrictions.includes(r.value) ? "selected" : ""}`}
                key={r.value}
                onClick={() => toggleRestriction(r.value)}
                type="button"
              >
                {r.label}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="allergy-note">
          <Icon name="leaf" />
          <p>Always confirm ingredients and allergen details with dining hall staff.</p>
        </div>

        <button
          className="primary-button panel-save"
          onClick={() => {
            onSave(values);
            onClose();
          }}
          type="button"
        >
          Save changes
        </button>

        {/* Not in the main-screen design; added to connect with onboarding accounts. */}
        <button className="secondary-button panel-logout" onClick={onLogOut} type="button">
          Log out
        </button>
      </aside>
    </div>
  );
}
