"use client";

import { usePathname, useRouter } from "next/navigation";
import { DotBadge } from "@/components/dot-badge";
import { PersonAvatar } from "@/components/person-avatar";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { latestOffer } from "@/lib/sales/pipeline";
import { OPEN_STAGES } from "@/lib/sales/types";
import { compareByFollowUp } from "@/lib/sales/urgency";
import { cn } from "@/lib/utils";
import { FollowUpChip } from "../../follow-up-chip";
import { formatEur } from "../../money";
import { NewLeadDialog } from "../../new-lead-dialog";
import { STAGE_DOT, STAGE_LABEL } from "../../stage";
import type { CompanyOption, CompanyView, DealView, SalesOwnerOption } from "../../types";

/** Clicks on these are their own thing, never "open the deal". */
const OWN_CONTROL = "a, button, [role='menuitem'], [data-slot='tooltip-trigger']";

export function DealsCard({
  deals,
  company,
  activeDealId,
  canManage,
  owners,
  companies,
  currentUserId,
}: {
  deals: DealView[];
  company: CompanyView;
  activeDealId: string | null;
  canManage: boolean;
  owners: SalesOwnerOption[];
  companies: CompanyOption[];
  currentUserId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const open = deals.filter((d) => OPEN_STAGES.includes(d.stage)).sort(compareByFollowUp);
  const closed = deals.filter((d) => !OPEN_STAGES.includes(d.stage));

  // The deal panel (DealSheet) is driven by ?deal= -- opening a deal only sets the param.
  function openDeal(id: string) {
    router.replace(`${pathname}?deal=${id}`, { scroll: false });
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Deals
          <span className="text-xs font-normal text-muted-foreground tabular-nums">{deals.length}</span>
        </CardTitle>
        {canManage && (
          <CardAction>
            <NewLeadDialog
              noun="deal"
              trigger={<Button size="xs" variant="ghost" className="text-muted-foreground" />}
              companies={companies}
              owners={owners}
              currentUserId={currentUserId}
              defaultClientId={company.id}
            />
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {deals.length === 0 ? (
          <p className="rounded-lg border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
            No deals yet.
          </p>
        ) : (
          <div className="-mx-2">
            <ul className="space-y-0.5">
              {open.map((d) => (
                <DealRow key={d.id} deal={d} active={d.id === activeDealId} onOpen={openDeal} />
              ))}
            </ul>
            {closed.length > 0 && (
              <>
                <div className="mx-2 mt-3 mb-1 flex items-center gap-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                  Closed
                  <span aria-hidden className="h-px flex-1 bg-border" />
                </div>
                <ul className="space-y-0.5">
                  {closed.map((d) => (
                    <DealRow key={d.id} deal={d} active={d.id === activeDealId} onOpen={openDeal} muted />
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DealRow({
  deal,
  active,
  muted,
  onOpen,
}: {
  deal: DealView;
  active: boolean;
  muted?: boolean;
  onOpen: (id: string) => void;
}) {
  const amount = latestOffer(deal.offers)?.amount ?? null;
  return (
    <li
      className={cn(
        "group cursor-pointer rounded-lg px-2 py-2 transition-colors hover:bg-muted/60",
        active && "bg-muted ring-1 ring-foreground/10 hover:bg-muted"
      )}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest(OWN_CONTROL)) return;
        onOpen(deal.id);
      }}
    >
      <div className="flex items-baseline justify-between gap-3">
        {/* The real control (keyboard + screen readers); the row click is a mouse convenience. */}
        <button
          type="button"
          onClick={() => onOpen(deal.id)}
          aria-current={active || undefined}
          className={cn(
            "min-w-0 truncate rounded-sm text-left text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
            muted && "text-muted-foreground"
          )}
        >
          {deal.title}
        </button>
        <span className={cn("shrink-0 text-sm font-medium tabular-nums", amount === null && "text-muted-foreground")}>
          {formatEur(amount)}
        </span>
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <DotBadge dotClassName={STAGE_DOT[deal.stage]}>{STAGE_LABEL[deal.stage]}</DotBadge>
          {!muted && <FollowUpChip date={deal.next_follow_up_on} />}
        </div>
        <Tooltip>
          <TooltipTrigger render={<span aria-label={`Owner: ${deal.owner.name}`} className="shrink-0" />}>
            <PersonAvatar name={deal.owner.name} avatarUrl={deal.owner.avatar_url} className="size-6 text-[9px]" />
          </TooltipTrigger>
          <TooltipContent>{deal.owner.name}</TooltipContent>
        </Tooltip>
      </div>
    </li>
  );
}
