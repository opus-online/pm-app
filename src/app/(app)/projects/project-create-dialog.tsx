"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ProjectCreateForm } from "./new/project-create-form";
import type {
  ClientContactOption,
  ClientOption,
  PmOption,
} from "./new/project-create-fields";

export function ProjectCreateDialog({
  clients,
  contacts,
  pms,
  currentUserId,
  open: controlledOpen,
  onOpenChange,
  defaultClientId,
  onCreated,
  hideTrigger,
}: {
  clients: ClientOption[];
  contacts: ClientContactOption[];
  pms: PmOption[];
  currentUserId: string;
  /** Controlled mode: pass open/onOpenChange (and usually hideTrigger) to launch it elsewhere. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  defaultClientId?: string | null;
  /** Called with the new project's id instead of navigating to it. */
  onCreated?: (projectId: string) => void;
  hideTrigger?: boolean;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = (next: boolean) => {
    if (controlledOpen === undefined) setUncontrolledOpen(next);
    onOpenChange?.(next);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!hideTrigger && (
        <DialogTrigger render={<Button size="sm" />}>
          <Plus />
          New project
        </DialogTrigger>
      )}
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
        </DialogHeader>
        <ProjectCreateForm
          clients={clients}
          contacts={contacts}
          pms={pms}
          currentUserId={currentUserId}
          defaultClientId={defaultClientId}
          onCreated={onCreated}
        />
      </DialogContent>
    </Dialog>
  );
}
