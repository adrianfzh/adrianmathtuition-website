// /app/notebook loading skeleton — error-notebook entry rows.
import { SkRowCards, SkTitle } from '@/components/PortalSkeleton';

export default function Loading() {
  return (
    <div className="space-y-4 pb-24 sm:pb-4">
      <SkTitle />
      <SkRowCards n={4} />
    </div>
  );
}
