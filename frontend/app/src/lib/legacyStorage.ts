// The app was called NourishUMD and kept its fake accounts under "nourish:*" keys.
// Move them to "macroterp:*" once, so accounts saved before the rename still log in.
const OLD = "nourish:";
const NEW = "macroterp:";

try {
  const oldKeys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith(OLD)) oldKeys.push(k);
  }
  for (const k of oldKeys) {
    const next = NEW + k.slice(OLD.length);
    if (localStorage.getItem(next) === null) localStorage.setItem(next, localStorage.getItem(k)!);
    localStorage.removeItem(k);
  }
} catch {
  /* storage unavailable: nothing to move */
}
