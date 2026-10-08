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
import { SortableHead } from "@/components/data-table/sortable-head";
import { useSort, type SortAccessors } from "@/components/data-table/use-sort";
import { avatarTint } from "@/lib/avatar-tint";
import { normalizeRegCode } from "@/lib/sales/reg-code";
import { DEAL_STAGES } from "@/lib/sales/types";
import { initials } from "../projects/types";
import { formatAmount } from "./money";
import { NextStepCell } from "./next-step-cell";
import {
  ALL, EMPTY_FILTERS, PipelineFilters, type PipelineFilterState,
} from "./pipeline-filters";
import { STAGE_DOT, STAGE_LABEL } from "./stage";
import { TruncateTooltip } from "./truncate-tooltip";
import type { CompanyRow, PipelineContact } from "./types";

const PAGE_SIZE = 10;

type SortKey = "company" | "deals" | "offer" | "next_step";

const ACCESSORS: SortAccessors<CompanyRow, SortKey> = {
  company: (r) => r.name,
  deals: (r) => r.open_deals.length,
  offer: (r) => r.open_value || null,
  next_step: (r) => r.next_step?.due_on ?? null,
};

/** Digits-only view of a phone-ish string (same matching rule as the clients search). */
function digits(value: string): string {
  return value.replace(/\D/g, "");
}

function matchesQuery(row: CompanyRow, query: string): boolean {
  if (row.name.toLowerCase().includes(query)) return true;
  const regQuery = normalizeRegCode(query);
  const reg = normalizeRegCode(row.reg_code);
  if (regQuery && reg && reg.includes(regQuery)) return true;
  if (row.next_step && row.next_step.body.toLowerCase().includes(query)) return true;
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

export function CompaniesTable({ rows }: { rows: CompanyRow[] }) {
  const router = useRouter();
  const [filters, setFilters] = useState<PipelineFilterState>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const query = filters.q.trim().toLowerCase();
    return rows.filter((row) => {
      if (filters.stage !== ALL && !row.open_deals.some((d) => d.stage === filters.stage)) return false;
      if (filters.step === "with" && !row.next_step) return false;
      if (filters.step === "without" && row.next_step) return false;
      if (query && !matchesQuery(row, query)) return false;
      return true;
    });
  }, [rows, filters]);
  const { rows: sorted, sort, toggle } = useSort(filtered, ACCESSORS, { key: "next_step", dir: "asc" });

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function changeFilters(next: PipelineFilterState) {
    setFilters(next);
    setPage(1);
  }

  return (
    <div className="space-y-4">
      <PipelineFilters value={filters} onChange={changeFilters} />
      {sorted.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          <p>No companies match these filters.</p>
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
          {/* Fixed layout with set column shares so long names / steps truncate instead of widening
              the page; below min-w-3xl the table scrolls inside its container. */}
          <Table className="min-w-3xl table-fixed [&_tbody_td]:py-4">
            <TableHeader>
              <TableRow>
                <SortableHead label="Company" sortKey="company" sort={sort} onToggle={toggle} className="w-[25%]" />
                <TableHead className="w-[22%]">Contacts</TableHead>
                <SortableHead label="Deals" sortKey="deals" sort={sort} onToggle={toggle} className="w-[8%]" />
                <SortableHead label="Offer (€)" sortKey="offer" sort={sort} onToggle={toggle} className="w-[10%] text-right [&>button]:-mr-1 [&>button]:ml-0" />
                <SortableHead label="Next step" sortKey="next_step" sort={sort} onToggle={toggle} className="w-[35%]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.map((row) => (
                <TableRow
                  key={row.id}
                  className="group cursor-pointer"
                  onClick={(e) => {
                    // Whole row opens the company -- but never when the click landed on a real
                    // control inside the row.
                    if ((e.target as HTMLElement).closest("a, button, [role='menuitem'], [data-slot='tooltip-trigger']")) return;
                    router.push(`/sales/companies/${row.id}`);
                  }}
                >
                  <TableCell>
                    <CompanyCell row={row} />
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    <ContactsCell contacts={row.contacts} />
                  </TableCell>
                  <TableCell>
                    <DealsCell deals={row.open_deals} />
                  </TableCell>
                  <TableCell
                    className={`text-right font-medium tabular-nums ${row.open_value ? "" : "text-muted-foreground"}`}
                  >
                    {formatAmount(row.open_value || null)}
                  </TableCell>
                  <TableCell>
                    <NextStepCell step={row.next_step} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-sm text-muted-foreground">
            <span>
              Showing {(currentPage - 1) * PAGE_SIZE + 1} to{" "}
              {Math.min(currentPage * PAGE_SIZE, sorted.length)} of {sorted.length} compan
              {sorted.length === 1 ? "y" : "ies"}
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

const MICRO_LABEL =
  "rounded-sm bg-muted px-1.5 py-px text-[10px] font-medium tracking-wide text-muted-foreground uppercase";

function CompanyCell({ row }: { row: CompanyRow }) {
  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden
        className={`flex size-10 shrink-0 items-center justify-center rounded-lg text-sm font-medium ${avatarTint(row.name)}`}
      >
        {initials(row.name)}
      </span>
      <div className="min-w-0">
        <Link
          href={`/sales/companies/${row.id}`}
          className="block text-base leading-tight font-semibold transition-opacity hover:opacity-70"
        >
          <TruncateTooltip text={row.name} />
        </Link>
        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
          <span>{row.reg_code ?? "—"}</span>
          {row.kind === "prospect" ? (
            <Tooltip>
              <TooltipTrigger render={<span className={MICRO_LABEL} />}>Prospect</TooltipTrigger>
              <TooltipContent>No project or won deal yet</TooltipContent>
            </Tooltip>
          ) : (
            <span className={MICRO_LABEL}>Client</span>
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
    <div className="min-w-0">
      <div className="flex flex-col gap-y-1.5">
        {shown.map((c) => {
          const secondary = [c.phone, c.email].filter(Boolean).join(" · ");
          return (
            <div key={c.id} className="flex items-start gap-2">
              <span
                aria-hidden
                className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md text-[9px] font-medium ${avatarTint(c.name)}`}
              >
                {initials(c.name)}
              </span>
              <div className="min-w-0 flex-1 leading-tight">
                <TruncateTooltip text={c.name} className="text-sm font-medium" />
                {secondary && <TruncateTooltip text={secondary} className="text-xs text-muted-foreground/70" />}
              </div>
            </div>
          );
        })}
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

/** Open-deal count plus one stage-colored dot per deal, earliest stage first. */
function DealsCell({ deals }: { deals: CompanyRow["open_deals"] }) {
  if (deals.length === 0) return <span className="text-sm text-muted-foreground">—</span>;
  const ordered = [...deals].sort((a, b) => DEAL_STAGES.indexOf(a.stage) - DEAL_STAGES.indexOf(b.stage));
  const label = ordered.map((d) => STAGE_LABEL[d.stage]).join(" · ");
  return (
    <Tooltip>
      <TooltipTrigger
        render={<span aria-label={`${deals.length} open: ${label}`} className="inline-flex items-center gap-2" />}
      >
        <span className="text-sm font-medium tabular-nums">{deals.length}</span>
        <span aria-hidden className="flex items-center gap-1">
          {ordered.map((d) => (
            <span key={d.id} className={`size-1.5 rounded-full ${STAGE_DOT[d.stage]}`} />
          ))}
        </span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
