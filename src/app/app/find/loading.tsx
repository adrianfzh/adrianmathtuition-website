// /app/find loading skeleton — title row, the two doors, the hint line.
// See components/PortalSkeleton.tsx for why every /app segment has one.
import { Sk, SkCard, SkTitle } from '@/components/PortalSkeleton';

export default function Loading() {
  return (
    <div className="space-y-4 pb-24 sm:pb-4">
      <SkTitle action />
      <SkCard>
        <div className="grid grid-cols-2 gap-2">
          <Sk className="h-12 rounded-xl" />
          <Sk className="h-12 rounded-xl" />
        </div>
        <Sk className="h-3 w-56 rounded mx-auto mt-3" />
      </SkCard>
    </div>
  );
}
