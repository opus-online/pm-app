"use client";

import { useId, useState, useTransition } from "react";
import { approveConnectionAction, denyConnectionAction } from "@/app/actions/mcp-connections";
import { ACCESS_ITEMS } from "@/lib/mcp/access-labels";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** Allow/Deny for a claude.ai connector request. Read only is the default; the server action
 * re-checks everything -- this component only carries the authorization id and the choice. */
export function ConsentForm({
  authorizationId, appName, userName, userEmail,
}: { authorizationId: string; appName: string; userName: string; userEmail: string }) {
  const ids = useId();
  const [canWrite, setCanWrite] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function decide(allow: boolean) {
    setError(null);
    startTransition(async () => {
      try {
        const result = allow
          ? await approveConnectionAction({ authorizationId, canWrite })
          : await denyConnectionAction(authorizationId);
        if ("error" in result) setError(result.error);
        else window.location.assign(result.url);
      } catch {
        setError("Something went wrong. Start again from Claude.");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connect {appName}</CardTitle>
        <CardDescription>
          {appName} will work in PM app as {userName} ({userEmail}), with your permissions.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <div className="grid gap-1.5">
          <Label htmlFor={`${ids}-access`}>Access</Label>
          <Select items={ACCESS_ITEMS} value={String(canWrite)} onValueChange={(v) => v && setCanWrite(v === "true")}>
            <SelectTrigger id={`${ids}-access`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ACCESS_ITEMS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardContent>
      <CardFooter className="justify-end gap-2">
        <Button type="button" variant="outline" disabled={isPending} onClick={() => decide(false)}>
          Deny
        </Button>
        <Button type="button" disabled={isPending} onClick={() => decide(true)}>
          {isPending ? "Connecting…" : "Allow"}
        </Button>
      </CardFooter>
    </Card>
  );
}
