"use client";

import { useId, useState, useTransition } from "react";
import { CheckIcon, CopyIcon, KeyRoundIcon, PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { createMcpKeyAction, revokeMcpKeyAction } from "@/app/actions/mcp-keys";
import { createMcpKeySchema, MCP_KEY_EXPIRY_DAYS, type McpKeyExpiryDays } from "@/lib/validation/mcp";
import {
  claudeCodeCommand, claudeDesktopConfig, type McpKeyRow, type McpKeyStatus,
} from "@/lib/mcp/key-display";
import { formatDateEt } from "@/lib/sales/date-format";
import { DESTRUCTIVE_ACTION_CLASS } from "@/lib/action-styles";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DotBadge } from "@/components/dot-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

/** Settings → AI assistant: create a personal MCP access key (shown once) and manage your keys.
 * `keys` is the allowlisted McpKeyRow shape built server-side in page.tsx -- never key_hash. */
export function AiAssistantCard({ keys }: { keys: McpKeyRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>AI assistant</CardTitle>
        <CardDescription>Personal keys that let Claude work in PM CMS on your behalf.</CardDescription>
        <CardAction>
          <CreateKeyDialog />
        </CardAction>
      </CardHeader>
      <CardContent>
        <McpKeysTable keys={keys} emptyText="No keys yet." />
      </CardContent>
    </Card>
  );
}

const STATUS_DOT: Record<McpKeyStatus, string> = {
  active: "bg-emerald-500",
  expired: "bg-muted-foreground/40",
  revoked: "bg-red-500",
};
const STATUS_LABEL: Record<McpKeyStatus, string> = {
  active: "Active",
  expired: "Expired",
  revoked: "Revoked",
};

/** Shared by the Settings card (own keys) and User access (all keys, `showOwner`). */
export function McpKeysTable({
  keys,
  showOwner = false,
  emptyText,
}: {
  keys: McpKeyRow[];
  showOwner?: boolean;
  emptyText: string;
}) {
  if (keys.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-dashed px-4 py-5 text-sm text-muted-foreground">
        <KeyRoundIcon className="size-4 shrink-0" />
        {emptyText}
      </div>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {showOwner && <TableHead>User</TableHead>}
          <TableHead>Key</TableHead>
          <TableHead>Access</TableHead>
          <TableHead>Created</TableHead>
          <TableHead>Expires</TableHead>
          <TableHead>Last used</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="w-0">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {keys.map((k) => (
          <TableRow key={k.id} className={cn(k.status !== "active" && "text-muted-foreground")}>
            {showOwner && (
              <TableCell>
                <div className="font-medium">{k.owner?.name ?? "—"}</div>
                <div className="text-xs text-muted-foreground">{k.owner?.email}</div>
              </TableCell>
            )}
            <TableCell className="max-w-48">
              <div className="truncate font-medium" title={k.label}>
                {k.label}
              </div>
              <code className="font-mono text-xs text-muted-foreground">{k.prefix}…</code>
            </TableCell>
            <TableCell className="whitespace-nowrap">{ACCESS_LABEL[String(k.canWrite) as "true" | "false"]}</TableCell>
            <TableCell className="tabular-nums">{formatDateEt(k.createdAt)}</TableCell>
            <TableCell className="tabular-nums">{formatDateEt(k.expiresAt)}</TableCell>
            <TableCell className="tabular-nums">
              {k.lastUsedAt ? formatDateEt(k.lastUsedAt) : "Never"}
            </TableCell>
            <TableCell>
              <DotBadge dotClassName={STATUS_DOT[k.status]}>{STATUS_LABEL[k.status]}</DotBadge>
            </TableCell>
            <TableCell className="text-right">
              {k.status === "active" && <RevokeKeyButton keyRow={k} showOwner={showOwner} />}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function RevokeKeyButton({ keyRow, showOwner }: { keyRow: McpKeyRow; showOwner: boolean }) {
  const whose = showOwner && keyRow.owner ? `${keyRow.owner.name}'s key` : "This key";
  return (
    <ConfirmDialog
      trigger={<Button variant="ghost" size="sm" className={DESTRUCTIVE_ACTION_CLASS} />}
      triggerLabel="Revoke"
      title={`Revoke "${keyRow.label}"?`}
      description={`${whose} stops working immediately. This can't be undone.`}
      confirmLabel="Revoke"
      pendingLabel="Revoking…"
      onConfirm={async () => {
        try {
          const result = await revokeMcpKeyAction(keyRow.id);
          if ("success" in result) toast.success("Key revoked");
          return result;
        } catch {
          return { error: "Could not revoke the key. Try again." };
        }
      }}
    />
  );
}

const EXPIRY_ITEMS = MCP_KEY_EXPIRY_DAYS.map((d) => ({ value: String(d), label: `${d} days` }));

const ACCESS_LABEL = { false: "Read only", true: "Read and write" } as const;
const ACCESS_ITEMS = [
  { value: "false", label: ACCESS_LABEL.false },
  { value: "true", label: ACCESS_LABEL.true },
];

function CreateKeyDialog() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm">
            <PlusIcon />
            Create key
          </Button>
        }
      />
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
        {open && <CreateKeyForm onClose={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function CreateKeyForm({ onClose }: { onClose: () => void }) {
  const ids = useId();
  const [isPending, startTransition] = useTransition();
  const [label, setLabel] = useState("");
  const [days, setDays] = useState<McpKeyExpiryDays>(90);
  const [canWrite, setCanWrite] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdKey, setCreatedKey] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (isPending) return;
    const parsed = createMcpKeySchema.safeParse({ label, days, canWrite });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the details.");
      return;
    }
    setError(null);
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof createMcpKeyAction>>;
      try {
        result = await createMcpKeyAction(parsed.data);
      } catch {
        toast.error("Could not create the key. Try again.");
        return;
      }
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setCreatedKey(result.key);
    });
  }

  if (createdKey) return <CreatedKeyPanel apiKey={createdKey} onClose={onClose} />;

  return (
    <form onSubmit={submit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Create key</DialogTitle>
        <DialogDescription className="sr-only">Name the key, choose its access and when it expires</DialogDescription>
      </DialogHeader>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
        <div className="grid gap-1.5">
          <Label htmlFor={`${ids}-label`}>Label</Label>
          <Input
            id={`${ids}-label`}
            value={label}
            maxLength={100}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Work laptop"
            autoFocus
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${ids}-expiry`}>Expires in</Label>
          <Select
            items={EXPIRY_ITEMS}
            value={String(days)}
            onValueChange={(v) => v && setDays(Number(v) as McpKeyExpiryDays)}
          >
            <SelectTrigger id={`${ids}-expiry`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EXPIRY_ITEMS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor={`${ids}-access`}>Access</Label>
        <Select
          items={ACCESS_ITEMS}
          value={String(canWrite)}
          onValueChange={(v) => v && setCanWrite(v === "true")}
        >
          <SelectTrigger id={`${ids}-access`} className="w-full sm:w-56">
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

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Creating…" : "Create key"}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** One-time display: the full key exists only in this component's state -- once the dialog
 * closes it is gone (only its hash is stored), so both connect snippets are offered here too. */
function CreatedKeyPanel({ apiKey, onClose }: { apiKey: string; onClose: () => void }) {
  const origin = (process.env.NEXT_PUBLIC_SITE_URL || window.location.origin).replace(/\/+$/, "");
  return (
    <div className="grid min-w-0 gap-4">
      <DialogHeader>
        <DialogTitle>Key created</DialogTitle>
        <DialogDescription>Copy it now — it won&apos;t be shown again.</DialogDescription>
      </DialogHeader>

      <Snippet title="Access key" value={apiKey} copyLabel="Copy key" emphasis />
      <Snippet title="Claude Code" value={claudeCodeCommand(origin, apiKey)} copyLabel="Copy command" />
      <Snippet
        title="Claude Desktop"
        value={claudeDesktopConfig(origin, apiKey)}
        copyLabel="Copy config"
      />

      <DialogFooter>
        <Button type="button" onClick={onClose}>
          Done
        </Button>
      </DialogFooter>
    </div>
  );
}

function Snippet({
  title,
  value,
  copyLabel,
  emphasis = false,
}: {
  title: string;
  value: string;
  copyLabel: string;
  emphasis?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Copy failed — select the text and copy it manually.");
    }
  }

  return (
    <div className="grid min-w-0 gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{title}</span>
        <Button type="button" variant="ghost" size="xs" onClick={copy}>
          {copied ? <CheckIcon className="text-emerald-600 dark:text-emerald-400" /> : <CopyIcon />}
          {copied ? "Copied" : "Copy"}
          <span className="sr-only">{copyLabel.replace(/^Copy /, "")}</span>
        </Button>
      </div>
      <pre
        className={cn(
          "rounded-lg border bg-muted/40 px-3 py-2.5 font-mono text-xs leading-relaxed break-all whitespace-pre-wrap select-all",
          emphasis && "border-emerald-500/25 bg-emerald-500/5 text-sm text-foreground",
        )}
      >
        {value}
      </pre>
    </div>
  );
}
