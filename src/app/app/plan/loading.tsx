// /app/plan loading skeleton — title + subtitle, then the three plan bands.
import { Sk, SkCard, SkRowCards } from '@/components/PortalSkeleton';

export default function Loading() {
  return (
    <div className="space-y-5 pb-24 sm:pb-4">
      <div className="pt-1 space-y-2">
        <Sk className="h-7 w-32 rounded-lg" />
        <Sk className="h-3.5 w-4/5 rounded-md" />
      </div>
      <div className="space-y-3">
        <Sk className="h-3 w-28 rounded-md" />
        <SkRowCards n={2} />
      </div>
      <div className="space-y-3">
        <Sk className="h-3 w-24 rounded-md" />
        <SkCard><Sk className="h-10 w-full rounded-lg" /></SkCard>
      </div>
    </div>
  );
}
