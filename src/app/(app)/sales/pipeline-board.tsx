"use client";

import { useId, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext, DragOverlay, KeyboardCode, KeyboardSensor, PointerSensor,
  pointerWithin, rectIntersection, useDraggable, useDroppable, useSensor, useSensors,
  type Announcements, type CollisionDetection, type DragEndEvent, type DragStartEvent,
  type KeyboardCoordinateGetter, type UniqueIdentifier,
} from "@dnd-kit/core";
import { toast } from "sonner";
import { updateDealAction } from "@/app/actions/sales";
import { DotBadge } from "@/components/dot-badge";
import { PersonAvatar } from "@/components/person-avatar";
import { stageTotals } from "@/lib/sales/pipeline";
import { DEAL_STAGES, OPEN_STAGES, type DealStage } from "@/lib/sales/types";
import { cn } from "@/lib/utils";
import { FollowUpChip } from "./follow-up-chip";
import { LostReasonDialog } from "./lost-reason-dialog";
import { formatEur } from "./money";
import { STAGE_DOT, STAGE_LABEL } from "./stage";
import type { PipelineRow } from "./types";

const COLUMNS: DealStage[] = [...OPEN_STAGES, "won", "lost"];
const WON_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const LOST_LIMIT = 10;

const isStage = (id: UniqueIdentifier | undefined): id is DealStage =>
  typeof id === "string" && (DEAL_STAGES as readonly string[]).includes(id);

/** Applies a stage move locally the way the DB trigger will: won_at stamped on entering Won,
 * cleared on leaving it. Deals entering a closed column jump to its front (most recent). */
function moveDeal(items: PipelineRow[], id: string, stage: DealStage): PipelineRow[] {
  const deal = items.find((d) => d.id === id);
  if (!deal) return items;
  const moved: PipelineRow = {
    ...deal,
    stage,
    won_at: stage === "won" ? (deal.stage === "won" ? deal.won_at : new Date().toISOString()) : null,
  };
  if (stage === "won" || stage === "lost") return [moved, ...items.filter((d) => d.id !== id)];
  return items.map((d) => (d.id === id ? moved : d));
}

// Pointer drags resolve by what's under the cursor; keyboard drags have no pointer, so fall back
// to overlap with the dragged card's rect.
const collisionDetection: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  return hits.length > 0 ? hits : rectIntersection(args);
};

// Arrow keys jump a whole column at a time (the default 25px nudge would take ~10 presses per
// column). The card is centred on the target column, keeping its current height.
const columnCoordinates: KeyboardCoordinateGetter = (event, { context, currentCoordinates }) => {
  const step = event.code === KeyboardCode.Right ? 1 : event.code === KeyboardCode.Left ? -1 : 0;
  if (step === 0) {
    if (event.code === KeyboardCode.Up || event.code === KeyboardCode.Down) event.preventDefault();
    return undefined;
  }
  event.preventDefault();
  const { collisionRect, droppableRects, over } = context;
  if (!collisionRect) return undefined;
  let current: DealStage | undefined = isStage(over?.id) ? over.id : undefined;
  if (!current) {
    const cx = collisionRect.left + collisionRect.width / 2;
    current = COLUMNS.find((s) => {
      const r = droppableRects.get(s);
      return r !== undefined && cx >= r.left && cx <= r.left + r.width;
    });
  }
  if (!current) return undefined;
  const target = COLUMNS[COLUMNS.indexOf(current) + step];
  const rect = target ? droppableRects.get(target) : undefined;
  if (!rect) return undefined;
  return { x: rect.left + (rect.width - collisionRect.width) / 2, y: currentCoordinates.y };
};

function subscribeReducedMotion(cb: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false
  );
}

export function PipelineBoard({ rows, canManage }: { rows: PipelineRow[]; canManage: boolean }) {
  const router = useRouter();
  const dndId = useId();
  const reducedMotion = usePrefersReducedMotion();
  const [, startTransition] = useTransition();

  // Local optimistic copy of the pipeline. Re-synced whenever the server data changes (after
  // revalidation) -- keyed on every field the board shows that can change server-side, so an
  // unchanged refetch doesn't clobber in-flight moves.
  // Done during render (React's "adjust state on prop change" pattern) rather than in an effect.
  const rowsKey = rows
    .map((r) =>
      [r.id, r.stage, r.latest_offer_amount, r.owner.id, r.next_follow_up_on, r.won_at].join(":")
    )
    .join("|");
  const [syncedKey, setSyncedKey] = useState(rowsKey);
  const [items, setItems] = useState(rows);
  if (syncedKey !== rowsKey) {
    setSyncedKey(rowsKey);
    setItems(rows);
  }

  const [activeId, setActiveId] = useState<string | null>(null);
  const [pendingLost, setPendingLost] = useState<{ id: string; from: DealStage } | null>(null);
  const suppressClick = useRef(false);
  // Snapshot of "now" for the Won window -- taken once per mount so render stays pure.
  const [now] = useState(() => Date.now());

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: columnCoordinates,
      // Enter opens the deal; Space picks up / drops.
      keyboardCodes: {
        start: [KeyboardCode.Space],
        cancel: [KeyboardCode.Esc],
        end: [KeyboardCode.Space, KeyboardCode.Enter],
      },
    })
  );

  const columns = useMemo(() => {
    const byStage = Object.fromEntries(COLUMNS.map((s) => [s, [] as PipelineRow[]])) as Record<
      DealStage,
      PipelineRow[]
    >;
    for (const d of items) {
      if (d.stage === "won") {
        if (d.won_at && now - Date.parse(d.won_at) <= WON_WINDOW_MS) byStage.won.push(d);
      } else {
        byStage[d.stage].push(d);
      }
    }
    // Rows carry no "lost on" timestamp; the loader's follow-up order is the stable recency proxy,
    // with deals lost in this session moved to the front by moveDeal().
    byStage.lost = byStage.lost.slice(0, LOST_LIMIT);
    return byStage;
  }, [items, now]);

  const activeDeal = activeId ? items.find((d) => d.id === activeId) ?? null : null;

  function persist(id: string, from: DealStage, input: { stage: DealStage; lost_reason?: string | null }) {
    const before = items.find((d) => d.id === id);
    setItems((prev) => moveDeal(prev, id, input.stage));
    startTransition(async () => {
      let r: Awaited<ReturnType<typeof updateDealAction>>;
      try {
        r = await updateDealAction(id, input);
      } catch {
        // Network failure / stale server action after a deploy -- revert instead of escalating
        // to the error boundary.
        r = { error: "Couldn't save. Try again." };
      }
      if ("error" in r) {
        setItems((prev) =>
          before ? prev.map((d) => (d.id === id ? before : d)) : moveDeal(prev, id, from)
        );
        toast.error(r.error);
      }
    });
  }

  function onDragStart({ active }: DragStartEvent) {
    setActiveId(String(active.id));
    suppressClick.current = true;
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null);
    // The browser may still dispatch a click on the card after a pointer drag; swallow it.
    setTimeout(() => (suppressClick.current = false), 0);
    const id = String(active.id);
    const deal = items.find((d) => d.id === id);
    if (!deal || !over || !isStage(over.id) || over.id === deal.stage) return;
    const target = over.id;
    if (target === "lost") {
      setPendingLost({ id, from: deal.stage });
      return;
    }
    // Leaving Lost clears the stale reason so it doesn't resurface if the deal is lost again.
    persist(id, deal.stage, deal.stage === "lost" ? { stage: target, lost_reason: null } : { stage: target });
  }

  function onDragCancel() {
    setActiveId(null);
    setTimeout(() => (suppressClick.current = false), 0);
  }

  function openDeal(deal: PipelineRow) {
    if (suppressClick.current) return;
    router.push(`/sales/companies/${deal.client.id}?deal=${deal.id}`);
  }

  const nameOf = (id: UniqueIdentifier) => items.find((d) => d.id === id)?.client.name ?? "Deal";
  const stageName = (id: UniqueIdentifier | undefined) => (isStage(id) ? STAGE_LABEL[id] : null);
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${nameOf(active.id)}.`,
    onDragOver: ({ active, over }) =>
      stageName(over?.id) ? `${nameOf(active.id)} is over ${stageName(over?.id)}.` : `${nameOf(active.id)} is not over a stage.`,
    onDragEnd: ({ active, over }) =>
      stageName(over?.id) ? `${nameOf(active.id)} dropped on ${stageName(over?.id)}.` : `${nameOf(active.id)} dropped.`,
    onDragCancel: ({ active }) => `Move cancelled. ${nameOf(active.id)} was not moved.`,
  };

  return (
    <>
      <DndContext
        id={dndId}
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
        accessibility={{
          announcements,
          screenReaderInstructions: {
            draggable:
              "Press Enter to open the deal. To move it, press Space, use the left and right arrow keys to choose a stage, then press Space again to drop or Escape to cancel.",
          },
        }}
      >
        {/* contain:inline-size keeps the board's min-content width from stretching the page --
            the columns scroll inside this strip instead. */}
        <div className="-mx-1 -mt-1 flex gap-3 overflow-x-auto px-1 pt-1 pb-3 [contain:inline-size]">
          {COLUMNS.map((stage) => (
            <BoardColumn
              key={stage}
              stage={stage}
              deals={columns[stage]}
              canManage={canManage}
              activeId={activeId}
              onOpen={openDeal}
            />
          ))}
        </div>
        <DragOverlay dropAnimation={reducedMotion ? null : undefined}>
          {activeDeal ? <DealCardBody deal={activeDeal} overlay /> : null}
        </DragOverlay>
      </DndContext>

      <LostReasonDialog
        open={pendingLost !== null}
        onOpenChange={(o) => {
          if (!o) setPendingLost(null);
        }}
        onConfirm={async (reason) => {
          if (!pendingLost) return;
          persist(pendingLost.id, pendingLost.from, { stage: "lost", lost_reason: reason });
          setPendingLost(null);
        }}
      />
    </>
  );
}

function BoardColumn({
  stage,
  deals,
  canManage,
  activeId,
  onOpen,
}: {
  stage: DealStage;
  deals: PipelineRow[];
  canManage: boolean;
  activeId: string | null;
  onOpen(deal: PipelineRow): void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage, disabled: !canManage });
  const closed = stage === "won" || stage === "lost";
  const total = stageTotals(deals)[stage];

  return (
    <section
      ref={setNodeRef}
      aria-label={`${STAGE_LABEL[stage]} stage`}
      className={cn(
        "flex shrink-0 flex-col rounded-xl border bg-muted/40 transition-colors motion-reduce:transition-none",
        closed ? "w-56" : "min-w-64 flex-1",
        isOver && "border-primary/30 bg-primary/5 ring-2 ring-primary/15"
      )}
    >
      <header className="flex items-center justify-between gap-2 px-3 pt-3 pb-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <DotBadge dotClassName={STAGE_DOT[stage]} className="bg-background">
            {STAGE_LABEL[stage]}
          </DotBadge>
          <span className="text-xs text-muted-foreground tabular-nums">{total.count}</span>
        </div>
        <span className="truncate text-xs text-muted-foreground tabular-nums">{formatEur(total.value)}</span>
      </header>
      {stage === "won" && (
        <p className="-mt-1 px-3 pb-2 text-[11px] text-muted-foreground/70">Last 30 days</p>
      )}
      <div className="flex min-h-32 flex-1 flex-col gap-2 px-2 pb-2">
        {deals.length === 0 ? (
          <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-foreground/10 p-4 text-center text-xs text-muted-foreground/70">
            —
          </div>
        ) : (
          deals.map((deal) => (
            <DealCard
              key={deal.id}
              deal={deal}
              canManage={canManage}
              dimmed={deal.id === activeId}
              onOpen={onOpen}
            />
          ))
        )}
      </div>
    </section>
  );
}

function DealCard({
  deal,
  canManage,
  dimmed,
  onOpen,
}: {
  deal: PipelineRow;
  canManage: boolean;
  dimmed: boolean;
  onOpen(deal: PipelineRow): void;
}) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: deal.id, disabled: !canManage });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      aria-roledescription={canManage ? "draggable deal" : "deal"}
      aria-label={`${deal.client.name}: ${deal.title}`}
      onClick={() => onOpen(deal)}
      onKeyDown={(e) => {
        listeners?.onKeyDown?.(e);
        if (e.defaultPrevented) return;
        if (e.key === "Enter" || (!canManage && e.key === " ")) {
          e.preventDefault();
          onOpen(deal);
        }
      }}
      className={cn(
        "rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        canManage ? "cursor-grab touch-none active:cursor-grabbing" : "cursor-pointer",
        dimmed && "opacity-40"
      )}
    >
      <DealCardBody deal={deal} />
    </div>
  );
}

function DealCardBody({ deal, overlay = false }: { deal: PipelineRow; overlay?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-3 text-card-foreground shadow-xs transition-shadow motion-reduce:transition-none",
        overlay
          ? "cursor-grabbing shadow-lg ring-1 ring-foreground/10 rotate-[1.5deg] motion-reduce:rotate-0"
          : "hover:border-foreground/15 hover:shadow-sm"
      )}
    >
      <div className="truncate text-sm leading-tight font-semibold">{deal.client.name}</div>
      <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{deal.title}</div>
      <div className="mt-3 flex items-center gap-2">
        <span
          className={cn(
            "text-sm font-medium tabular-nums",
            deal.latest_offer_amount === null && "text-muted-foreground"
          )}
        >
          {formatEur(deal.latest_offer_amount)}
        </span>
        <div className="ml-auto flex items-center gap-1.5 text-xs">
          {/* Follow-ups only matter while the deal is open. */}
          {(deal.stage !== "won" && deal.stage !== "lost") && <FollowUpChip date={deal.next_follow_up_on} />}
          <span title={deal.owner.name} className="inline-flex">
            <PersonAvatar
              name={deal.owner.name}
              avatarUrl={deal.owner.avatar_url}
              className="size-6 text-[10px]"
            />
          </span>
        </div>
      </div>
    </div>
  );
}
