'use client';
// Turn a learned rule off (or back on) — PATCH /api/admin/humanities-rules.
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function RuleSwitch({ id, live }: { id: string; live: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button type="button" disabled={busy}
      onClick={async () => {
        setBusy(true);
        await fetch('/api/admin/humanities-rules', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, on: !live }) }).catch(() => {});
        router.refresh(); setBusy(false);
      }}
      className={`shrink-0 text-xs font-semibold rounded-full px-3 py-1 border ${live ? 'border-rose-300 text-rose-700' : 'border-emerald-300 text-emerald-700'} disabled:opacity-50`}>
      {busy ? '…' : live ? 'Turn off' : 'Turn back on'}
    </button>
  );
}
