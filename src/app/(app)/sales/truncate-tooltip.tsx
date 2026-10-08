"use client";

import { useRef, useState } from "react";
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import { Tooltip, TooltipContent } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** One line of text, ellipsised when it doesn't fit; the full text shows in a tooltip only while
 * it actually overflows (measured on hover/focus, so resizes are always honoured). Uses the bare
 * trigger rather than the shared TooltipTrigger so a click on the text still reaches the
 * clickable row around it (row guards skip [data-slot='tooltip-trigger']). */
export function TruncateTooltip({ text, className }: { text: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <Tooltip
      open={open}
      onOpenChange={(next) => {
        const el = ref.current;
        setOpen(next && el !== null && el.scrollWidth > el.clientWidth);
      }}
    >
      <TooltipPrimitive.Trigger
        data-slot="truncate-tooltip"
        render={<span ref={ref} className={cn("block min-w-0 truncate", className)} />}
      >
        {text}
      </TooltipPrimitive.Trigger>
      <TooltipContent className="break-words">{text}</TooltipContent>
    </Tooltip>
  );
}
