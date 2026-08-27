// /app/learn loading skeleton — subject pills + topic list.
import { Sk, SkCard, SkTitle } from '@/components/PortalSkeleton';

export default function Loading() {
  return (
    <div className="space-y-4 pb-24 sm:pb-4">
      <SkTitle />
      <div className="flex gap-2">
        <Sk className="h-9 w-24 rounded-full" />
        <Sk className="h-9 w-24 rounded-full" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <SkCard key={i}>
            <div className="flex items-center gap-3">
              <div className="flex-1 space-y-2">
                <Sk className="h-4 w-1/2 rounded-md" />
                <Sk className="h-3 w-1/3 rounded-md" />
              </div>
              <Sk className="w-6 h-6 rounded-full shrink-0" />
            </div>
          </SkCard>
        ))}
      </div>
    </div>
  );
}
