// Minimal path router on the History API (no dependency). Production hosting must
// serve index.html for these paths (Vite's dev server already does).
import { useEffect, useState } from "react";

export const ROUTES = {
  welcome: "/",
  signup: "/signup",
  login: "/login",
  goals: "/onboarding/goals",
  meals: "/meals",
} as const;
export type Screen = keyof typeof ROUTES;

export function usePath() {
  const [path, setPath] = useState(() => window.location.pathname);
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const navigate = (to: string, { replace = false } = {}) => {
    if (to === window.location.pathname) return;
    if (replace) window.history.replaceState(null, "", to);
    else window.history.pushState(null, "", to);
    setPath(to);
    window.scrollTo(0, 0);
  };
  return [path, navigate] as const;
}
