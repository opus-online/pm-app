"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

export type PlanPrefill = { contact_id: string | null; deal_id: string | null };
/** Every request gets a fresh nonce, so asking twice with the same prefill still re-opens. */
export type PlanRequest = PlanPrefill & { nonce: number };

const PlanStepContext = createContext<{ request: PlanRequest | null; planNext: (p: PlanPrefill) => void } | null>(
  null
);

/** Lets anything on the company page (Next steps card, Mark done toast, deal sheet) open the
 * composer in plan mode with a contact / deal prefilled. */
export function PlanStepProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<PlanRequest | null>(null);
  const planNext = useCallback(
    (p: PlanPrefill) => setRequest((r) => ({ contact_id: p.contact_id, deal_id: p.deal_id, nonce: (r?.nonce ?? 0) + 1 })),
    []
  );
  const value = useMemo(() => ({ request, planNext }), [request, planNext]);
  return <PlanStepContext.Provider value={value}>{children}</PlanStepContext.Provider>;
}

export function usePlanStep() {
  const ctx = useContext(PlanStepContext);
  if (!ctx) throw new Error("usePlanStep must be used inside PlanStepProvider");
  return ctx;
}
