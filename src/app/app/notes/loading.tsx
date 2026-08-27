// /app/notes loading skeleton — this segment only redirects into the /notes
// reader; the skeleton just keeps the tap responsive while the redirect
// round-trips.
import { Sk, SkCard } from '@/components/PortalSkeleton';

export default function Loading() {
  return (
    <div className="space-y-4 pb-24 sm:pb-4">
      <Sk className="h-7 w-40 rounded-lg mt-1" />
      <SkCard className="!p-5 space-y-3">
        <Sk className="h-4 w-2/3 rounded-md" />
        <Sk className="h-3.5 w-full rounded-md" />
        <Sk className="h-3.5 w-4/5 rounded-md" />
      </SkCard>
    </div>
  );
}
