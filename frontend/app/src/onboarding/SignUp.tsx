import { useState, type FormEvent } from "react";
import { Icon } from "../components/Icon";
import { DEMO_MODE } from "../lib/demo";
import { Field, PasswordField, ProgressHeader, isEmail, useToggle } from "./parts";

export type SignUpValues = { name: string; email: string; password: string };

// Step 1 of 2. `onSubmit` creates the account and resolves to an error message, or null on success.
export function SignUp({
  initial,
  onBack,
  onLogin,
  onSubmit,
}: {
  initial: { name: string; email: string };
  onBack: () => void;
  onLogin: () => void;
  onSubmit: (values: SignUpValues) => Promise<{ field?: "email" | "password"; message: string } | null>;
}) {
  const [name, setName] = useState(initial.name);
  const [email, setEmail] = useState(initial.email);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, toggleShowPassword] = useToggle();
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<{ field?: "email" | "password"; message: string } | null>(null);

  // Field checks show after the first submit attempt, then update as the user types.
  const errors = {
    name: !name.trim() && "Enter your name.",
    email: !email.trim() ? "Enter your email." : !isEmail(email) && "Enter a valid email address.",
    password: password.length < 6 && "Use at least 6 characters.",
    confirm: confirm !== password && "Passwords don't match.",
  };
  // Demo mode skips these checks (App.tsx fills in blanks); see lib/demo.ts.
  const show = (key: keyof typeof errors) => !DEMO_MODE && submitted && errors[key];

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setServerError(null);
    if (!DEMO_MODE && Object.values(errors).some(Boolean)) return;
    setBusy(true);
    const err = await onSubmit({ name: name.trim(), email: email.trim(), password });
    setBusy(false);
    if (err) setServerError(err);
  };

  return (
    <main className="ob-screen">
      <ProgressHeader onBack={onBack} step={1} total={2} />
      <div className="ob-content">
        <p className="ob-eyebrow">Your account</p>
        <h1 className="ob-screen-title">Create your account</h1>
        <p className="ob-screen-copy">A few details, then we'll personalize your meals.</p>
        <form noValidate onSubmit={submit}>
          <div className="ob-form-fields">
            <Field autoComplete="name" error={show("name")} label="Full name" onChange={setName} placeholder="Jordan Lee" value={name} />
            <Field
              autoComplete="email"
              error={show("email") || (serverError?.field === "email" && serverError.message)}
              label="Email"
              onChange={(v) => {
                setEmail(v);
                setServerError(null);
              }}
              placeholder="jordan@example.com"
              type="email"
              value={email}
            />
            <PasswordField
              autoComplete="new-password"
              error={show("password") || (serverError?.field === "password" && serverError.message)}
              label="Password"
              onChange={setPassword}
              onToggle={toggleShowPassword}
              placeholder="Enter your password"
              shown={showPassword}
              value={password}
            />
            <PasswordField
              autoComplete="new-password"
              error={show("confirm")}
              label="Confirm password"
              onChange={setConfirm}
              placeholder="Re-enter your password"
              shown={showPassword}
              value={confirm}
            />
          </div>
          {serverError && !serverError.field && <p className="ob-form-error" role="alert">{serverError.message}</p>}
          <p className="ob-switch-auth">
            Already have an account?{" "}
            <button className="ob-link-button" onClick={onLogin} type="button">
              Log in
            </button>
          </p>
          <button className="ob-primary-button ob-wide-button" disabled={busy} type="submit">
            {busy ? "Creating account…" : "Create account"} <Icon name="arrow-right" size={18} />
          </button>
        </form>
      </div>
    </main>
  );
}
