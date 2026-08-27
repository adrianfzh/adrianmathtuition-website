// /app/reference loading skeleton — subject pills, search bar, formula rows.
import { Sk, SkCard, SkTitle } from '@/components/PortalSkeleton';

export default function Loading() {
  return (
    <div className="space-y-4 pb-24 sm:pb-4">
      <SkTitle />
      <div className="flex gap-2">
        <Sk className="h-9 w-24 rounded-full" />
        <Sk className="h-9 w-24 rounded-full" />
      </div>
      <Sk className="h-11 w-full rounded-xl" />
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkCard key={i} className="space-y-2">
            <Sk className="h-4 w-1/2 rounded-md" />
            <Sk className="h-3.5 w-full rounded-md" />
            <Sk className="h-3.5 w-3/4 rounded-md" />
          </SkCard>
        ))}
      </div>
    </div>
  );
}
