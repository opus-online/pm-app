import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRightIcon, ExternalLinkIcon } from "lucide-react";
import { DotBadge } from "@/components/dot-badge";
import { Button } from "@/components/ui/button";
import { avatarTint } from "@/lib/avatar-tint";
import { NEUTRAL_ACTION_CLASS } from "@/lib/action-styles";
import { initials } from "../../../projects/types";
import type { CompanyView } from "../../types";
import { CompanyFormDialog } from "./company-form-dialog";

const KIND_BADGE = {
  prospect: { label: "Prospect", dot: "bg-amber-500", className: "bg-amber-500/10 text-amber-800 dark:text-amber-300" },
  client: { label: "Client", dot: "bg-emerald-500", className: "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300" },
} as const;

const LINK = "transition-colors hover:text-foreground hover:underline underline-offset-3";

/** "https://www.example.ee/" -> "example.ee" for display; the href keeps the full URL. */
function displayHost(url: string) {
  return url.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/$/, "");
}

export function CompanyHeader({ company, canManage }: { company: CompanyView; canManage: boolean }) {
  const badge = KIND_BADGE[company.kind];
  // Only what's known -- an all-dash line for a fresh prospect reads as broken, not as aligned.
  const meta: ReactNode[] = [];
  if (company.reg_code) meta.push(<span className="tabular-nums">{company.reg_code}</span>);
  if (company.phone)
    meta.push(
      <a href={`tel:${company.phone}`} className={`tabular-nums ${LINK}`}>
        {company.phone}
      </a>
    );
  if (company.email)
    meta.push(
      <a href={`mailto:${company.email}`} className={LINK}>
        {company.email}
      </a>
    );
  if (company.website)
    meta.push(
      <a
        href={company.website}
        target="_blank"
        rel="noopener noreferrer"
        className={`inline-flex items-center gap-1 ${LINK}`}
      >
        {displayHost(company.website)}
        <ExternalLinkIcon className="size-3" />
      </a>
    );

  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 items-start gap-3">
        <span
          aria-hidden
          className={`flex size-12 shrink-0 items-center justify-center rounded-lg text-base font-medium ${avatarTint(company.name)}`}
        >
          {initials(company.name)}
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <h1 className="text-2xl font-semibold">{company.name}</h1>
            <DotBadge dotClassName={badge.dot} className={badge.className}>
              {badge.label}
            </DotBadge>
          </div>
          {meta.length > 0 && (
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
              {meta.map((part, i) => (
                <span key={i} className="flex items-center gap-x-2">
                  {i > 0 && (
                    <span aria-hidden className="text-border">
                      ·
                    </span>
                  )}
                  {part}
                </span>
              ))}
            </div>
          )}
          {company.notes && (
            <p className="mt-2 line-clamp-3 max-w-3xl text-sm whitespace-pre-line text-muted-foreground/80">
              {company.notes}
            </p>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {company.kind === "client" && (
          <Button
            size="sm"
            variant="ghost"
            className={NEUTRAL_ACTION_CLASS}
            render={<Link href={`/clients/${company.id}`} />}
          >
            Client page
            <ArrowUpRightIcon />
          </Button>
        )}
        {canManage && <CompanyFormDialog company={company} />}
      </div>
    </div>
  );
}
