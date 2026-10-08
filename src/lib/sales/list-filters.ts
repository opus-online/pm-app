export type ListFilter = { from: string | null; to: string | null; responsible: string | null | "nobody" };

type StepLite = { due_on: string; assignee: { id: string } | null } | null;

/** ISO date strings compare correctly with plain `<`/`>` (same format, same length). */
export function matchesStepFilter(step: StepLite, f: ListFilter): boolean {
  if (f.from || f.to) {
    if (!step) return false;
    if (f.from && step.due_on < f.from) return false;
    if (f.to && step.due_on > f.to) return false;
  }
  if (f.responsible === "nobody") {
    if (step && step.assignee) return false;
  } else if (f.responsible) {
    if (!step || step.assignee?.id !== f.responsible) return false;
  }
  return true;
}
