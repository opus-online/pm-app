"use client";

import { useState } from "react";
import { InfoIcon, MailIcon, MoreHorizontal, PhoneIcon, PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { deleteContactAction } from "@/app/actions/sales";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { avatarTint } from "@/lib/avatar-tint";
import { initials } from "../../../projects/types";
import type { ContactView } from "../../types";
import { ContactFormDialog } from "./contact-form-dialog";

const ICON_LINK =
  "inline-flex min-w-0 items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground";

export function ContactsCard({
  companyId,
  contacts,
  canManage,
}: {
  companyId: string;
  contacts: ContactView[];
  canManage: boolean;
}) {
  // One dialog of each kind for the whole card, launched from "+ Add" or a row menu.
  const [editing, setEditing] = useState<ContactView | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [deleting, setDeleting] = useState<ContactView | null>(null);

  function openForm(contact: ContactView | null) {
    setEditing(contact);
    setFormOpen(true);
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Contacts
          <span className="text-xs font-normal text-muted-foreground tabular-nums">{contacts.length}</span>
        </CardTitle>
        {canManage && (
          <CardAction>
            <Button size="xs" variant="ghost" onClick={() => openForm(null)} className="text-muted-foreground">
              <PlusIcon />
              Add
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {contacts.length === 0 ? (
          <p className="rounded-lg border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
            No contacts yet.
          </p>
        ) : (
          <ul className="-mx-2 space-y-0.5">
            {contacts.map((c) => (
              <ContactRow
                key={c.id}
                contact={c}
                canManage={canManage}
                onEdit={() => openForm(c)}
                onDelete={() => setDeleting(c)}
              />
            ))}
          </ul>
        )}
      </CardContent>

      {canManage && (
        <>
          <ContactFormDialog
            companyId={companyId}
            contact={editing ?? undefined}
            open={formOpen}
            onOpenChange={setFormOpen}
          />
          <ConfirmDialog
            open={deleting !== null}
            onOpenChange={(o) => !o && setDeleting(null)}
            title="Delete this contact?"
            description={`Delete "${deleting?.name ?? ""}"? Activities logged with them stay, without the name.`}
            onConfirm={async () => {
              if (!deleting) return;
              try {
                const result = await deleteContactAction(deleting.id);
                if ("success" in result) toast.success("Contact deleted");
                return result;
              } catch {
                return { error: "Delete failed. Try again." };
              }
            }}
          />
        </>
      )}
    </Card>
  );
}

function ContactRow({
  contact,
  canManage,
  onEdit,
  onDelete,
}: {
  contact: ContactView;
  canManage: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="group flex items-start gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/50">
      <span
        aria-hidden
        className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg text-xs font-medium ${avatarTint(contact.name)}`}
      >
        {initials(contact.name)}
      </span>
      <div className="min-w-0 flex-1 leading-tight">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-semibold">{contact.name}</span>
          {contact.description && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <span
                    tabIndex={0}
                    aria-label="About this contact"
                    className="shrink-0 rounded-sm text-muted-foreground/70 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
                  />
                }
              >
                <InfoIcon className="size-3.5" />
              </TooltipTrigger>
              <TooltipContent className="max-w-64 whitespace-pre-line">{contact.description}</TooltipContent>
            </Tooltip>
          )}
        </div>
        {contact.role && <div className="mt-0.5 truncate text-xs text-muted-foreground">{contact.role}</div>}
        {(contact.phone || contact.email) && (
          <div className="mt-1.5 flex flex-col gap-1 text-xs">
            {contact.phone && (
              <a href={`tel:${contact.phone}`} className={ICON_LINK}>
                <PhoneIcon className="size-3 shrink-0" />
                <span className="truncate tabular-nums">{contact.phone}</span>
              </a>
            )}
            {contact.email && (
              <a href={`mailto:${contact.email}`} className={ICON_LINK}>
                <MailIcon className="size-3 shrink-0" />
                <span className="truncate">{contact.email}</span>
              </a>
            )}
          </div>
        )}
      </div>
      {canManage && (
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={`Actions for ${contact.name}`}
            className="shrink-0 rounded p-1 text-muted-foreground opacity-0 outline-none group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 aria-expanded:opacity-100"
          >
            <MoreHorizontal className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onEdit}>Edit</DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={onDelete}>
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </li>
  );
}
