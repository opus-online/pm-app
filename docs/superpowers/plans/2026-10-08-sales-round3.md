# Sales Round 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Edit/cancel next steps, let any Sales user edit any logged entry, filter the history (entries vs all), add a Responsible column + date-range/responsible filters to the list, preselect single contact/deal in the log box, and treat deal-less companies as prospects.

**Architecture:** One migration adds `cancelled` status, cancel/edit audit columns and three SECURITY DEFINER RPCs (`update_step`, `cancel_step`, `edit_entry`) plus the new `company_kind` rule. Server actions wrap the RPCs; pure helpers (list filter predicate, timeline filter, preselect) carry the logic with vitest; UI changes are in the Sales list and company page.

**Tech Stack:** Next.js 16, Supabase (RLS, pgTAP), zod v4, react-hook-form, shadcn on `@base-ui/react`, vitest.

**Spec:** `docs/superpowers/specs/2026-10-08-sales-round3-design.md`

## Global Constraints
- Next.js 16 differs from training data — read `node_modules/next/dist/docs/` when unsure.
- base-ui: `render` prop, never `asChild`; menu items `onClick`; `DropdownMenuLabel` inside `DropdownMenuGroup`.
- New functions: `security definer`, `set search_path = public`, `revoke all ... from public, anon`, grant `authenticated`. Raise errcodes: `42501` not authorized / not assignable, `P0002` step/entry not found or wrong state, `22023` cross-company or closed-deal reference, `22004` null required value.
- Server actions: `{ error } | { success: true }`, `requirePermission("manage_sales")` first, friendly messages only, `revalidatePath('/sales')` + company path; client calls wrapped in try/catch; transition saves use `useUnstickRefresh(isPending)`.
- Allowlisted shapes; no help texts; dates `dd.mm.yyyy` via `formatDateEt`; truncated text via `TruncateTooltip`; assignee pickers list only assignable Sales people.
- Local Supabase only; NEVER `--linked`. Branch `feat/sales-next-steps`.

## Review Focus
1. Editing a step's due date / responsible via the full Edit dialog must still write "Next step moved…" / "…reassigned to…" — pgTAP Task 1.
2. A user editing another user's entry must not be able to turn it into a system entry or move it to another company — pgTAP Task 1.
3. Date-range filter with only "from" or only "to" must be inclusive and ignore companies without a step only when a range is set — vitest Task 2.
4. Timeline "Entries" must still show completed and cancelled steps (they are user-meaningful) — vitest Task 2.
5. Prospect rule change must not hide a company that has a project — pgTAP Task 1.

---

### Task 1: Migration — cancelled status, audit columns, RPCs, prospect rule

**Files:** Create `supabase/migrations/20261008000002_sales_round3.sql`, `supabase/tests/phase12_round3.test.sql`; Modify `supabase/tests/phase10_crm.test.sql` only if an assertion depends on the old prospect rule (keep plan count exact).

**Interfaces — Produces:**
- `activity_status` += `'cancelled'`; columns `cancelled_at, cancelled_by, cancel_reason, edited_at, edited_by` on `crm_activities`.
- `update_step(p_id uuid, p_body text, p_kind activity_kind, p_due_on date, p_assignee uuid, p_contact uuid, p_deal uuid) returns void`
- `cancel_step(p_id uuid, p_reason text) returns void`
- `edit_entry(p_id uuid, p_body text, p_kind activity_kind, p_occurred_at timestamptz, p_contact uuid, p_deal uuid) returns void`
- `company_kind(uuid)`: prospect = no project and no won deal.

- [ ] **Step 1: Failing pgTAP** `supabase/tests/phase12_round3.test.sql` — fixtures: two sales users (sara `ae…01`, anna `ae…02`), PM `ae…03`, client A (`ae1…01`) with open deal (`ae2…01`) and lost deal (`ae2…02`), client B (`ae1…02`) with contact (`ae4…02`), client C (`ae1…03`) with nothing, client D (`ae1…04`) with a project. Assertions (as sara unless noted):
  1. `update_step` on a planned step changes body/kind; `edited_by` = caller.
  2. `update_step` with a new due date writes `Next step moved: … → …`.
  3. `update_step` with a new assignee writes `Next step reassigned to <name>`.
  4. `update_step` with B's contact on A's step → throws `22023`.
  5. `update_step` with the lost deal → throws `22023`.
  6. `update_step` with a non-sales assignee → throws `42501`.
  7. `update_step` on a done row → throws `P0002`.
  8. anna `cancel_step` on sara's step → status `cancelled`, `cancelled_by` = anna, reason stored.
  9. cancelled step not in `company_next_steps`.
  10. `cancel_step` twice → `P0002`.
  11. anna `edit_entry` on sara's done call → body changed, `edited_by` = anna, `actor_id` still sara.
  12. `edit_entry` on a system row → `P0002`.
  13. `edit_entry` moving to B's contact → `22023`.
  14. PM (non-sales) `edit_entry` / `cancel_step` / `update_step` → `42501` (three assertions).
  15. `company_kind(C)` = `prospect`; `company_kind(D)` = `client`; `company_kind(A)` = `prospect`.
  16. `anon` has no EXECUTE on the three new functions (three `has_function_privilege` assertions).
- [ ] **Step 2:** `npm run db:reset; npx supabase test db supabase/tests/phase12_round3.test.sql` → FAIL.
- [ ] **Step 3: Migration** — `alter type public.activity_status add value if not exists 'cancelled';` (usable inside plpgsql bodies created in the same file; do NOT reference it in plain SQL statements of this migration). Add columns. RPC bodies follow `reschedule_activity` style (`for update` lock, state guard, `auth.uid()`):
  - `update_step`: guard `manage_sales`; load row `for update`, require `status='planned'` else `P0002`; null `p_body` (trimmed empty) / `p_due_on` / `p_assignee` → `22004`; `p_contact` must be null or a contact of `v.client_id`, `p_deal` null or an open deal (`stage in ('new','contacted','offer_sent','negotiation')`) of `v.client_id`, else `22023`; `is_sales_assignable(p_assignee)` else `42501`; if `p_due_on <> v.due_on` insert the moved system entry (same text/metadata as `reschedule_activity`); if `p_assignee <> v.assignee_id` insert the reassigned entry (same as `reassign_activity`); update fields + `edited_at = now(), edited_by = auth.uid()`.
  - `cancel_step`: guard; planned else `P0002`; set `status='cancelled', cancelled_at=now(), cancelled_by=auth.uid(), cancel_reason=nullif(btrim(coalesce(p_reason,'')),'')`.
  - `edit_entry`: guard; row must be `status='done' and kind <> 'system'` else `P0002`; `p_kind` not `system` (`22023`); body required (`22004`); contact/deal belong to `v.client_id` (deal may be any stage) else `22023`; update `body, kind, occurred_at = coalesce(p_occurred_at, occurred_at), contact_id, deal_id, edited_at, edited_by`.
  - `company_kind`: `case when not exists (won deal) and not exists (project) then 'prospect' else 'client' end` (keep signature, grants).
- [ ] **Step 4:** `npm run db:reset && npm run test:db` → all PASS (phase9 invariants included).
- [ ] **Step 5: Commit** `feat(sales): edit/cancel steps, edit any entry, deal-less prospects`.

---

### Task 2: Types, actions, pure helpers

**Files:** Modify `src/lib/database.types.ts` (`npm run db:types`), `src/lib/validation/sales.ts`, `src/app/actions/sales.ts`; Create `src/lib/sales/list-filters.ts`, `src/lib/sales/timeline-filter.ts`, `src/lib/sales/preselect.ts`; Tests `tests/sales-list-filters.test.ts`, `tests/sales-timeline-filter.test.ts`, `tests/sales-preselect.test.ts`, extend `tests/sales-validation.test.ts`.

**Interfaces — Produces:**
```ts
// validation
export const updateStepSchema;  // { activity_id, kind (call|email|meeting|note), body 1..2000, due_on iso date, assignee_id uuid, contact_id uuid|null, deal_id uuid|null }
export const cancelStepSchema;  // { activity_id, reason: text(500) blank→null }
export const editEntrySchema;   // { activity_id, kind, body 1..5000, occurred_at iso datetime|null, contact_id|null, deal_id|null }
// actions
updateStepAction(input): Promise<Result>; cancelStepAction(input): Promise<Result>; editEntryAction(input): Promise<Result>;
// errors: 42501 → "That person doesn't have Sales access." | "Not authorized"; P0002 → "This step is already done or was removed." (steps) / "This entry can't be edited." (entries); 22023 → "That contact or deal belongs to another company or is closed."; 22004 → "Fill in the required fields."
// list-filters.ts
export type ListFilter = { from: string | null; to: string | null; responsible: string | null | "nobody" };
export function matchesStepFilter(step: { due_on: string; assignee: { id: string } | null } | null, f: ListFilter): boolean;
// from/to inclusive ISO dates; when from or to is set, rows without a step are excluded; responsible "nobody" = step without assignee OR no step; responsible id = step.assignee.id === id; null = any.
// timeline-filter.ts
export type TimelineMode = "entries" | "all";
export function visibleInTimeline(a: { kind: string; status: string }, mode: TimelineMode): boolean; // entries: kind !== 'system'; all: true
// preselect.ts
export function singleId<T extends { id: string }>(items: T[]): string | null; // exactly one → its id, else null
```
- [ ] **Step 1: Failing vitest** for each helper (cover: from-only, to-only, both inclusive edges, no-step rows with/without range, nobody; entries hides system but keeps done/cancelled user rows; singleId 0/1/2) and schema cases (blank body rejected, reason blank→null).
- [ ] **Step 2:** `npm run test` → FAIL. **Step 3:** implement helpers, schemas, actions (follow existing `completeStepAction` style; resolve `client_id` for revalidation; never return raw errors). **Step 4:** `npm run test`, `npx tsc --noEmit` clean. **Step 5: Commit** `feat(sales): round-3 actions, filters and preselect helpers`.

---

### Task 3: List — Responsible column + filters

**Files:** Modify `src/app/(app)/sales/companies-table.tsx`, `next-step-cell.tsx`, `pipeline-filters.tsx`; (loader unchanged — rows already carry `next_step.assignee`).
- [ ] NextStepCell back to one line (DueChip · kind icon · TruncateTooltip body) — no assignee inside.
- [ ] New **Responsible** column after Next step: PersonAvatar size-6 + TruncateTooltip full name (`max-w-40`), "—" when none; sortable by name (null last).
- [ ] Filters: **Next step date** control — a button chip showing "Any date" or `dd.mm.yyyy – dd.mm.yyyy` (open ends as "…"), opening a small popover/menu with From and To `<Input type="date">` and a Clear; **Responsible** select listing Sales people (avatar + name) plus "Nobody". Filter state extends `PipelineFilterState` with `from`, `to`, `responsible`; `EMPTY_FILTERS`/`hasActiveFilters` updated; predicate via `matchesStepFilter`. People list passed from the page (`loadSalesOwners` or `loadSalesPeople`).
- [ ] Verify scoped tsc/lint/test; browser (production build on a free port): filter by responsible Sara, by date range, clear. **Commit** `feat(sales): responsible column and next-step filters`.

---

### Task 4: Company page — edit/cancel steps, edit any entry, history filter, preselect

**Files:** Modify `companies/[id]/page.tsx` (select new columns; ActivityView gains `status` incl. cancelled, `edited_at`, `edited_by` name, `cancelled_at`, `cancelled_by` name, `cancel_reason`; `is_mine` kept for delete), `next-steps-card.tsx`, `activity-timeline.tsx`, `activity-composer.tsx`; Create `companies/[id]/step-edit-dialog.tsx`, `companies/[id]/entry-edit-dialog.tsx`, `companies/[id]/cancel-step-dialog.tsx`; types in `src/app/(app)/sales/types.ts`.
- [ ] Timeline query: `status in ('done','cancelled')` (planned stay in the card), ordering unchanged.
- [ ] **Next steps card:** row actions gain **Edit** (StepEditDialog: kind tabs, what to do, due date, responsible (assignable), contact, open deal; → `updateStepAction`) and **Cancel** (CancelStepDialog: optional reason → `cancelStepAction`). Existing Mark done / Change date / Reassign stay.
- [ ] **Timeline:** header toggle `Entries | All` (ToggleGroup; default entries; persisted in localStorage key `sales.timeline.mode`, wrapped in try/catch; render default during SSR, apply stored value after mount). Uses `visibleInTimeline`. User entries (non-system, status done) get a ⋯ menu: **Edit** for any manage user (EntryEditDialog → `editEntryAction`), **Delete** only when `is_mine`. Meta line adds `edited by <name> · dd.mm.yyyy` when `edited_at`. Cancelled steps render muted with `✕ Cancelled by <name> · dd.mm.yyyy` + reason.
- [ ] **Composer:** on mount and when switching mode, if contact select is empty use `singleId(contacts)`; if deal select empty use `singleId(openDeals)` (log and plan both use the respective list). Prefill from PlanStepProvider still wins.
- [ ] Verify: `npm run test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`; browser: anna edits sara's call → "edited by Anna Tamm"; edit a step's date via Edit → "Next step moved"; cancel a step → gone from card/list, ✕ in timeline (Entries mode shows it, All shows system too); single-contact company preselects contact. **Commit** `feat(sales): edit/cancel steps, edit entries, history filter, preselect`.

---

### Task 5: End-to-end verification
- [ ] `npm run db:reset && npm run test && npm run test:db && npm run lint && npm run build`.
- [ ] Browser as sara / anna / bella / admin: everything from Tasks 3–4 plus Viru Hotels shows Prospect; Clients page (as bella) no longer lists Viru Hotels; previous round's flows still work (mark done → plan next, deals menu, board). Console clean.
- [ ] `npm run db:reset`; `rm -f *.png`; git status clean (ignore untracked `supabase/snippets/wipe-demo-data.sql`).
