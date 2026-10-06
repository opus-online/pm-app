import { Badge } from "@/components/ui/badge";
import { chipDate, chipTone } from "@/lib/deadline-chip";
import { followUpDays } from "@/lib/sales/urgency";
import { cn } from "@/lib/utils";

/** Follow-up date as an urgency-toned chip (overdue red → later neutral); "—" when unset. */
export function FollowUpChip({ date }: { date: string | null }) {
  const days = followUpDays(date);
  if (date === null || days === null) return <span className="text-muted-foreground">—</span>;
  return (
    <Badge variant="outline" className={cn("tabular-nums", chipTone(days))}>
      {chipDate(date, days)}
    </Badge>
  );
}
