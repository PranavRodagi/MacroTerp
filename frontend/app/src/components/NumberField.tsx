import { useState } from "react";

// Keeps the typed text as-is while editing (so the field can be cleared and has no stray
// leading zero), selects everything on focus so typing replaces it, and tidies up on blur.
// An empty field counts as 0.
export function NumberField({ label, value, unit, onChange }: { label: string; value: number; unit: string; onChange: (value: number) => void }) {
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
