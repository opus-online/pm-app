# Sales round 2 — next steps (MVP) — design

Date: 2026-10-08 · Status: approved in conversation, awaiting spec review
Builds on: `2026-10-06-crm-sales-design.md`

## Purpose

The PM needs to see, per company, **what the next step is, when, and who does it**, and to
know **whether the previous step was actually done**. Today the follow-up is a bare date on a
deal, and activities are only a log of the past.

Source: PM feedback (Estonian), MVP subset:
- List: companies show without a deal; follow-up shows next contact date `dd.mm.yyyy`, what the
  step is, and who must make contact; long text truncates with a tooltip.
- Detail: an activity can be assigned to a user with Sales access; an activity can be marked
  done with date, by whom, and a comment.

## Decisions

| Topic | Decision |
|---|---|
| Model | An activity is either **done** (logged after the fact) or a **planned next step** (due date, assignee, what to do). Same table, same timeline. |
| Follow-up | The **company's next open step** (earliest due date). The deal-level `next_follow_up_on` is retired; existing values are migrated into planned steps assigned to the deal owner. |
| Mark done | Records done date (default today), done by (default me, any Sales user), optional comment. Any Sales user may mark any step done. |
| Postpone | Changing a planned step's due date writes a system entry `Next step moved: 14.10.2026 → 21.10.2026`. |
| List rows | **One row per company** (all companies, with or without deals). The board stays deal-based. |
| Dates | Everything in Sales renders `dd.mm.yyyy` (et-EE), date-only values in UTC calendar terms, "today" in `APP_TIME_ZONE`. |
| Tiny extras | Offer column header `Offer (€)`; the Prospect label gets a tooltip: "No project or won deal yet". |

Out of scope (later): preselect single contact/deal in the composer, hide system entries by default,
anyone can edit any entry, follow-up date-range filter, assignee filter.

## Data model

### `crm_activities` (extended)
- `status activity_status not null default 'done'` — enum `planned | done`.
- `due_on date` — required when `status='planned'` (check).
- `assignee_id uuid → user_profiles` — required when planned (check); must hold `view_sales`
  (enforced in the RPC/action, not a DB check).
- `done_at timestamptz`, `done_by uuid → user_profiles`, `done_comment text` — set when a
  planned step is completed. A step logged directly as done keeps `done_*` null and uses
  `occurred_at`/`actor_id` as today.
- `kind` stays (`call | email | meeting | note | system`); system rows are always `done`.
- Index `(client_id, status, due_on)`.

### Writes
- Insert planned step: existing insert policy (actor = auth.uid(), kind ≠ system) plus
  `status='planned'`, `due_on`, `assignee_id`.
- **`complete_activity(p_id uuid, p_done_on date, p_done_by uuid, p_comment text)`** —
  SECURITY DEFINER, requires `manage_sales`, row must be `planned`; sets `status='done'`,
  `done_at = p_done_on` (at 12:00 APP_TIME_ZONE), `done_by`, `done_comment`; `p_done_by` must
  hold `view_sales`. Writes nothing else.
- **`reschedule_activity(p_id uuid, p_due_on date)`** — SECURITY DEFINER, requires
  `manage_sales`, row must be `planned`; updates `due_on` and inserts system entry
  `Next step moved: <old> → <new>` (dd.mm.yyyy) with metadata `{activity_id, from, to}`.
- **`reassign_activity(p_id uuid, p_assignee uuid)`** — same guards; system entry
  `Next step reassigned to <name>`.
- Users still edit/delete only their own entries (unchanged policy); the three RPCs are how
  others act on a step.

### Retiring `deals.next_follow_up_on`
Migration: for each deal with a non-null `next_follow_up_on` and stage open, insert a planned
step (`kind='call'`, body `Follow up: <deal title>`, `due_on` = that date, `assignee_id` = deal
owner, `deal_id` set, `actor_id` = deal owner). Then drop the column, remove the follow-up
branch from `log_deal_activity` (added 2026-10-07), and drop `follow_up_label`.

### `next_step` view (security_invoker)
`company_next_steps`: per `client_id`, the open planned step with the earliest `due_on`
(ties: earliest `created_at`) — `activity_id, client_id, deal_id, due_on, kind, body,
assignee_id`. Per deal: `deal_next_steps` the same keyed by `deal_id`. Used by list, board,
KPIs.

## Screens

### `/sales` list — company rows
Columns: **Company** (tile, name, reg code, Prospect/Client label with tooltip) · **Contacts**
(as today) · **Deals** (open count + stage dots; `—` when none) · **Offer (€)** (sum of latest
offer of open deals) · **Next step** (`14.10.2026` chip in urgency tone, then the step text
truncated with full text in a tooltip, then assignee avatar; `—` when none) · **Owner**
removed (the assignee is the "who").
Sort default: next step due date ascending, overdue first, none last. Filters: search (as
today), stage (company has an open deal in that stage), source, "Show closed" removed from
list (no closed companies). Row click → company page.
KPIs: Open deals · Pipeline € · **Steps due** (open steps due today or overdue) · Won this month €.
Every truncating text cell (company, step, contact) uses ellipsis + tooltip.

### Board (deal-based, unchanged layout)
Card follow-up chip → the deal's next open step date; tooltip shows step text + assignee.

### Company page
- **Next steps card** above the timeline: open steps sorted by due date. Row: date chip
  (`dd.mm.yyyy`, urgency tone), kind icon, text (truncate + tooltip), assignee avatar, contact
  / deal chips. Actions: **Mark done** (dialog: done date default today, done by default me,
  comment) → on success a toast with **Plan next step** that opens the composer in plan mode
  prefilled with the same contact/deal; **Change date** (date input → `reschedule_activity`);
  **Reassign** (assignee select).
- **Composer** gets a mode toggle **Log done | Plan next step**. Plan mode: what to do
  (required), due date (required), assignee (Sales users, default me), contact, deal. The old
  "Next follow-up" field is removed.
- **Timeline**: done steps show `✓ Done by <name> · dd.mm.yyyy` + comment under the original
  text; planned steps are not in the timeline (they live in the Next steps card). System
  entries for move/reassign appear as today.
- **Deal sheet**: the "Next follow-up" field is replaced by a read-only "Next step" line (date,
  text, assignee) with a link "Plan step" that opens the composer in plan mode for that deal.

## Testing
- pgTAP: planned requires due_on + assignee; complete/reschedule/reassign RPC permission
  (non-sales rejected), state guard (only planned), system entries written with actor;
  assignee must have view_sales; migration converts deal follow-ups; `company_next_steps`
  picks earliest open step; non-sales sees nothing.
- Vitest: company list sort (overdue → today → later → none), dd.mm.yyyy formatter, truncation
  helpers if any, plan-mode schema (due date + assignee required).
- Browser: sara plans a step for anna → appears in list with date/text/avatar; anna marks it
  done with comment → timeline shows ✓ Done by Anna; reschedule writes the system entry;
  company without deals shows in list.

## Seed
Update CRM demo seed: replace deal follow-up dates with planned steps (mix of overdue / today /
later, different assignees), plus a few completed steps with comments, and one company with no
deals but a planned step.
