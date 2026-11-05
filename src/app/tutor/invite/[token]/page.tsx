'use client';

// 🧑‍🏫 One-time invite link → the tutor sets a password and is signed in.
import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function TutorInvite({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();
  const [who, setWho] = useState<{ email: string; name: string } | null>(null);
  const [gone, setGone] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/tutor/invite?token=${encodeURIComponent(token)}`, { cache: 'no-store' })
      .then(async r => { const j = await r.json().catch(() => ({})); if (r.ok) setWho(j); else setGone(j.error || 'This link has expired.'); });
  }, [token]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (pw !== pw2) { setError('The two passwords are different.'); return; }
    setBusy(true); setError('');
    const r = await fetch('/api/tutor/invite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, password: pw }) });
    setBusy(false);
    if (r.ok) router.replace('/tutor');
    else setError((await r.json().catch(() => ({}))).error || 'Could not save.');
  }

  if (gone) return <main className="mx-auto max-w-sm px-4 py-16"><p className="text-slate-700">{gone}</p></main>;
  if (!who) return <main className="p-6 text-slate-500">Loading…</main>;
  return (
    <main className="mx-auto max-w-sm px-4 py-16">
      <h1 className="mb-1 text-2xl font-bold">Welcome, {who.name}</h1>
      <p className="mb-6 text-sm text-slate-500">Choose a password for {who.email}.</p>
      <form onSubmit={save} className="space-y-3">
        <input className="w-full rounded-lg border px-3 py-2" type="password" autoComplete="new-password" placeholder="Password (10+ characters)" value={pw} onChange={e => setPw(e.target.value)} />
        <input className="w-full rounded-lg border px-3 py-2" type="password" autoComplete="new-password" placeholder="Type it again" value={pw2} onChange={e => setPw2(e.target.value)} />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button disabled={busy} className="w-full rounded-lg bg-slate-900 py-2 font-semibold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Save and sign in'}</button>
      </form>
    </main>
  );
}
