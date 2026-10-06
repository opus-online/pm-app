import { useSyncExternalStore } from "react";

const noop = () => () => {};

/** false during SSR and the hydration render, true after -- for values that depend on the viewer's
 * clock or time zone (the server renders in its own), so hydration never sees a mismatch. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false
  );
}
