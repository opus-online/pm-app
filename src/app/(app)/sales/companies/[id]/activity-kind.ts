import { GitCommitHorizontalIcon, MailIcon, PhoneIcon, StickyNoteIcon, UsersIcon, type LucideIcon } from "lucide-react";
import type { ActivityKind } from "@/lib/sales/types";

/** One look per activity kind, shared by the composer's toggle and the timeline's icon circle. */
export const KIND_META: Record<
  ActivityKind,
  { label: string; icon: LucideIcon; circle: string; pressed: string; placeholder: string }
> = {
  call: {
    label: "Call",
    icon: PhoneIcon,
    circle: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
    pressed: "aria-pressed:bg-sky-500/10 aria-pressed:text-sky-700 dark:aria-pressed:text-sky-300",
    placeholder: "What was discussed?",
  },
  email: {
    label: "Email",
    icon: MailIcon,
    circle: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    pressed: "aria-pressed:bg-violet-500/10 aria-pressed:text-violet-700 dark:aria-pressed:text-violet-300",
    placeholder: "What was the email about?",
  },
  meeting: {
    label: "Meeting",
    icon: UsersIcon,
    circle: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    pressed: "aria-pressed:bg-amber-500/10 aria-pressed:text-amber-700 dark:aria-pressed:text-amber-300",
    placeholder: "What was agreed?",
  },
  note: {
    label: "Note",
    icon: StickyNoteIcon,
    circle: "bg-slate-500/10 text-slate-600 dark:text-slate-300",
    pressed: "aria-pressed:bg-slate-500/10 aria-pressed:text-slate-800 dark:aria-pressed:text-slate-200",
    placeholder: "Write a note…",
  },
  system: {
    label: "Update",
    icon: GitCommitHorizontalIcon,
    circle: "bg-muted text-muted-foreground",
    pressed: "",
    placeholder: "",
  },
};
