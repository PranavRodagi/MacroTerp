import { useState, type ReactNode } from "react";
import { Icon } from "../components/Icon";

export function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="ob-back-button" onClick={onClick} type="button">
      <Icon name="arrow-left" size={18} /> Back
    </button>
  );
}

// "Back ——— 1 of 2" bar above the sign-up and goals steps.
export function ProgressHeader({ step, total, onBack }: { step: number; total: number; onBack: () => void }) {
  return (
    <header className="ob-progress-header">
      <BackButton onClick={onBack} />
      <div
        aria-label={`Step ${step} of ${total}`}
        aria-valuemax={total}
        aria-valuemin={1}
        aria-valuenow={step}
        className="ob-progress-track"
        role="progressbar"
      >
        <div className="ob-progress-fill" style={{ width: `${(step / total) * 100}%` }} />
      </div>
      <span className="ob-progress-count">
        {step} of {total}
      </span>
    </header>
  );
}

export function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  autoComplete,
  error,
  action,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: string;
  autoComplete?: string;
  error?: string | false;
  action?: ReactNode;
}) {
  return (
    <label className="ob-field">
      <span className="ob-field-label">{label}</span>
      <span className="ob-field-control">
        <input
          aria-invalid={!!error}
          autoComplete={autoComplete}
          className={`ob-input ${error ? "ob-input--error" : ""} ${action ? "ob-input--with-action" : ""}`}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          type={type}
          value={value}
        />
        {action}
      </span>
      {error && <span className="ob-field-error">{error}</span>}
    </label>
  );
}

// Password field with the show/hide eye button.
export function PasswordField(props: { label: string; value: string; onChange: (v: string) => void; placeholder: string; autoComplete: string; error?: string | false; shown: boolean; onToggle?: () => void }) {
  const { shown, onToggle, ...rest } = props;
  return (
    <Field
      {...rest}
      action={
        onToggle && (
          <button aria-label={shown ? "Hide password" : "Show password"} className="ob-field-action" onClick={onToggle} type="button">
            <Icon name={shown ? "eye-off" : "eye"} size={20} />
          </button>
        )
      }
      type={shown ? "text" : "password"}
    />
  );
}

export function useToggle(initial = false) {
  const [on, setOn] = useState(initial);
  return [on, () => setOn((v) => !v)] as const;
}

export function ChoiceChip({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button aria-pressed={selected} className={`ob-chip ${selected ? "ob-chip--selected" : ""}`} onClick={onClick} type="button">
      {selected && <Icon name="check" size={16} />} {label}
    </button>
  );
}

export const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
