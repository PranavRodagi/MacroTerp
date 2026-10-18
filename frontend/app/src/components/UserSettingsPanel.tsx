import { useState } from "react";
import { Icon } from "./Icon";
import { NumberField } from "./NumberField";
import { SidePanel } from "./SidePanel";
import { RESTRICTIONS, type Personalization } from "../lib/nutrition";

export type UserSettings = Pick<Personalization, "calorieGoal" | "proteinGoal" | "restrictions">;

// Daily goals + dietary restrictions, plus Log out (returns to onboarding).
export function UserSettingsPanel({
  initialValues,
  onClose,
  onSave,
  onLogOut,
}: {
  initialValues: UserSettings;
  onClose: () => void;
  onSave: (values: UserSettings) => void;
  onLogOut: () => void;
}) {
  const [values, setValues] = useState<UserSettings>({
    calorieGoal: initialValues.calorieGoal,
    proteinGoal: initialValues.proteinGoal,
    restrictions: initialValues.restrictions,
  });

  const toggleRestriction = (value: string) =>
    setValues((v) => ({
      ...v,
      restrictions: v.restrictions.includes(value) ? v.restrictions.filter((r) => r !== value) : [...v.restrictions, value],
    }));

  return (
    <SidePanel onClose={onClose} title="User settings">
      <fieldset>
        <legend>Daily goals</legend>
        <div className="field-grid">
          <NumberField label="Calories" onChange={(n) => setValues((v) => ({ ...v, calorieGoal: n }))} unit="cal" value={values.calorieGoal} />
          <NumberField label="Protein" onChange={(n) => setValues((v) => ({ ...v, proteinGoal: n }))} unit="g" value={values.proteinGoal} />
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
        Save settings
      </button>

      <button className="secondary-button panel-logout" onClick={onLogOut} type="button">
        Log out
      </button>
    </SidePanel>
  );
}
