# Sales round 3 — editing, filters, responsible column — design

Date: 2026-10-08 · Status: approved in conversation, awaiting spec review
Builds on: `2026-10-08-sales-next-steps-design.md` (branch `feat/sales-next-steps`, not yet live)

## Purpose
Finish the PM's "later" list and make "who is responsible" first-class in the list.

## Decisions

| # | Topic | Decision |
|---|---|---|
| 1 | Responsible in list | New **Responsible** column (avatar + full name of the next step's assignee, "—" when none), sortable. The assignee badge under the step text is removed. |
| 2 | List filters | **Next step date range** (from / to, each optional, inclusive, `dd.mm.yyyy` inputs) and **Responsible** (any Sales person, or "Nobody"). Both combine with existing search / stage / has-step filters. |
| 3 | Edit next steps | A planned step is fully editable by any Sales user: what to do, type, due date, responsible, contact, deal (open deals only). Due date / responsible changes keep logging their system entries ("Next step moved…", "…reassigned to…"). |
| 4 | Cancel next step | Any Sales user can cancel a planned step (optional reason). It leaves the Next steps card and the timeline shows `✕ Cancelled by <name> · dd.mm.yyyy` + reason. |
| 5 | Edit any entry | Any Sales user can edit the text (and type, contact, deal, when) of any non-system done entry. The entry then shows `edited by <name> · dd.mm.yyyy`. Delete stays author-only. System entries are never editable. |
| 6 | History filter | Timeline toggle **Entries** (default: calls/emails/meetings/notes and completed/cancelled steps) **| All** (adds automatic system entries). Choice remembered per browser (localStorage, try/catch). |
| 7 | Log box preselect | When the company has exactly one contact, it is preselected; same for exactly one open deal (in both Log done and Plan next step). |
| 8 | Prospect rule | A company is a **Prospect** when it has no project and no won deal (deals no longer required). `company_kind` and `prospect_client_ids()` change accordingly; the Clients page therefore also hides deal-less, project-less companies — **accepted consequence:** a company added on the Clients page with no project yet shows only under Sales until it gets a project. |

## Data model
- `activity_status` enum gains `'cancelled'`.
- `crm_activities` gains `cancelled_at timestamptz`, `cancelled_by uuid → user_profiles`, `cancel_reason text`, `edited_at timestamptz`, `edited_by uuid → user_profiles`.
- Views `company_next_steps` / `deal_next_steps` already filter `status='planned'` → cancelled steps drop out automatically.
- **RPCs (SECURITY DEFINER, require `manage_sales`, `set search_path`, revoke public/anon):**
  - `update_step(p_id, p_body, p_kind, p_due_on, p_assignee, p_contact, p_deal)` — row must be `planned`; validates contact/deal belong to the step's client and deal is open; assignee assignable; writes the existing moved/reassigned system entries when those change; sets `edited_at/edited_by`.
  - `cancel_step(p_id, p_reason)` — row must be planned; sets `status='cancelled'`, `cancelled_at=now()`, `cancelled_by=auth.uid()`, `cancel_reason`.
  - `edit_entry(p_id, p_body, p_kind, p_occurred_at, p_contact, p_deal)` — row must be `done` and `kind <> 'system'`; same client checks; sets `edited_at/edited_by`. (The own-entry UPDATE policy stays for backward compatibility but the UI uses this RPC.)
  - `reschedule_activity` / `reassign_activity` remain (used by update_step internally or by quick actions).
- `company_kind(uuid)`: `'prospect'` when no project and no won deal, else `'client'`.

## UI
- **List** (`companies-table.tsx`): Responsible column after Next step; NextStepCell back to one line (chip · icon · text). Filters bar gains a date-range popover ("Next step: any date" → "14.10.2026 – 31.10.2026") and a Responsible select (avatar options). Clear pill resets all.
- **Next steps card**: each row gets an **Edit** action (dialog with all fields, same layout as composer plan mode) and **Cancel** (confirm dialog with optional reason). Mark done / Change date / Reassign stay.
- **Timeline**: toggle Entries | All in the card header; each user entry shows ⋯ menu with **Edit** for any Sales user and **Delete** for the author only; "edited by" meta line; cancelled steps render muted with ✕.
- **Composer**: single-option preselect for contact and open deal.

## Testing
- pgTAP: cancelled enum + columns; update_step (any sales user, planned only, client consistency, closed deal rejected, assignee assignable, moved/reassigned entries written, edited_by set); cancel_step (planned only, leaves views); edit_entry (any sales user edits another's done entry, system entries rejected, client consistency, edited_by set); non-sales rejected for all; company_kind for deal-less company = prospect.
- Vitest: list filter predicate (date range inclusive with open ends, responsible incl. "Nobody"), timeline filter (Entries vs All), preselect helper.
- Browser: anna edits sara's call text → "edited by Anna Tamm"; cancel a step → gone from card/list, ✕ in timeline; list filters by date range and responsible; Viru Hotels shows Prospect.

## Out of scope
Notifications (MVP2), assignee/date filters on the board, bulk edit.
