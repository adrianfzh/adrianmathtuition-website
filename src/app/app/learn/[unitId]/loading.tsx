// /app/learn/[unitId] loading skeleton — the unit player: top bar + one tall
// content card.
import { Sk, SkCard } from '@/components/PortalSkeleton';

export default function Loading() {
  return (
    <div className="space-y-4 pb-24 sm:pb-4">
      <div className="flex items-center justify-between pt-1">
        <Sk className="h-4 w-24 rounded-md" />
        <Sk className="h-4 w-16 rounded-md" />
      </div>
      <SkCard className="!p-5 space-y-3">
        <Sk className="h-6 w-2/3 rounded-lg" />
        <Sk className="h-3.5 w-full rounded-md" />
        <Sk className="h-3.5 w-11/12 rounded-md" />
        <Sk className="h-3.5 w-4/5 rounded-md" />
        <Sk className="h-56 w-full rounded-xl" />
      </SkCard>
    </div>
  );
}
