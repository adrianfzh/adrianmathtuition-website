'use client';
// The "Choose <plan>" button: test site → the plan is on at once (no money);
// main site → off to the Stripe page.
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ChoosePlan({ plan, label }: { plan: string; label: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  async function go() {
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/portal/plans/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Something went wrong — try again.');
      if (d.url) { window.location.href = d.url; return; }
      router.push('/app/plans?paid=1');
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button
        type="button"
        onClick={go}
        disabled={busy}
        className="w-full bg-navy text-[hsl(45,100%,96%)] rounded-xl py-2.5 text-sm font-semibold disabled:opacity-60"
      >
        {busy ? 'One moment…' : label}
      </button>
      {error && <p className="text-sm text-rose-700 mt-2">{error}</p>}
    </>
  );
}
