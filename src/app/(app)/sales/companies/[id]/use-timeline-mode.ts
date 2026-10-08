"use client";

import { useSyncExternalStore } from "react";
import type { TimelineMode } from "@/lib/sales/timeline-filter";

const KEY = "sales.timeline.mode";
const DEFAULT: TimelineMode = "entries";
const listeners = new Set<() => void>();
// Fallback when storage is unavailable (private mode, blocked site data): the choice still holds
// for this page session.
let memory: TimelineMode | null = null;

function read(): TimelineMode {
  try {
    const v = window.localStorage.getItem(KEY);
    if (v === "entries" || v === "all") return v;
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

/** The timeline's Entries | All choice, remembered per browser and shared by every timeline on
 * the page. SSR and the hydration render use the default; the stored value applies after. */
export function useTimelineMode(): [TimelineMode, (m: TimelineMode) => void] {
  const mode = useSyncExternalStore(subscribe, read, () => DEFAULT);
  function setMode(m: TimelineMode) {
    memory = m;
    try {
      window.localStorage.setItem(KEY, m);
    } catch {
      // Storage blocked -- the in-memory value still applies.
    }
    for (const l of listeners) l();
  }
  return [mode, setMode];
}
