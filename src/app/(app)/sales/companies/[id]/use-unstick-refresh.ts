"use client";

import { useEffect, useState } from "react";

// TODO(next@16.2.10): remove when server-action revalidation commits on its own with search params (repro: log activity on /sales/companies/<id>?deal=<id>)
/** Next 16.2 can leave a server action's revalidated render suspended -- never committed -- so
 * the page stays stale and the save transition pending until some unrelated update arrives (any
 * click does it). While a save transition is still pending, a periodic no-op update gives React
 * that nudge, so the fresh render lands on its own. */
export function useUnstickRefresh(pending: boolean) {
  const [, nudge] = useState(0);
  useEffect(() => {
    if (!pending) return;
    const id = setInterval(() => nudge((n) => n + 1), 300);
    return () => clearInterval(id);
  }, [pending]);
}
