"use client";

import { ACTIVITY_KINDS } from "@/lib/sales/types";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { KIND_META } from "../../activity-kind";
import { PersonOption } from "./mark-done-dialog";

// Form pieces shared by the composer and the edit dialogs, so every place that writes an
// activity looks and behaves the same.

export type LoggableKind = (typeof ACTIVITY_KINDS)[number];
type Person = { id: string; name: string; avatar_url: string | null };
export const NONE = "none";

export function KindToggle({ value, onChange }: { value: LoggableKind; onChange: (k: LoggableKind) => void }) {
  return (
    <ToggleGroup
      value={[value]}
      onValueChange={(v: string[]) => v[0] && onChange(v[0] as LoggableKind)}
      size="sm"
      spacing={1}
      aria-label="Activity type"
    >
      {ACTIVITY_KINDS.map((k) => {
        const { icon: Icon, label, pressed } = KIND_META[k];
        return (
          <ToggleGroupItem key={k} value={k} className={cn("px-2.5 text-muted-foreground", pressed)}>
            <Icon />
            {label}
          </ToggleGroupItem>
        );
      })}
    </ToggleGroup>
  );
}

export function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

export function PersonSelect({
  id,
  value,
  onChange,
  people,
  size = "sm",
}: {
  id: string;
  value: string;
  onChange: (id: string) => void;
  people: Person[];
  size?: "sm" | "default";
}) {
  return (
    <Select value={value} onValueChange={(v) => v && onChange(v)}>
      <SelectTrigger id={id} size={size} className="w-full">
        <SelectValue>
          {(v: string) => {
            const p = people.find((x) => x.id === v);
            return p ? <PersonOption person={p} /> : <span className="text-muted-foreground">Select</span>;
          }}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {people.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            <PersonOption person={p} />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** A select with a "None" option over `{ id, label }` items (contacts, deals). */
export function OptionalSelect({
  id,
  value,
  onChange,
  options,
  size = "sm",
}: {
  id: string;
  value: string;
  onChange: (id: string) => void;
  options: { id: string; label: string }[];
  size?: "sm" | "default";
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v ?? NONE)}>
      <SelectTrigger id={id} size={size} className="w-full">
        <SelectValue>
          {(v: string) => options.find((o) => o.id === v)?.label ?? <span className="text-muted-foreground">None</span>}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>None</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.id} value={o.id}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export const PLAN_PLACEHOLDER: Record<LoggableKind, string> = {
  call: "Who to call and why?",
  email: "What to send?",
  meeting: "What to meet about?",
  note: "What needs doing?",
};

/** Local wall-clock "YYYY-MM-DDTHH:mm" -- the value format of <input type="datetime-local">. */
export function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
