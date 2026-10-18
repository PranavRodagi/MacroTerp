import { useState, type FormEvent } from "react";
import { Icon } from "../components/Icon";
import { DEMO_MODE } from "../lib/demo";
import { formatMessage, useAuthConfig, type FormField } from "../lib/authConfig";
import { Field, PasswordField, ProgressHeader, useToggle } from "./parts";

export type SignUpValues = { username: string; email: string; password: string };
// An error from the auth service: shown as-is, under `field` if it belongs to one.
export type SubmitError = { field?: FormField; message: string };

// Step 1 of 2. `onSubmit` creates the account and resolves to an error, or null on success.
// Rules and messages come from lib/authConfig.ts (later: the backend), never hard-coded here.
export function SignUp({
  initial,
  onBack,
  onLogin,
  onSubmit,
}: {
  initial: { username: string; email: string };
  onBack: () => void;
  onLogin: () => void;
  onSubmit: (values: SignUpValues) => Promise<SubmitError | null>;
}) {
  const { rules, messages } = useAuthConfig();
  const [username, setUsername] = useState(initial.username);
  const [email, setEmail] = useState(initial.email);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, toggleShowPassword] = useToggle();
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<SubmitError | null>(null);

  // Field checks show after the first submit attempt, then update as the user types.
  const errors = {
    username: !username.trim()
      ? messages.usernameRequired
      : username.trim().length < rules.usernameMinLength && formatMessage(messages.usernameTooShort, { min: rules.usernameMinLength }),
    email: !email.trim() ? messages.emailRequired : !new RegExp(rules.emailPattern).test(email.trim()) && messages.emailInvalid,
    password: password.length < rules.passwordMinLength && formatMessage(messages.passwordTooShort, { min: rules.passwordMinLength }),
    confirm: confirm !== password && messages.passwordMismatch,
  };
  // Demo mode skips these checks (App.tsx fills in blanks); see lib/demo.ts.
  const show = (key: keyof typeof errors) => !DEMO_MODE && submitted && errors[key];
  const serverErrorFor = (field: FormField) => serverError?.field === field && serverError.message;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setServerError(null);
    if (!DEMO_MODE && Object.values(errors).some(Boolean)) return;
    setBusy(true);
    const err = await onSubmit({ username: username.trim(), email: email.trim(), password });
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
            <Field
              autoComplete="username"
              error={show("username") || serverErrorFor("username")}
              label="Username"
              onChange={(v) => {
                setUsername(v);
                setServerError(null);
              }}
              placeholder="jordanlee"
              value={username}
            />
            <Field
              autoComplete="email"
              error={show("email") || serverErrorFor("email")}
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
              error={show("password") || serverErrorFor("password")}
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
