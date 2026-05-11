import { Suspense } from 'react';
import EditCardsClient from './EditCardsClient';

export default function EditCardsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-slate-500">Loading…</div>}>
      <EditCardsClient />
    </Suspense>
  );
}
