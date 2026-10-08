import { Badge } from "@/components/ui/badge";
import { chipTone } from "@/lib/deadline-chip";
import { formatDateEt } from "@/lib/sales/date-format";
import { daysUntil } from "@/lib/sales/urgency";
import { cn } from "@/lib/utils";

/** Due date as an urgency-toned dd.mm.yyyy chip (overdue red → later neutral); "—" when unset. */
export function DueChip({ date, className }: { date: string | null; className?: string }) {
  const days = daysUntil(date);
  if (date === null || days === null) return <span className="text-muted-foreground">—</span>;
  return (
    <Badge variant="outline" className={cn("tabular-nums", chipTone(days), className)}>
      {formatDateEt(date)}
    </Badge>
  );
}
