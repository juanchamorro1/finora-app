import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-10" aria-busy="true" aria-label="Cargando">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-10 w-56" />
      </div>
      <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-6 w-28" />
          </div>
        ))}
      </div>
      <Skeleton className="h-60 w-full" />
      <div className="flex flex-col gap-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="size-9 rounded-full" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}
