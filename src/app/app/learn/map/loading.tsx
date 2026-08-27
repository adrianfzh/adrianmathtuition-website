// /app/learn/map loading skeleton — the star-map canvas.
import { Sk } from '@/components/PortalSkeleton';

export default function Loading() {
  return (
    <div className="space-y-4 pb-24 sm:pb-4">
      <div className="flex items-center justify-between pt-1">
        <Sk className="h-7 w-36 rounded-lg" />
        <Sk className="h-9 w-24 rounded-full" />
      </div>
      <Sk className="h-[65vh] w-full rounded-3xl" />
    </div>
  );
}
