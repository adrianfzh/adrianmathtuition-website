// /app/assignments/[id] loading skeleton — one worksheet card.
import { Sk, SkCard } from '@/components/PortalSkeleton';

export default function Loading() {
  return (
    <div className="space-y-4 pb-24 sm:pb-4">
      <div className="pt-1"><Sk className="h-4 w-28 rounded-md" /></div>
      <SkCard className="!p-5 space-y-3">
        <Sk className="h-3 w-40 rounded-md" />
        <Sk className="h-6 w-3/4 rounded-lg" />
        <Sk className="h-3 w-1/2 rounded-md" />
        <Sk className="h-12 w-full rounded-xl" />
        <Sk className="h-64 w-full rounded-xl" />
      </SkCard>
    </div>
  );
}
