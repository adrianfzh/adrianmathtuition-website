// /app/settings loading skeleton — account card + preference cards.
import { Sk, SkCard, SkTitle } from '@/components/PortalSkeleton';

export default function Loading() {
  return (
    <div className="space-y-4 pb-20 sm:pb-4">
      <SkTitle />
      <SkCard className="!p-5 space-y-2.5">
        <Sk className="h-3 w-20 rounded-md mb-1" />
        <Sk className="h-3.5 w-2/3 rounded-md" />
        <Sk className="h-3.5 w-1/2 rounded-md" />
        <Sk className="h-3.5 w-2/5 rounded-md" />
      </SkCard>
      <SkCard className="!p-5 space-y-2.5">
        <Sk className="h-3 w-24 rounded-md mb-1" />
        <Sk className="h-10 w-full rounded-xl" />
      </SkCard>
      <SkCard className="!p-5"><Sk className="h-9 w-32 rounded-xl" /></SkCard>
    </div>
  );
}
