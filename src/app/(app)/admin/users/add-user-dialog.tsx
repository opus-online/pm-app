"use client";

import { useId, useState, useTransition } from "react";
import { CheckIcon, CopyIcon, PlusIcon, RefreshCwIcon } from "lucide-react";
import { toast } from "sonner";
import { createUserAction } from "@/app/actions/admin";
import { APP_ROLES, createUserSchema } from "@/lib/validation/auth";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

type Role = (typeof APP_ROLES)[number];

/** 16 chars, always with a lowercase letter, an uppercase letter and a digit; no look-alikes. */
function generatePassword(): string {
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const all = lower + upper + digits;
  const pick = (set: string) => set[crypto.getRandomValues(new Uint32Array(1))[0] % set.length];
  const chars = [pick(lower), pick(upper), pick(digits)];
  while (chars.length < 16) chars.push(pick(all));
  // shuffle so the guaranteed classes aren't always first
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

export function AddUserDialog() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm">
            <PlusIcon />
            Add user
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        {open && <AddUserForm onClose={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function AddUserForm({ onClose }: { onClose: () => void }) {
  const ids = useId();
  const [isPending, startTransition] = useTransition();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("member");
  const [sales, setSales] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (isPending) return;
    const parsed = createUserSchema.safeParse({ fullName, email, role, sales, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the details.");
      return;
    }
    setError(null);
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof createUserAction>>;
      try {
        result = await createUserAction(parsed.data);
      } catch {
        setError("Could not create the user. Try again.");
        return;
      }
      if ("error" in result) {
        setError(result.error);
        return;
      }
      toast.success("User created");
      setCreated({ email: parsed.data.email, password: parsed.data.password });
    });
  }

  async function copyDetails() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/login\nEmail: ${created.email}\nPassword: ${created.password}`,
      );
      setCopied(true);
    } catch {
      toast.error("Copy failed — select the text and copy it manually.");
    }
  }

  if (created) {
    return (
      <div className="grid gap-4">
        <DialogHeader>
          <DialogTitle>User created</DialogTitle>
          <DialogDescription>Send these login details to the person. They can change the password in Settings.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-1 rounded-lg border bg-muted/40 px-3 py-2.5 font-mono text-sm break-all select-all">
          <span>{created.email}</span>
          <span>{created.password}</span>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={copyDetails}>
            {copied ? <CheckIcon /> : <CopyIcon />}
            {copied ? "Copied" : "Copy login details"}
          </Button>
          <Button type="button" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Add user</DialogTitle>
        <DialogDescription className="sr-only">Create an active account with a password you choose</DialogDescription>
      </DialogHeader>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-1.5">
        <Label htmlFor={`${ids}-name`}>Full name</Label>
        <Input id={`${ids}-name`} value={fullName} onChange={(e) => setFullName(e.target.value)} autoFocus />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`${ids}-email`}>Email</Label>
        <Input
          id={`${ids}-email`}
          type="email"
          autoComplete="off"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor={`${ids}-role`}>Role</Label>
          <Select value={role} onValueChange={(v) => v && setRole(v as Role)}>
            <SelectTrigger id={`${ids}-role`} className="w-full capitalize">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {APP_ROLES.map((r) => (
                <SelectItem key={r} value={r} className="capitalize">
                  {r.replace("_", " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${ids}-sales`}>Sales access</Label>
          <div className="flex h-9 items-center">
            <Switch id={`${ids}-sales`} checked={sales} onCheckedChange={setSales} />
          </div>
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`${ids}-password`}>Password</Label>
        <div className="flex gap-2">
          <Input
            id={`${ids}-password`}
            type="text"
            autoComplete="new-password"
            spellCheck={false}
            className="font-mono"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="12+ characters, upper, lower, digit"
          />
          <Button type="button" variant="outline" onClick={() => setPassword(generatePassword())}>
            <RefreshCwIcon />
            Generate
          </Button>
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Creating…" : "Create user"}
        </Button>
      </DialogFooter>
    </form>
  );
}
