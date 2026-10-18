import { useState, type FormEvent } from "react";
import { Icon } from "../components/Icon";
import { Logo } from "../components/Logo";
import { DEMO_MODE } from "../lib/demo";
import { useAuthConfig } from "../lib/authConfig";
import { BackButton, Field, PasswordField, useToggle } from "./parts";

// `onSubmit` signs in and resolves to the auth service's error message, or null on success.
// Rules and messages come from lib/authConfig.ts (later: the backend), never hard-coded here.
export function LogIn({ onBack, onSubmit }: { onBack: () => void; onSubmit: (email: string, password: string) => Promise<string | null> }) {
  const { rules, messages } = useAuthConfig();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, toggleShowPassword] = useToggle();
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // Demo mode skips these checks (App.tsx falls back to the demo account); see lib/demo.ts.
  const errors = DEMO_MODE
    ? { email: false as const, password: false as const }
    : {
        email: !email.trim() ? messages.emailRequired : !new RegExp(rules.emailPattern).test(email.trim()) && messages.emailInvalid,
        password: !password && messages.passwordRequired,
      };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setServerError(null);
    if (errors.email || errors.password) return;
    setBusy(true);
    const err = await onSubmit(email.trim(), password);
    setBusy(false);
    if (err) setServerError(err);
  };

  return (
    <main className="ob-screen">
      <header className="ob-login-header">
        <BackButton onClick={onBack} />
        <Logo compact />
      </header>
      <div className="ob-content">
        <p className="ob-eyebrow">Welcome back</p>
        <h1 className="ob-screen-title">Log in</h1>
        <form className="ob-form-fields" noValidate onSubmit={submit}>
          <Field autoComplete="email" error={submitted && errors.email} label="Email" onChange={setEmail} placeholder="jordan@example.com" type="email" value={email} />
          <PasswordField
            autoComplete="current-password"
            error={submitted && errors.password}
            label="Password"
            onChange={setPassword}
            onToggle={toggleShowPassword}
            placeholder="Enter your password"
            shown={showPassword}
            value={password}
          />
          {serverError && <p className="ob-form-error" role="alert">{serverError}</p>}
          <button className="ob-primary-button ob-wide-button ob-login-submit" disabled={busy} type="submit">
            {busy ? "Logging in…" : "Log in"} <Icon name="arrow-right" size={18} />
          </button>
        </form>
      </div>
    </main>
  );
}
