import { Skeleton } from "@/components/ui/skeleton";

export default function MeLoading() {
  return (
    <div aria-busy="true" className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-3">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-28" />
        </div>
      </div>
      <Skeleton className="h-12 w-full" />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(300px,0.8fr)]">
        <Skeleton className="h-[420px]" />
        <Skeleton className="h-[260px]" />
      </div>
      <span className="sr-only">正在加载“我的”页面</span>
    </div>
  );
}
