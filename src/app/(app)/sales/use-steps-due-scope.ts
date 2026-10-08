"use client";

import { useSyncExternalStore } from "react";

export type StepsDueScope = "me" | "all";

const KEY = "sales.stepsDue.scope";
const DEFAULT: StepsDueScope = "me";
const listeners = new Set<() => void>();
// Fallback when storage is unavailable (private mode, blocked site data): the choice still holds
// for this page session.
let memory: StepsDueScope | null = null;

function read(): StepsDueScope {
  try {
    const v = window.localStorage.getItem(KEY);
    if (v === "me" || v === "all") return v;
  } catch {
    // Storage blocked -- fall through.
  }
  return memory ?? DEFAULT;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

/** The Steps due tile's Me | All choice, remembered per browser. SSR and the hydration render use
 * the default; the stored value applies after. */
export function useStepsDueScope(): [StepsDueScope, (s: StepsDueScope) => void] {
  const scope = useSyncExternalStore(subscribe, read, () => DEFAULT);
  function setScope(s: StepsDueScope) {
    memory = s;
    try {
      window.localStorage.setItem(KEY, s);
    } catch {
      // Storage blocked -- the in-memory value still applies.
    }
    for (const l of listeners) l();
  }
  return [scope, setScope];
}
