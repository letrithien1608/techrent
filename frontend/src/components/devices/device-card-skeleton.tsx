import { Skeleton } from "@/components/ui/skeleton";

export function DeviceCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/50">
      <Skeleton className="aspect-[4/3] w-full rounded-none" />
      <div className="space-y-2 p-4">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-5 w-2/5" />
      </div>
    </div>
  );
}
