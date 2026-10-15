"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2Icon } from "lucide-react";
import { deleteClientAction } from "@/app/actions/clients";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { NEUTRAL_ACTION_CLASS } from "@/lib/action-styles";

/** Hard-deletes the company with everything Sales holds on it (deals, offers, contacts, steps,
 * entries cascade). deleteClientAction re-checks manage_clients and refuses while projects
 * reference the company -- the error shows inline in the dialog. */
export function DeleteCompanyButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  return (
    <ConfirmDialog
      trigger={<Button size="sm" variant="ghost" className={NEUTRAL_ACTION_CLASS} />}
      triggerLabel={
        <>
          <Trash2Icon />
          Delete
        </>
      }
      title="Delete this company?"
      description={`Delete "${name}" with all its deals, offers, contacts, next steps and history? This can't be undone. Companies with projects can't be deleted.`}
      onConfirm={async () => {
        const result = await deleteClientAction(id);
        if ("success" in result) {
          toast.success("Company deleted");
          router.push("/sales?view=companies");
        }
        return result;
      }}
    />
  );
}
