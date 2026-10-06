"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Columns3, List } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export type PipelineView = "list" | "board";

export function ViewToggle({ view }: { view: PipelineView }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setView(groupValue: string[]) {
    const next = groupValue[0];
    if (!next) return; // ignore the toggle-off click; a view must stay selected
    const params = new URLSearchParams(searchParams.toString());
    if (next === "list") params.delete("view");
    else params.set("view", next);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <ToggleGroup
      value={[view]}
      onValueChange={setView}
      variant="outline"
      aria-label="Toggle list or board view"
    >
      <ToggleGroupItem value="list" aria-label="List view">
        <List />
      </ToggleGroupItem>
      <ToggleGroupItem value="board" aria-label="Board view">
        <Columns3 />
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
