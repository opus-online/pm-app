# CRM / Sales module — design

Date: 2026-10-06 · Status: approved in conversation, awaiting spec review

## Purpose

Opus needs one place to track sales: which companies we are talking to, what
we have offered them, who did what and when, and what has to happen next.
Anyone with Sales access should see at a glance which leads need action today.

Source: the PM's requirements (Estonian brief: lead list with name / reg code /
contacts; lead add-edit; N contacts; projects + offers under a lead; activity
log; notifications later) plus decisions made with the user in conversation.

## Decisions

| Topic | Decision |
|---|---|
| Lead vs client | **One company record.** Companies live in the existing `clients` table. A company is a *Prospect* until it has a project or a won deal, then a *Client* — derived, never set by hand. |
| Many opportunities | A company has **many deals** over time; each deal has **many offers** (versions). The PM's "project under a lead" = a deal. |
| Stages | New → Contacted → Offer sent → Negotiation → Won / Lost. Lost requires a reason. |
| Source | Inbound, Outbound, Referral, Existing client, Event, Other. |
| Access | New **Sales** access (`view_sales`, `manage_sales`). Admins have it; others get it explicitly. Without it the CRM does not exist for you, enforced by RLS. |
| Urgency | Each deal has an **owner** and a **next follow-up date**; lists sort by it, overdue first. |
| Offer documents | **Link only** (Drive/SharePoint URL). No uploads in this version. |
| Drag and drop | Board view on the Sales page only, using `@dnd-kit`. Not on the company page. |

Out of scope (later): notifications (MVP2), file uploads, email/inbox
integration, Excel import, multi-currency (EUR only).

## Data model

### `clients` (extended)
- `reg_code text` — nullable (existing clients have none). Unique on
  `upper(regexp_replace(reg_code, '\s', '', 'g'))` where not null.
- `email text`, `website text` (http/https only, same `z.url` protocol guard as links).
- Existing `phone`, `notes` reused. Legacy `contact_name`/`contact_email` untouched.
- Derived `company_kind` ('prospect' | 'client'): **prospect** = has at least one
  deal, no won deal and no project; everything else is a **client** (so companies
  created from the Clients page or project form stay clients). Computed by a
  SECURITY DEFINER function `company_kind(client_id)` so the answer is the same
  for every viewer even though deals are RLS-hidden from non-sales users. Not stored.
- The Clients page hides prospects; they appear only under Sales. Company base
  data (name, reg code, contacts) keeps the existing `view_clients` RLS — it is
  not sensitive; deals, offers and activities are.

### `client_contacts` (extended)
- Add `first_name`, `last_name`, `gender` (enum `female | male | other`, nullable),
  `description`. Existing `role` is shown as **Position**.
- Backfill: split existing `name` on the first space into first/last.
- `name` stays as the display name, maintained by a trigger from first + last,
  so existing reads of `name` keep working.

### `deals` (new)
`id, client_id → clients (cascade), title, stage deal_stage, source deal_source,
owner_id → user_profiles, next_follow_up_on date, lost_reason text,
won_at timestamptz, project_id → projects (nullable, set null), created_by,
created_at, updated_at`.
- Check: `stage = 'lost'` requires non-empty `lost_reason`.
- `won_at` set by trigger when stage becomes `won`, cleared if it leaves `won`.

### `offers` (new)
`id, deal_id → deals (cascade), title, amount numeric(12,2) ≥ 0, sent_on date,
valid_until date, status offer_status (draft | sent | accepted | rejected),
link_url text (http/https), note, created_by, created_at, updated_at`.
- "Latest offer" of a deal = most recent by `coalesce(sent_on, created_at)`.

### `crm_activities` (new)
`id, client_id → clients (cascade), deal_id (nullable, set null),
contact_id (nullable, set null), kind activity_kind (call | email | meeting |
note | system), body text, occurred_at timestamptz default now(),
actor_id uuid default auth.uid(), metadata jsonb, created_at`.
- `actor_id` is forced to `auth.uid()` by a BEFORE INSERT trigger (cannot be forged).
- Users insert only `call | email | meeting | note`. `system` rows are written
  only by SECURITY DEFINER triggers on deals/offers:
  deal created, stage changed (from → to), owner changed, offer added,
  offer status changed. Body is generated text; details in `metadata`.
- Users may edit/delete only their own non-system entries.

### Permissions
- New permissions `view_sales`, `manage_sales` (not delegatable).
- New role `sales` granting both (global). `admin` gets both.
- Granting: Admin → Users gets a **Sales access** toggle that adds/removes the
  `sales` role alongside the user's main role (`user_roles` already allows
  several roles per user).
- RLS: `deals`, `offers`, `crm_activities` readable with `view_sales`,
  writable with `manage_sales`. `clients` / `client_contacts` RLS unchanged,
  except that `manage_sales` may also insert/update companies and contacts
  (salespeople must be able to create prospects). Every new table gets explicit GRANTs (hosted + local
  `auto_expose_new_tables` is off).

## Screens

### Navigation
"Sales" item after Clients, shown only with `view_sales`.

### `/sales` — pipeline
- **Header**: title, view toggle List | Board (`?view=board`), **New lead** button (`manage_sales`).
- **KPI tiles** (shared `StatCard`): Open deals · Pipeline € (sum of latest offer
  of open deals) · Follow-ups due (today + overdue) · Won this month €.
- **Filters** (chip language from projects): stage, source, owner, "Closed"
  toggle (shows won/lost; hidden by default), search over company name,
  reg code, contact name/email/phone (`escapeIlike`).
- **List** (default), one row per deal, 10/page:
  Company (tile + name, reg code subline, Prospect/Client micro-label) ·
  Deal (title, source chip) · Contacts (up to 2 stacked: name, phone, email;
  "+N more" tooltip — same pattern as Clients list) · Stage (dot badge) ·
  Latest offer € · Owner (avatar) · Follow-up chip.
  Sort: `next_follow_up_on` ascending, overdue first, deals with no date last;
  columns also sortable (existing `use-sort`).
  Follow-up chip reuses the dashboard's 5 deadline tone buckets as-is
  (overdue · today · tomorrow · ≤7 days · later) so urgency colours mean the
  same thing everywhere.
- **Board**: one column per stage with count + € total. Cards: company,
  deal title, latest offer €, owner avatar, follow-up chip. Drag to change
  stage (optimistic; on failure the card returns + toast). Dropping on Lost
  opens a dialog asking for the reason. Won / Lost are narrow columns at the
  end showing the last 30 days only. Keyboard drag supported (dnd-kit).

### New lead dialog
1. Company: search existing (name / reg code) or "Create new company"
   (name, reg code, phone, email, website). Entering a reg code that exists
   shows "Already exists: <name> → Open" inline, before submit.
2. Deal: title, source, owner (default me), next follow-up.
3. Optional first contact (first, last, position, email, phone).
One server action, one transaction (RPC), so no half-created leads.

### `/sales/companies/[id]` — company workspace
- **Header**: tile, name, Prospect/Client label, reg code, phone (tel:),
  email (mailto:), website, Edit (company form incl. contacts editor).
- **Left column**: Deals card (each: title, stage badge, latest offer €,
  follow-up chip, owner; "+ New deal") · Contacts card (name, position,
  click-to-call/email, description on hover; add/edit/delete).
- **Main column**: Activity timeline, newest first, grouped by day.
  Quick-log composer on top: type tabs Call / Email / Meeting / Note,
  contact select, deal select, text, optional "Set next follow-up" for
  the chosen deal. System entries render muted with an icon.
- **Deal side panel** (Sheet), opened from a deal card or board card:
  stage/source/owner/follow-up editing, offers table (title, amount,
  status, sent, valid until, link; add/edit/delete), deal-only timeline,
  **Create project** when won → existing New project dialog prefilled with
  the client; on save `deals.project_id` is set.
- Existing `/clients/[id]` shows a "Sales" link for `view_sales` holders.

### Forms
Contact fields: first name (required), last name, gender, email, phone,
position, description. Company: name (required), reg code, phone, email,
website, notes. Same `FormSection` + sticky `DialogFooter` patterns as the
rest of the app. No help texts (client rule).

## Code layout
- `supabase/migrations/2026100600000N_crm_*.sql` — schema, triggers, RLS, views, RPC.
- `src/app/(app)/sales/` — `page.tsx`, `pipeline-table.tsx`, `pipeline-board.tsx`,
  `new-lead-dialog.tsx`, `types.ts`, `companies/[id]/…` (header, deals card,
  contacts card, timeline, composer, deal sheet, offer form).
- `src/app/actions/sales.ts` — server actions, each `requirePermission`.
- `src/lib/sales/` — pure helpers: follow-up urgency/sort, latest offer,
  pipeline totals, reg-code normalisation, zod schemas.
- Client components receive explicitly allowlisted row shapes (security rule
  from the 2026-07-29 audit — never spread raw rows).

## Error handling
- Duplicate reg code: unique violation (23505) mapped to "Already exists" with a link.
- Board move failure: revert card, toast with reason.
- Lost without reason: blocked client-side and by DB check.
- All actions return typed `{ ok | error }` like existing actions.

## Testing
- **pgTAP**: non-sales user sees zero deals/offers/activities;
  `company_kind` is identical for sales and non-sales viewers; sales user full CRUD; reg-code uniqueness (case/space-insensitive);
  `actor_id` cannot be forged; users cannot insert `system` activities;
  stage/offer triggers write system entries; lost requires reason; GRANTs present.
- **Vitest**: urgency buckets + sort (incl. no-date last), latest offer,
  pipeline totals, reg-code normalisation, zod schemas, search escaping.
- **Browser** (Playwright): sales user, PM without Sales (no nav item, 404 on
  /sales), admin; board drag; console clean.

## Seed
Demo: 1 sales user (`sara.sales@pmcms.local`), 5 prospect companies with reg
codes and contacts, ~10 deals across all stages and sources, offers in each
status, ~40 activities over the last 3 months, follow-ups spread across
overdue / today / this week / later. Fixed UUID prefixes (`7…` deals,
`8…` offers) so demo data can be removed cleanly.
