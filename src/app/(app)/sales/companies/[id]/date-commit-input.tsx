"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const FULL_DATE = /^(19|20)\d{2}-\d{2}-\d{2}$/;

/** Date input that saves on its own: a calendar pick or the last digit typed commits after a
 * short pause, and blur / Enter commit at once; partial years seen while typing never do.
 * Escape cancels (`onCancel`). Each distinct date is committed once. */
export function DateCommitInput({
  id,
  value,
  onCommit,
  onDone,
  onCancel,
  autoFocus,
  className,
  "aria-label": ariaLabel,
}: {
  id?: string;
  value: string;
  onCommit: (v: string) => void;
  /** Called after blur / Enter (the editor can close). */
  onDone?: () => void;
  onCancel?: () => void;
  autoFocus?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  const [draft, setDraft] = useState(value);
  const [synced, setSynced] = useState(value);
  if (synced !== value) {
    setSynced(value);
    setDraft(value);
  }

  // Typing a date fires onChange per segment ("…-01" then "…-15"); wait for a pause, blur or
  // Enter so each change is saved (and logged) once.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const committed = useRef(value);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function commit(v: string) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (!FULL_DATE.test(v) || v === value || v === committed.current) return;
    committed.current = v;
    onCommit(v);
  }

  return (
    <Input
      id={id}
      type="date"
      aria-label={ariaLabel}
      autoFocus={autoFocus}
      required
      className={cn("h-7 bg-background text-[0.8rem]", className)}
      value={draft}
      onChange={(e) => {
        const v = e.target.value;
        setDraft(v);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => commit(v), 800);
      }}
      onBlur={() => {
        commit(draft);
        onDone?.();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit(draft);
          onDone?.();
        } else if (e.key === "Escape" && onCancel) {
          e.preventDefault();
          e.stopPropagation();
          if (timer.current) clearTimeout(timer.current);
          timer.current = null;
          onCancel();
        }
      }}
    />
  );
}
