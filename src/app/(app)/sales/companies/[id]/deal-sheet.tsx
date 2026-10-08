"use client";

import { useId, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowUpRight, Building2, CalendarPlusIcon, ExternalLink, MoreHorizontal, PartyPopper, PlusIcon } from "lucide-react";
import { toast } from "sonner";
import {
  deleteDealAction, deleteOfferAction, linkDealProjectAction, updateDealAction,
} from "@/app/actions/sales";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DotBadge } from "@/components/dot-badge";
import { PersonAvatar } from "@/components/person-avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { DESTRUCTIVE_ACTION_CLASS } from "@/lib/action-styles";
import { latestOffer, offersNewestFirst } from "@/lib/sales/pipeline";
import { DEAL_SOURCES, DEAL_STAGES, OPEN_STAGES, type DealSource, type DealStage } from "@/lib/sales/types";
import { appDayKey } from "@/lib/time-zone";
import { cn } from "@/lib/utils";
import type { DealUpdateInput } from "@/lib/validation/sales";
import { formatDateEt } from "@/lib/sales/date-format";
import type { NextStep } from "@/lib/sales/next-step";
import { ProjectCreateDialog } from "../../../projects/project-create-dialog";
import type {
  ClientContactOption, ClientOption, PmOption,
} from "../../../projects/new/project-create-fields";
import { KIND_META } from "../../activity-kind";
import { DueChip } from "../../due-chip";
import { LostReasonDialog } from "../../lost-reason-dialog";
import { formatEur } from "../../money";
import { TruncateTooltip } from "../../truncate-tooltip";
import { OFFER_STATUS_DOT, OFFER_STATUS_LABEL, SOURCE_LABEL, STAGE_DOT, STAGE_LABEL } from "../../stage";
import type { ActivityView, CompanyView, ContactView, DealView, OfferView, SalesOwnerOption } from "../../types";
import { ActivityTimeline } from "./activity-timeline";
import { OfferFormDialog } from "./offer-form-dialog";
import { usePlanStep } from "./plan-step-context";
import { useUnstickRefresh } from "./use-unstick-refresh";

/** Options for the New project dialog -- present only when the viewer may create projects and a
 * won deal still lacks one (loaded by the company page). */
export type ProjectDialogData = {
  clients: ClientOption[];
  contacts: ClientContactOption[];
  pms: PmOption[];
  currentUserId: string;
};

const FIELD_LABEL = "text-xs font-normal text-muted-foreground";
const SECTION_TITLE = "flex items-center gap-2 text-sm font-medium";

/** The deal panel, driven by ?deal= (the page passes the matching deal or null). Closing drops
 * the param. The last deal stays rendered while the sheet animates out. */
export function DealSheet({
  deal,
  company,
  activities,
  contacts,
  deals,
  owners,
  canManage,
  projectDialogData,
}: {
  deal: DealView | null;
  company: CompanyView;
  activities: ActivityView[];
  /** The company's contacts and deals, for editing a timeline entry. */
  contacts: ContactView[];
  deals: DealView[];
  owners: SalesOwnerOption[];
  canManage: boolean;
  projectDialogData: ProjectDialogData | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const popupRef = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(deal);
  if (deal && deal !== shown) setShown(deal);
  // Close at once on click; the URL catches up a moment later.
  const [closedId, setClosedId] = useState<string | null>(null);
  if (!deal && closedId) setClosedId(null);
  const open = deal !== null && deal.id !== closedId;

  function close() {
    if (deal) setClosedId(deal.id);
    router.replace(pathname, { scroll: false });
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && close()}>
      {/* Focus lands on the panel itself, not on the first control (the rename button). */}
      <SheetContent
        ref={popupRef}
        initialFocus={popupRef}
        side="right"
        className="gap-0 p-0 outline-none data-[side=right]:w-full data-[side=right]:sm:max-w-xl"
      >
        {shown && (
          <DealSheetBody
            key={shown.id}
            deal={shown}
            company={company}
            activities={activities}
            contacts={contacts}
            deals={deals}
            owners={owners}
            canManage={canManage}
            projectDialogData={projectDialogData}
            onClose={close}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function DealSheetBody({
  deal: serverDeal,
  company,
  activities,
  contacts,
  deals,
  owners,
  canManage,
  projectDialogData,
  onClose,
}: {
  deal: DealView;
  company: CompanyView;
  activities: ActivityView[];
  contacts: ContactView[];
  deals: DealView[];
  owners: SalesOwnerOption[];
  canManage: boolean;
  projectDialogData: ProjectDialogData | null;
  onClose: () => void;
}) {
  const ids = useId();
  const router = useRouter();
  const { planNext } = usePlanStep();
  // Field edits show at once as a local patch over the server's deal; the next server render
  // (the action's revalidation) replaces it, and a failed save drops it.
  const [patch, setPatch] = useState<Partial<DealView> | null>(null);
  const [syncedDeal, setSyncedDeal] = useState(serverDeal);
  if (syncedDeal !== serverDeal) {
    setSyncedDeal(serverDeal);
    setPatch(null);
  }
  const deal = patch ? { ...serverDeal, ...patch } : serverDeal;
  const [saving, startTransition] = useTransition();
  useUnstickRefresh(saving);
  const [lostOpen, setLostOpen] = useState(false);
  const [projectOpen, setProjectOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [offerFormOpen, setOfferFormOpen] = useState(false);
  const [editingOffer, setEditingOffer] = useState<OfferView | null>(null);
  const [deletingOffer, setDeletingOffer] = useState<OfferView | null>(null);

  const offers = offersNewestFirst(deal.offers);
  const latest = latestOffer(deal.offers);
  const dealActivities = activities.filter((a) => a.deal_id === deal.id);
  // The owner is always selectable even if they're no longer in the sales roster.
  const ownerOptions = owners.some((o) => o.id === deal.owner.id) ? owners : [deal.owner, ...owners];

  function save(input: DealUpdateInput, optimistic: Partial<DealView>) {
    setPatch((p) => ({ ...p, ...optimistic }));
    startTransition(async () => {
      try {
        const result = await updateDealAction(deal.id, input);
        if ("error" in result) toast.error(result.error);
      } catch {
        toast.error("Save failed. Try again.");
      }
      // Drop the patch in the same commit as the revalidated server render (or revert it on a
      // failed save).
      startTransition(() => setPatch(null));
    });
  }

  function changeStage(stage: DealStage) {
    if (stage === deal.stage) return;
    if (stage === "lost") {
      setLostOpen(true);
      return;
    }
    // Leaving Lost clears its reason (the DB only requires one while lost).
    if (deal.stage === "lost") save({ stage, lost_reason: null }, { stage, lost_reason: null });
    else save({ stage }, { stage });
  }

  /** Resolves once saved (the dialog shows "Saving…" until then); runs in the save transition so
   * useUnstickRefresh covers it too. */
  function markLost(reason: string) {
    return new Promise<void>((resolve) => {
      startTransition(async () => {
        try {
          const result = await updateDealAction(deal.id, { stage: "lost", lost_reason: reason });
          if ("error" in result) toast.error(result.error);
          else setLostOpen(false);
        } catch {
          toast.error("Save failed. Try again.");
        }
        resolve();
      });
    });
  }

  async function projectCreated(projectId: string) {
    setProjectOpen(false);
    try {
      const result = await linkDealProjectAction(deal.id, projectId);
      if ("error" in result) toast.error("Project created, but it couldn't be linked to the deal.");
      else toast.success("Project created");
    } catch {
      toast.error("Project created, but it couldn't be linked to the deal.");
    }
    router.push(`/projects/${projectId}`);
  }

  function nextOfferTitle() {
    const versions = deal.offers.map((o) => /^v(\d+)$/i.exec(o.title.trim()));
    if (versions.some((m) => !m)) return "";
    return `v${Math.max(0, ...versions.map((m) => Number(m![1]))) + 1}`;
  }

  return (
    <>
      <SheetHeader className="gap-1.5 border-b px-5 pt-5 pb-4 pr-12">
        <SheetDescription className="flex items-center gap-1.5 text-xs">
          <Building2 aria-hidden className="size-3.5" />
          {company.name}
        </SheetDescription>
        <DealTitle
          title={deal.title}
          canEdit={canManage}
          onSave={(title) => save({ title }, { title })}
        />
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <DotBadge dotClassName={STAGE_DOT[deal.stage]}>{STAGE_LABEL[deal.stage]}</DotBadge>
          {latest && (
            <span className="text-sm font-medium tabular-nums">
              {formatEur(latest.amount)}
              <span className="ml-1.5 text-xs font-normal text-muted-foreground">latest offer</span>
            </span>
          )}
          {saving && <span className="ml-auto text-xs text-muted-foreground">Saving…</span>}
        </div>
      </SheetHeader>

      <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
        {deal.stage === "won" && (
          <WonBanner
            projectId={deal.project_id}
            canCreate={canManage && projectDialogData !== null}
            onCreate={() => setProjectOpen(true)}
          />
        )}

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3.5 rounded-xl border bg-muted/30 p-4">
          <Field label="Stage" htmlFor={`${ids}-stage`}>
            {canManage ? (
              <Select value={deal.stage} onValueChange={(v) => v && changeStage(v as DealStage)}>
                <SelectTrigger id={`${ids}-stage`} size="sm" className="w-full bg-background">
                  <SelectValue>{(v: DealStage) => <Dot className={STAGE_DOT[v]}>{STAGE_LABEL[v]}</Dot>}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {DEAL_STAGES.map((s) => (
                    <SelectItem key={s} value={s}>
                      <Dot className={STAGE_DOT[s]}>{STAGE_LABEL[s]}</Dot>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Dot className={STAGE_DOT[deal.stage]}>{STAGE_LABEL[deal.stage]}</Dot>
            )}
          </Field>
          <Field label="Source" htmlFor={`${ids}-source`}>
            {canManage ? (
              <Select
                value={deal.source}
                onValueChange={(v) => v && v !== deal.source && save({ source: v as DealSource }, { source: v as DealSource })}
              >
                <SelectTrigger id={`${ids}-source`} size="sm" className="w-full bg-background">
                  <SelectValue>{(v: DealSource) => SOURCE_LABEL[v]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {DEAL_SOURCES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {SOURCE_LABEL[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              SOURCE_LABEL[deal.source]
            )}
          </Field>
          <Field label="Owner" htmlFor={`${ids}-owner`}>
            {canManage ? (
              <Select
                value={deal.owner.id}
                onValueChange={(v) => {
                  const owner = ownerOptions.find((o) => o.id === v);
                  if (owner && owner.id !== deal.owner.id) save({ owner_id: owner.id }, { owner });
                }}
              >
                <SelectTrigger id={`${ids}-owner`} size="sm" className="w-full bg-background">
                  <SelectValue>
                    {(v: string) => {
                      const o = ownerOptions.find((x) => x.id === v) ?? deal.owner;
                      return <OwnerOption name={o.name} avatarUrl={o.avatar_url} />;
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {ownerOptions.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      <OwnerOption name={o.name} avatarUrl={o.avatar_url} />
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <OwnerOption name={deal.owner.name} avatarUrl={deal.owner.avatar_url} />
            )}
          </Field>
          <div className="col-span-2 space-y-1.5">
            <dt className={FIELD_LABEL}>Next step</dt>
            <dd className="flex min-h-7 items-center gap-2 text-sm">
              <NextStepLine step={deal.next_step} />
              {canManage && OPEN_STAGES.includes(deal.stage) && (
                <Button
                  size="xs"
                  variant="ghost"
                  className="ml-auto shrink-0 text-muted-foreground"
                  onClick={() => {
                    planNext({ contact_id: null, deal_id: deal.id });
                    onClose();
                  }}
                >
                  <CalendarPlusIcon />
                  Plan step
                </Button>
              )}
            </dd>
          </div>
          {deal.stage === "lost" && (
            <div className="col-span-2 space-y-1.5">
              <dt className={FIELD_LABEL}>Lost reason</dt>
              <dd className="rounded-lg border border-rose-500/15 bg-rose-500/5 px-3 py-2 text-sm whitespace-pre-line text-foreground/90 dark:bg-rose-500/10">
                {deal.lost_reason ?? "—"}
              </dd>
            </div>
          )}
        </dl>

        <section className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h3 className={SECTION_TITLE}>
              Offers
              <span className="text-xs font-normal text-muted-foreground tabular-nums">{offers.length}</span>
            </h3>
            {canManage && (
              <Button
                size="xs"
                variant="ghost"
                className="text-muted-foreground"
                onClick={() => {
                  setEditingOffer(null);
                  setOfferFormOpen(true);
                }}
              >
                <PlusIcon />
                Add offer
              </Button>
            )}
          </div>
          {offers.length === 0 ? (
            <p className="rounded-lg border border-dashed px-3 py-5 text-center text-sm text-muted-foreground">
              No offers yet.
            </p>
          ) : (
            <OffersTable
              offers={offers}
              latestId={latest?.id ?? null}
              canManage={canManage}
              onEdit={(o) => {
                setEditingOffer(o);
                setOfferFormOpen(true);
              }}
              onDelete={setDeletingOffer}
            />
          )}
        </section>

        <ActivityTimeline
          activities={dealActivities}
          contacts={contacts}
          deals={deals}
          canManage={canManage}
          showDeal={false}
          emptyText="No activity on this deal yet."
          people={owners}
        />
      </div>

      {canManage && (
        <SheetFooter className="flex-row justify-start border-t px-5 py-3">
          <Button
            variant="ghost"
            size="sm"
            className={DESTRUCTIVE_ACTION_CLASS}
            onClick={() => setDeleteOpen(true)}
          >
            Delete deal
          </Button>
        </SheetFooter>
      )}

      {canManage && (
        <>
          <LostReasonDialog open={lostOpen} onOpenChange={setLostOpen} onConfirm={markLost} />
          <OfferFormDialog
            dealId={deal.id}
            offer={editingOffer ?? undefined}
            suggestedTitle={nextOfferTitle()}
            open={offerFormOpen}
            onOpenChange={setOfferFormOpen}
          />
          <ConfirmDialog
            open={deletingOffer !== null}
            onOpenChange={(o) => !o && setDeletingOffer(null)}
            title={`Delete offer ${deletingOffer?.title ?? ""}?`}
            description="The offer is removed from this deal for everyone."
            onConfirm={async () => {
              if (!deletingOffer) return;
              try {
                const result = await deleteOfferAction(deletingOffer.id);
                if ("success" in result) toast.success("Offer deleted");
                return result;
              } catch {
                return { error: "Delete failed. Try again." };
              }
            }}
          />
          <ConfirmDialog
            open={deleteOpen}
            onOpenChange={setDeleteOpen}
            title={`Delete “${deal.title}”?`}
            description="The deal, its offers and its timeline entries are removed for everyone."
            confirmLabel="Delete deal"
            onConfirm={async () => {
              try {
                const result = await deleteDealAction(deal.id);
                if ("error" in result) return result;
              } catch {
                return { error: "Delete failed. Try again." };
              }
              toast.success("Deal deleted");
              onClose();
            }}
          />
          {projectDialogData && deal.stage === "won" && !deal.project_id && (
            <ProjectCreateDialog
              {...projectDialogData}
              open={projectOpen}
              onOpenChange={setProjectOpen}
              hideTrigger
              defaultClientId={company.id}
              onCreated={projectCreated}
            />
          )}
        </>
      )}
    </>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 space-y-1.5">
      <dt>
        <Label htmlFor={htmlFor} className={FIELD_LABEL}>
          {label}
        </Label>
      </dt>
      <dd className="flex min-h-7 items-center text-sm">{children}</dd>
    </div>
  );
}

/** The deal's earliest open step, read-only: due chip · kind · text · assignee. */
function NextStepLine({ step }: { step: NextStep | null }) {
  if (!step) return <span className="text-muted-foreground">—</span>;
  const { icon: Icon, circle, label } = KIND_META[step.kind];
  return (
    <span className="flex min-w-0 flex-1 items-center gap-2">
      <DueChip date={step.due_on} className="shrink-0 bg-background" />
      <span
        role="img"
        aria-label={label}
        className={cn("flex size-6 shrink-0 items-center justify-center rounded-md", circle)}
      >
        <Icon className="size-3.5" />
      </span>
      <TruncateTooltip text={step.body} className="flex-1" />
      {step.assignee && (
        <Tooltip>
          <TooltipTrigger
            render={<span aria-label={`Assignee: ${step.assignee.name}`} className="inline-flex shrink-0" />}
          >
            <PersonAvatar
              name={step.assignee.name}
              avatarUrl={step.assignee.avatar_url}
              className="size-6 text-[10px]"
            />
          </TooltipTrigger>
          <TooltipContent>{step.assignee.name}</TooltipContent>
        </Tooltip>
      )}
    </span>
  );
}

function Dot({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-2">
      <span aria-hidden className={cn("size-2 shrink-0 rounded-full", className)} />
      {children}
    </span>
  );
}

function OwnerOption({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <PersonAvatar name={name} avatarUrl={avatarUrl} className="size-5 text-[8px]" />
      <span className="truncate">{name}</span>
    </span>
  );
}

/** Click to rename (managers); Enter or blur saves, Escape cancels. */
function DealTitle({ title, canEdit, onSave }: { title: string; canEdit: boolean; onSave: (t: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);

  function commit() {
    setEditing(false);
    const next = draft.trim();
    if (next && next !== title) onSave(next);
    else setDraft(title);
  }

  if (editing) {
    return (
      <Input
        aria-label="Deal title"
        autoFocus
        value={draft}
        maxLength={200}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            // Keep Escape from also closing the sheet.
            e.preventDefault();
            e.stopPropagation();
            setDraft(title);
            setEditing(false);
          }
        }}
        className="-mx-2 h-9 px-2 font-heading text-lg font-semibold"
      />
    );
  }

  return (
    <SheetTitle className="text-lg leading-snug font-semibold">
      {canEdit ? (
        <button
          type="button"
          onClick={() => {
            setDraft(title);
            setEditing(true);
          }}
          title="Rename"
          className="-mx-2 rounded-md px-2 py-0.5 text-left transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          {title}
        </button>
      ) : (
        title
      )}
    </SheetTitle>
  );
}

function WonBanner({
  projectId,
  canCreate,
  onCreate,
}: {
  projectId: string | null;
  canCreate: boolean;
  onCreate: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/8 p-3.5 dark:bg-emerald-500/12">
      <span
        aria-hidden
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
      >
        <PartyPopper className="size-4" />
      </span>
      <p className="min-w-0 flex-1 text-sm font-medium text-emerald-900 dark:text-emerald-200">
        {projectId ? "Deal won" : canCreate ? "Deal won — create the project" : "Deal won"}
      </p>
      {projectId ? (
        <Link
          href={`/projects/${projectId}`}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "bg-background")}
        >
          Open project
          <ArrowUpRight data-icon="inline-end" />
        </Link>
      ) : (
        canCreate && (
          <Button size="sm" className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={onCreate}>
            Create project
          </Button>
        )
      )}
    </div>
  );
}

function OffersTable({
  offers,
  latestId,
  canManage,
  onEdit,
  onDelete,
}: {
  offers: OfferView[];
  latestId: string | null;
  canManage: boolean;
  onEdit: (o: OfferView) => void;
  onDelete: (o: OfferView) => void;
}) {
  // Same calendar day for server and browser (app time zone), so "expired" never flickers.
  const [today] = useState(() => appDayKey(Date.now()));

  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
            <th className="py-2 pr-2 pl-3 font-normal">Offer</th>
            <th className="px-2 py-2 text-right font-normal">Amount</th>
            <th className="px-2 py-2 font-normal">Status</th>
            <th className="px-2 py-2 font-normal">Sent</th>
            <th className="px-2 py-2 font-normal">Valid until</th>
            <th className="w-0 py-2 pr-1.5">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {offers.map((o) => {
            const expired = o.status === "sent" && o.valid_until !== null && o.valid_until < today;
            const isLatest = o.id === latestId;
            return (
              <tr key={o.id} className="group border-b last:border-b-0 hover:bg-muted/30">
                <td className="max-w-36 py-2.5 pr-2 pl-3">
                  <div className="flex items-center gap-1.5">
                    <span className={cn("truncate font-medium", !isLatest && "text-foreground/75")}>{o.title}</span>
                    {o.link_url && (
                      <a
                        href={o.link_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Open offer ${o.title}`}
                        className="shrink-0 rounded text-muted-foreground transition-colors hover:text-foreground"
                      >
                        <ExternalLink className="size-3.5" />
                      </a>
                    )}
                  </div>
                  {o.note && <p className="mt-0.5 truncate text-xs text-muted-foreground" title={o.note}>{o.note}</p>}
                </td>
                <td
                  className={cn(
                    "px-2 py-2.5 text-right whitespace-nowrap tabular-nums",
                    isLatest ? "font-semibold" : "text-foreground/75"
                  )}
                >
                  {formatEur(o.amount)}
                </td>
                <td className="px-2 py-2.5">
                  <DotBadge dotClassName={OFFER_STATUS_DOT[o.status]}>{OFFER_STATUS_LABEL[o.status]}</DotBadge>
                </td>
                <td className="px-2 py-2.5 whitespace-nowrap text-muted-foreground tabular-nums">
                  {o.sent_on ? formatDateEt(o.sent_on) : "—"}
                </td>
                <td
                  className={cn(
                    "px-2 py-2.5 whitespace-nowrap tabular-nums",
                    expired ? "font-medium text-red-600 dark:text-red-400" : "text-muted-foreground"
                  )}
                  title={expired ? "Expired" : undefined}
                >
                  {o.valid_until ? formatDateEt(o.valid_until) : "—"}
                </td>
                <td className="py-2.5 pr-1.5">
                  {canManage && (
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        aria-label={`Offer ${o.title} actions`}
                        className="rounded p-1 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2"
                      >
                        <MoreHorizontal className="size-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onEdit(o)}>Edit</DropdownMenuItem>
                        <DropdownMenuItem variant="destructive" onClick={() => onDelete(o)}>
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
