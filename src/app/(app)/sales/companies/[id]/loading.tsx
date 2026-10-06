import { Skeleton } from "@/components/ui/skeleton";

// Own skeleton -- otherwise sales/loading.tsx (the pipeline's) would flash here.
export default function CompanyLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <Skeleton className="h-4 w-40" />
        <div className="flex items-start gap-3">
          <Skeleton className="size-12 rounded-lg" />
          <div className="space-y-1.5">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-80" />
          </div>
        </div>
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[22rem_1fr]">
        <div className="space-y-6">
          <Skeleton className="h-48 w-full rounded-xl" />
          <Skeleton className="h-56 w-full rounded-xl" />
        </div>
        <div className="space-y-6">
          <Skeleton className="h-44 w-full rounded-xl" />
          <Skeleton className="h-96 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}
