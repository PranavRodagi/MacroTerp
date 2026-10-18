// Validation rules and user-facing messages for sign-up, log-in and the goals step.
//
// The rules mirror the database's limits (supabase/migrations/); keep them in step,
// or the database will reject what the form accepts. Nothing about these is final:
// the backend will own them. Screens never hard-code
// a rule or a message; they read them from here via useAuthConfig(). To pull them from
// the backend, change loadAuthConfig() to fetch them (and merge over the defaults so a
// missing key can't break a screen). Errors returned by the auth service itself are
// shown with the service's own wording; we only use their `code` to decide which field
// they belong under (see errorFields).
import { useEffect, useState } from "react";

export type FormField = "username" | "email" | "password";

export type AuthConfig = {
  rules: {
    usernameMinLength: number;
    usernameMaxLength: number;
    usernamePattern: string; // a RegExp source the whole username must match
    passwordMinLength: number;
    emailPattern: string; // a RegExp source
    calorieGoal: { min: number; max: number };
    proteinGoal: { min: number; max: number };
  };
  // Templates may use {placeholders}, filled in by formatMessage().
  messages: {
    usernameRequired: string;
    usernameTooShort: string;
    usernameTooLong: string;
    usernameInvalid: string;
    usernameTaken: string;
    emailRequired: string;
    emailInvalid: string;
    passwordRequired: string;
    passwordTooShort: string;
    passwordMismatch: string;
    goalsInvalid: string;
    confirmEmail: string; // after sign-up, when the account must confirm its email first
    signUpFailed: string; // fallback when the service gives no message
    logInFailed: string;
    saveFailed: string;
  };
  // Auth-service error code → the form field to show it under (anything else shows below the form).
  // Codes follow Supabase Auth's error codes.
  errorFields: Record<string, FormField>;
};

export const DEFAULT_AUTH_CONFIG: AuthConfig = {
  rules: {
    usernameMinLength: 3,
    usernameMaxLength: 30,
    usernamePattern: "^[A-Za-z0-9_]+$",
    passwordMinLength: 8,
    emailPattern: "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$",
    calorieGoal: { min: 1, max: 10000 },
    proteinGoal: { min: 1, max: 1000 },
  },
  messages: {
    usernameRequired: "Enter a username.",
    usernameTooShort: "Use at least {min} characters.",
    usernameTooLong: "Use at most {max} characters.",
    usernameInvalid: "Use only letters, numbers and underscores.",
    usernameTaken: "That username is taken.",
    emailRequired: "Enter your email.",
    emailInvalid: "Enter a valid email address.",
    passwordRequired: "Enter your password.",
    passwordTooShort: "Use at least {min} characters.",
    passwordMismatch: "Passwords don't match.",
    goalsInvalid: "Enter a calorie goal from {calorieMin} to {calorieMax} and a protein goal from {proteinMin} to {proteinMax} g.",
    confirmEmail: "Check your email for a confirmation link, then log in.",
    signUpFailed: "Couldn't create your account. Try again.",
    logInFailed: "Couldn't log you in. Try again.",
    saveFailed: "Couldn't save your settings. Try again.",
  },
  errorFields: {
    user_already_exists: "email",
    email_exists: "email",
    email_address_invalid: "email",
    weak_password: "password",
  },
};

let pending: Promise<AuthConfig> | null = null;

// Today: the defaults above. Later: fetch from the backend, e.g.
//   const res = await fetch("/api/auth-config"); return merge(DEFAULT_AUTH_CONFIG, await res.json());
export function loadAuthConfig(): Promise<AuthConfig> {
  pending ??= Promise.resolve(DEFAULT_AUTH_CONFIG);
  return pending;
}

// Starts with the defaults, then switches to whatever loadAuthConfig() returns.
export function useAuthConfig(): AuthConfig {
  const [config, setConfig] = useState(DEFAULT_AUTH_CONFIG);
  useEffect(() => {
    let live = true;
    loadAuthConfig().then((c) => live && setConfig(c));
    return () => {
      live = false;
    };
  }, []);
  return config;
}

export const formatMessage = (template: string, vars: Record<string, string | number> = {}) =>
  template.replace(/\{(\w+)\}/g, (_, key) => String(vars[key] ?? `{${key}}`));
