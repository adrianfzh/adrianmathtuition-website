import { Suspense } from 'react';
import OfflineSettingsClient from './OfflineSettingsClient';

export const dynamic = 'force-dynamic';

export default function OfflinePage() {
  return (
    <Suspense fallback={<div className="p-8 text-slate-500">Loading…</div>}>
      <OfflineSettingsClient />
    </Suspense>
  );
}
