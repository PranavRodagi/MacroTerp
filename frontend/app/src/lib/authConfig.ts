// Validation rules and user-facing messages for sign-up, log-in and the goals step.
//
// Nothing about these is final: the backend will own them. Screens never hard-code
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
    passwordMinLength: number;
    emailPattern: string; // a RegExp source
  };
  // Templates may use {min}, filled in by formatMessage().
  messages: {
    usernameRequired: string;
    usernameTooShort: string;
    emailRequired: string;
    emailInvalid: string;
    passwordRequired: string;
    passwordTooShort: string;
    passwordMismatch: string;
    goalsInvalid: string;
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
    usernameMinLength: 1,
    passwordMinLength: 8,
    emailPattern: "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$",
  },
  messages: {
    usernameRequired: "Enter a username.",
    usernameTooShort: "Use at least {min} characters.",
    emailRequired: "Enter your email.",
    emailInvalid: "Enter a valid email address.",
    passwordRequired: "Enter your password.",
    passwordTooShort: "Use at least {min} characters.",
    passwordMismatch: "Passwords don't match.",
    goalsInvalid: "Enter a calorie and protein goal above 0.",
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
