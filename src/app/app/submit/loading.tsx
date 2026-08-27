// /app/submit loading skeleton — the phone-first hand-in card.
import { Sk, SkCard, SkTitle } from '@/components/PortalSkeleton';

export default function Loading() {
  return (
    <div className="space-y-4 pb-24 sm:pb-4">
      <SkTitle />
      <SkCard className="!p-5 space-y-4">
        <Sk className="h-4 w-3/5 rounded-md" />
        <Sk className="h-40 w-full rounded-2xl" />
        <Sk className="h-12 w-full rounded-xl" />
      </SkCard>
      <SkCard className="!p-4"><Sk className="h-3 w-4/5 rounded-md" /></SkCard>
    </div>
  );
}
