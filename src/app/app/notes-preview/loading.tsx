// /app/notes-preview loading skeleton — composed-lesson content cards.
import { Sk, SkCard, SkTitle } from '@/components/PortalSkeleton';

export default function Loading() {
  return (
    <div className="space-y-4 pb-24 sm:pb-4">
      <SkTitle />
      <SkCard className="!p-5 space-y-3">
        <Sk className="h-4 w-40 rounded-md" />
        <Sk className="h-3.5 w-full rounded-md" />
        <Sk className="h-3.5 w-5/6 rounded-md" />
      </SkCard>
      <SkCard className="!p-5 space-y-3">
        <Sk className="h-4 w-48 rounded-md" />
        <Sk className="h-40 w-full rounded-xl" />
      </SkCard>
    </div>
  );
}
