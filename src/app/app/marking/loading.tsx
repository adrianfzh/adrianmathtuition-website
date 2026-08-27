// /app/marking loading skeleton — flow strip, header + submit button,
// summary card, then paper cards.
import { Sk, SkCard, SkRowCards, SkTitle } from '@/components/PortalSkeleton';

export default function Loading() {
  return (
    <div className="space-y-4 pb-24 sm:pb-4">
      <div className="-mb-1 pt-1"><Sk className="h-8 w-56 rounded-full" /></div>
      <SkTitle action />
      <SkCard className="!p-5">
        <Sk className="h-3 w-24 rounded-md mb-3" />
        <div className="flex items-end gap-6">
          <Sk className="h-10 w-20 rounded-lg" />
          <Sk className="h-16 flex-1 rounded-lg" />
        </div>
      </SkCard>
      <SkRowCards n={3} />
    </div>
  );
}
