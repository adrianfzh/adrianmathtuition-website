// /app/print loading skeleton — the three preset cards.
import { Sk, SkCard, SkRow, SkTitle } from '@/components/PortalSkeleton';

export default function Loading() {
  return (
    <div className="space-y-4 pb-24 sm:pb-4">
      <SkTitle />
      <Sk className="h-3.5 w-4/5 rounded-md" />
      <div className="space-y-3">
        <SkCard><SkRow /></SkCard>
        <SkCard><SkRow /></SkCard>
        <SkCard><SkRow /></SkCard>
      </div>
    </div>
  );
}
