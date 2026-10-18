// Top-level flow: onboarding (welcome → sign up → goals, or log in) → main meal screen.
// Which screen shows depends on the auth session and whether the profile is onboarded.
import { useEffect, useState } from "react";
import { MainScreen } from "./MainScreen";
import { Welcome } from "./onboarding/Welcome";
import { SignUp, type SignUpValues } from "./onboarding/SignUp";
import { LogIn } from "./onboarding/LogIn";
import { Goals, type GoalsValues } from "./onboarding/Goals";
import { auth, type Session } from "./lib/auth";
import { getProfile, newProfile, upsertProfile, type Profile } from "./lib/profile";
import { ROUTES, usePath, type Screen } from "./lib/router";
import type { Personalization } from "./lib/nutrition";
import { DEMO_ACCOUNT, DEMO_MODE, DEMO_PASSWORD, demoSignUpEmail, withDemoIntake } from "./lib/demo";
import "./onboarding/onboarding.css";

function screenFor(path: string, session: Session | null | undefined, profile: Profile | null | undefined): Screen | "loading" {
  if (session === undefined || (session && !profile)) return "loading";
  if (!session) return path === ROUTES.signup ? "signup" : path === ROUTES.login ? "login" : "welcome";
  if (!profile!.onboarded) return path === ROUTES.signup ? "signup" : "goals"; // sign-up stays reachable via Back
  return "meals";
}

export default function App() {
  const [path, navigate] = usePath();
  const [session, setSession] = useState<Session | null | undefined>(undefined); // undefined = still loading
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [draft, setDraft] = useState({ name: "", email: "" }); // refills sign-up when coming Back from goals
  const userId = session?.user.id;

  useEffect(() => {
    // Demo mode: every page load starts signed out, at Welcome (see lib/demo.ts).
    const ready = DEMO_MODE ? auth.signOut() : Promise.resolve();
    ready.then(() => auth.getSession()).then(({ data }) => setSession(data.session));
    const { data } = auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  // Load the signed-in user's profile (a new, not-yet-onboarded one if none is saved).
  useEffect(() => {
    setProfile(undefined);
    if (!session) return;
    let live = true;
    getProfile(session.user.id).then(({ data }) => {
      // Don't overwrite a profile a handler already set (e.g. right after sign-up).
      const loaded = data ?? newProfile(session.user.id, session.user.user_metadata.full_name ?? null);
      if (live) setProfile((current) => current ?? withDemoIntake(loaded));
    });
    return () => {
      live = false;
    };
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  const screen = screenFor(path, session, profile);

  // Keep the URL in step with the screen we're allowed to show.
  useEffect(() => {
    if (screen !== "loading" && ROUTES[screen] !== path) navigate(ROUTES[screen], { replace: true });
  }, [screen, path]); // eslint-disable-line react-hooks/exhaustive-deps

  const signUp = async ({ name, email, password }: SignUpValues) => {
    setDraft({ name, email });
    if (DEMO_MODE) {
      // Fill blanks so the real sign-up path below still runs (see lib/demo.ts).
      name ||= DEMO_ACCOUNT.name;
      email ||= session?.user.email ?? demoSignUpEmail();
      if (password.length < 6) password = DEMO_PASSWORD;
    }
    if (session && session.user.email === email.toLowerCase()) {
      // Came Back from goals without changing the email: the account already exists.
      const updated = { ...profile!, full_name: name };
      await upsertProfile(updated);
      setProfile(updated);
      navigate(ROUTES.goals);
      return null;
    }
    if (session) await auth.signOut();
    const { data, error } = await auth.signUp({ email, password, options: { data: { full_name: name } } });
    if (error || !data.user) {
      if (/already registered/i.test(error?.message ?? "")) return { field: "email" as const, message: "An account with this email already exists. Log in instead." };
      if (/password/i.test(error?.message ?? "")) return { field: "password" as const, message: error!.message };
      return { message: error?.message ?? "Couldn't create your account. Try again." };
    }
    const created = withDemoIntake(newProfile(data.user.id, name));
    const { error: saveError } = await upsertProfile(created);
    if (saveError) return { message: saveError.message };
    setProfile(created);
    navigate(ROUTES.goals);
    return null;
  };

  const logIn = async (email: string, password: string) => {
    if (DEMO_MODE && !(email && password)) return demoLogIn();
    const { error } = await auth.signInWithPassword({ email, password });
    if (!error) return null; // the profile loads and the redirect picks goals or meals
    if (DEMO_MODE) return demoLogIn();
    return /invalid login/i.test(error.message) ? "Email or password is incorrect." : error.message;
  };

  // Demo mode only: sign into the shared demo account (created and onboarded on first use).
  const demoLogIn = async () => {
    const creds = { email: DEMO_ACCOUNT.email, password: DEMO_PASSWORD };
    let { data, error } = await auth.signInWithPassword(creds);
    if (error) ({ data, error } = await auth.signUp({ ...creds, options: { data: { full_name: DEMO_ACCOUNT.name } } }));
    if (error || !data.user) return error?.message ?? "Couldn't open the demo account.";
    const existing = (await getProfile(data.user.id)).data;
    const demoProfile = withDemoIntake({ ...(existing ?? newProfile(data.user.id, DEMO_ACCOUNT.name)), onboarded: true });
    await upsertProfile(demoProfile);
    setProfile(demoProfile);
    navigate(ROUTES.meals);
    return null;
  };

  const finishGoals = async (values: GoalsValues) => {
    const updated: Profile = { ...profile!, onboarded: true, personalization: { ...profile!.personalization, ...values } };
    const { error } = await upsertProfile(updated);
    if (error) return error.message;
    setProfile(updated);
    navigate(ROUTES.meals);
    return null;
  };

  const savePersonalization = (personalization: Personalization) => {
    const updated = { ...profile!, personalization };
    setProfile(updated);
    upsertProfile(updated);
  };

  const logOut = async () => {
    await auth.signOut();
    setDraft({ name: "", email: "" });
    navigate(ROUTES.welcome);
  };

  switch (screen) {
    case "loading":
      return <div aria-busy="true" className="app-loading" />;
    case "welcome":
      return <Welcome onStart={() => navigate(ROUTES.signup)} />;
    case "signup":
      return (
        <SignUp
          initial={draft}
          onBack={async () => {
            if (session) await auth.signOut(); // leaving sign-up after the account exists
            navigate(ROUTES.welcome);
          }}
          onLogin={() => navigate(ROUTES.login)}
          onSubmit={signUp}
        />
      );
    case "login":
      return <LogIn onBack={() => navigate(ROUTES.signup)} onSubmit={logIn} />;
    case "goals":
      return (
        <Goals
          initial={profile!.personalization}
          onBack={() => navigate(ROUTES.signup)}
          onSubmit={finishGoals}
        />
      );
    case "meals":
      return <MainScreen onLogOut={logOut} onSavePersonalization={savePersonalization} personalization={profile!.personalization} />;
  }
}
