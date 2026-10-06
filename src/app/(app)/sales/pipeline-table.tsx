"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, XIcon } from "lucide-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DotBadge } from "@/components/dot-badge";
import { PersonAvatar } from "@/components/person-avatar";
import { SortableHead } from "@/components/data-table/sortable-head";
import { useSort, type SortAccessors } from "@/components/data-table/use-sort";
import { avatarTint } from "@/lib/avatar-tint";
import { normalizeRegCode } from "@/lib/sales/reg-code";
import { DEAL_STAGES, OPEN_STAGES } from "@/lib/sales/types";
import { initials } from "../projects/types";
import { FollowUpChip } from "./follow-up-chip";
import { formatEur } from "./money";
import {
  ALL, EMPTY_FILTERS, PipelineFilters, type PipelineFilterState,
} from "./pipeline-filters";
import { SOURCE_LABEL, STAGE_DOT, STAGE_LABEL } from "./stage";
import type { PipelineContact, PipelineRow } from "./types";

const PAGE_SIZE = 10;

type SortKey = "company" | "title" | "stage" | "offer" | "follow_up";

const ACCESSORS: SortAccessors<PipelineRow, SortKey> = {
  company: (r) => r.client.name,
  title: (r) => r.title,
  stage: (r) => DEAL_STAGES.indexOf(r.stage),
  offer: (r) => r.latest_offer_amount,
  follow_up: (r) => r.next_follow_up_on,
};

/** Digits-only view of a phone-ish string (same matching rule as the clients search). */
function digits(value: string): string {
  return value.replace(/\D/g, "");
}

function matchesQuery(row: PipelineRow, query: string): boolean {
  if (row.client.name.toLowerCase().includes(query)) return true;
  if (row.title.toLowerCase().includes(query)) return true;
  const regQuery = normalizeRegCode(query);
  const reg = normalizeRegCode(row.client.reg_code);
  if (regQuery && reg && reg.includes(regQuery)) return true;
  // Phone matching compares digit-to-digit; require at least 3 query digits so a lone "1"
  // in a mixed query doesn't light up every row.
  const queryDigits = digits(query);
  return row.contacts.some(
    (c) =>
      c.name.toLowerCase().includes(query) ||
      (c.email !== null && c.email.toLowerCase().includes(query)) ||
      (c.phone !== null &&
        (c.phone.toLowerCase().includes(query) ||
          (queryDigits.length >= 3 && digits(c.phone).includes(queryDigits))))
  );
}

export function PipelineTable({ rows }: { rows: PipelineRow[]; canManage: boolean }) {
  const router = useRouter();
  const [filters, setFilters] = useState<PipelineFilterState>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);

  // Owner filter offers exactly the people who own a deal in this pipeline.
  const owners = useMemo(() => {
    const byId = new Map<string, PipelineRow["owner"]>();
    for (const r of rows) if (!byId.has(r.owner.id)) byId.set(r.owner.id, r.owner);
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  const filtered = useMemo(() => {
    const query = filters.q.trim().toLowerCase();
    return rows.filter((row) => {
      if (!filters.closed && !OPEN_STAGES.includes(row.stage)) return false;
      if (filters.stage !== ALL && row.stage !== filters.stage) return false;
      if (filters.source !== ALL && row.source !== filters.source) return false;
      if (filters.owner !== ALL && row.owner.id !== filters.owner) return false;
      if (query && !matchesQuery(row, query)) return false;
      return true;
    });
  }, [rows, filters]);
  const { rows: sorted, sort, toggle } = useSort(filtered, ACCESSORS, { key: "follow_up", dir: "asc" });

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function changeFilters(next: PipelineFilterState) {
    setFilters(next);
    setPage(1);
  }

  return (
    <div className="space-y-4">
      <PipelineFilters value={filters} onChange={changeFilters} owners={owners} />
      {sorted.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          <p>No deals match these filters.</p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => changeFilters(EMPTY_FILTERS)}
            className="rounded-full bg-red-500/8 text-red-700 hover:bg-red-500/15 hover:text-red-800 dark:bg-red-500/15 dark:text-red-400 dark:hover:bg-red-500/25"
          >
            <XIcon /> Clear filters
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <Table className="[&_tbody_td]:py-4">
            <TableHeader>
              <TableRow>
                <SortableHead label="Company" sortKey="company" sort={sort} onToggle={toggle} className="w-[24%]" />
                <SortableHead label="Deal" sortKey="title" sort={sort} onToggle={toggle} />
                <TableHead>Contacts</TableHead>
                <SortableHead label="Stage" sortKey="stage" sort={sort} onToggle={toggle} />
                <SortableHead label="Offer" sortKey="offer" sort={sort} onToggle={toggle} className="text-right [&>button]:-mr-1 [&>button]:ml-0" />
                <TableHead className="text-center">Owner</TableHead>
                <SortableHead label="Follow-up" sortKey="follow_up" sort={sort} onToggle={toggle} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.map((row) => (
                <TableRow
                  key={row.id}
                  className="group cursor-pointer"
                  onClick={(e) => {
                    // Whole row opens the deal on its company page -- but never when the click
                    // landed on a real control inside the row.
                    if ((e.target as HTMLElement).closest("a, button, [role='menuitem'], [data-slot='tooltip-trigger']")) return;
                    router.push(`/sales/companies/${row.client.id}?deal=${row.id}`);
                  }}
                >
                  <TableCell>
                    <CompanyCell row={row} />
                  </TableCell>
                  <TableCell className="max-w-64 whitespace-normal">
                    <div className="leading-tight font-medium">{row.title}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">{SOURCE_LABEL[row.source]}</div>
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    <ContactsCell contacts={row.contacts} />
                  </TableCell>
                  <TableCell>
                    <DotBadge dotClassName={STAGE_DOT[row.stage]}>{STAGE_LABEL[row.stage]}</DotBadge>
                  </TableCell>
                  <TableCell
                    className={`text-right font-medium tabular-nums ${row.latest_offer_amount === null ? "text-muted-foreground" : ""}`}
                  >
                    {formatEur(row.latest_offer_amount)}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-center">
                      <Tooltip>
                        <TooltipTrigger render={<span aria-label={`Owner: ${row.owner.name}`} />}>
                          <PersonAvatar
                            name={row.owner.name}
                            avatarUrl={row.owner.avatar_url}
                            className="size-7 text-[10px]"
                          />
                        </TooltipTrigger>
                        <TooltipContent>{row.owner.name}</TooltipContent>
                      </Tooltip>
                    </div>
                  </TableCell>
                  <TableCell>
                    <FollowUpChip date={row.next_follow_up_on} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-sm text-muted-foreground">
            <span>
              Showing {sorted.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1} to{" "}
              {Math.min(currentPage * PAGE_SIZE, sorted.length)} of {sorted.length} deal
              {sorted.length === 1 ? "" : "s"}
            </span>
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage === 1}
                  onClick={() => setPage(currentPage - 1)}
                  aria-label="Previous page"
                >
                  <ChevronLeft />
                </Button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <Button
                    key={p}
                    variant={p === currentPage ? "default" : "outline"}
                    size="sm"
                    onClick={() => setPage(p)}
                  >
                    {p}
                  </Button>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage === totalPages}
                  onClick={() => setPage(currentPage + 1)}
                  aria-label="Next page"
                >
                  <ChevronRight />
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CompanyCell({ row }: { row: PipelineRow }) {
  const { client } = row;
  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden
        className={`flex size-10 shrink-0 items-center justify-center rounded-lg text-sm font-medium ${avatarTint(client.name)}`}
      >
        {initials(client.name)}
      </span>
      <div className="min-w-0">
        <Link
          href={`/sales/companies/${client.id}`}
          className="text-base leading-tight font-semibold transition-opacity hover:opacity-70"
        >
          {client.name}
        </Link>
        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
          <span>{client.reg_code ?? "—"}</span>
          {client.kind === "prospect" && (
            <span className="rounded-sm bg-muted px-1.5 py-px text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
              Prospect
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// Same mini-row language as the clients list's ContactsCell: tinted initials chip + name, phone ·
// email secondary underneath; first 2 shown, the rest behind a "+N more" tooltip.
function ContactsCell({ contacts }: { contacts: PipelineContact[] }) {
  if (contacts.length === 0) return <span className="text-sm text-muted-foreground">—</span>;
  const shown = contacts.slice(0, 2);
  const hidden = contacts.slice(2);
  return (
    <div>
      <div className="flex flex-col gap-y-1.5">
        {shown.map((c) => (
          <div key={c.id} className="flex items-start gap-2">
            <span
              aria-hidden
              className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md text-[9px] font-medium ${avatarTint(c.name)}`}
            >
              {initials(c.name)}
            </span>
            <div className="min-w-0 leading-tight">
              <div className="text-sm font-medium">{c.name}</div>
              {(c.phone || c.email) && (
                <div className="text-xs text-muted-foreground/70">
                  {[c.phone, c.email].filter(Boolean).join(" · ")}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      {hidden.length > 0 && (
        <Tooltip>
          <TooltipTrigger render={<span className="mt-1 inline-block text-xs text-muted-foreground" />}>
            +{hidden.length} more
          </TooltipTrigger>
          <TooltipContent>
            <div className="flex flex-col gap-0.5">
              {hidden.map((c) => (
                <span key={c.id}>{c.name}</span>
              ))}
            </div>
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
