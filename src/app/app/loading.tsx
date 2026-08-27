// /app loading skeleton — mirrors the dashboard: greeting, next-lesson row,
// the three-door bento (amber Practise hero + two stacked tiles), plan row.
// See components/PortalSkeleton.tsx for why every /app segment has one.
import { Sk, SkCard, SkRow } from '@/components/PortalSkeleton';

export default function Loading() {
  return (
    <div className="space-y-4 pb-20 sm:pb-4">
      <Sk className="h-8 w-44 rounded-lg mt-1" />

      {/* Next lesson row */}
      <SkCard className="!py-3.5"><SkRow /></SkCard>

      {/* Three-door bento: Practise hero + Hand in / Marked */}
      <div className="grid grid-cols-2 gap-3 auto-rows-fr">
        <div className="row-span-2 rounded-3xl p-4 bg-amber-200/50 animate-pulse flex flex-col justify-between min-h-44">
          <div className="w-11 h-11 rounded-2xl bg-white/50" />
          <div className="space-y-2">
            <div className="h-4 w-24 rounded-md bg-white/50" />
            <div className="h-3 w-32 rounded-md bg-white/40" />
          </div>
        </div>
        <SkCard><SkRow /></SkCard>
        <SkCard><SkRow /></SkCard>
      </div>

      {/* My Plan row */}
      <SkCard><SkRow /></SkCard>

      {/* Revision notes / last lesson */}
      <SkCard><SkRow /></SkCard>
    </div>
  );
}
