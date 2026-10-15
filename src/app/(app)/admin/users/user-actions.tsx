"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { adminSignOutUserAction, setUserStatusAction } from "@/app/actions/admin";
import { adminSendPasswordResetAction } from "@/app/actions/password";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NEUTRAL_ACTION_CLASS } from "@/lib/action-styles";

export function UserActions({
  userId,
  status,
}: {
  userId: string;
  status: "active" | "disabled";
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSignOut() {
    setError(null);
    startTransition(async () => {
      const result = await adminSignOutUserAction(userId);
      if ("error" in result) setError(result.error);
    });
  }

  function onSendReset() {
    setError(null);
    startTransition(async () => {
      const result = await adminSendPasswordResetAction(userId);
      if ("error" in result) setError(result.error);
      else toast.success("Password reset email sent");
    });
  }

  function onToggleStatus() {
    setError(null);
    startTransition(async () => {
      const result = await setUserStatusAction({
        userId,
        status: status === "active" ? "disabled" : "active",
      });
      if ("error" in result) setError(result.error);
    });
  }

  return (
    <div>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button size="sm" variant="ghost" className={NEUTRAL_ACTION_CLASS} disabled={isPending}>
              {isPending ? "Working…" : "Manage"}
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onSendReset}>Send password reset</DropdownMenuItem>
          <DropdownMenuItem onClick={onSignOut}>
            Log out from all devices
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onToggleStatus}>
            {status === "active" ? "Disable account" : "Re-enable account"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
