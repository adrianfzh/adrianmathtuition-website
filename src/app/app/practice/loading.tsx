// /app/practice loading skeleton — title, level pills, topic list rows.
import { Sk, SkCard, SkTitle } from '@/components/PortalSkeleton';

export default function Loading() {
  return (
    <div className="space-y-4 pb-24 sm:pb-4">
      <SkTitle />
      <div className="flex gap-2">
        <Sk className="h-9 w-24 rounded-full" />
        <Sk className="h-9 w-24 rounded-full" />
      </div>
      <SkCard className="!p-0 divide-y divide-gray-100">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3.5">
            <Sk className="w-9 h-9 rounded-full shrink-0" />
            <div className="flex-1 space-y-2">
              <Sk className="h-3.5 w-1/2 rounded-md" />
              <Sk className="h-3 w-1/3 rounded-md" />
            </div>
          </div>
        ))}
      </SkCard>
    </div>
  );
}
