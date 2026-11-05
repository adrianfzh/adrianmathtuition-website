'use client';

// 🧑‍🏫 Tutors — invite-only accounts for the tutor portal (/tutor). SPEC-TUTOR-TOOLS.md §7.
// Make an account → copy the one-time link → send it to the tutor yourself (WhatsApp).
// Set each tutor's monthly paper cap; switch an account off. Student names never show here.
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ensureAdminSession } from '@/lib/admin-client';

interface Tutor {
  id: string; email: string; name: string; cap: number; active: boolean; note: string | null;
  joined: boolean; inviteOpen: boolean; students: number; papersThisMonth: number; papersAllTime: number;
  waiting: number; costThisMonthUsd: number; lastLoginAt: string | null;
}

export default function AdminTutors() {
  const router = useRouter();
  const [tutors, setTutors] = useState<Tutor[] | null>(null);
  const [month, setMonth] = useState('');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [cap, setCap] = useState('20');
  const [note, setNote] = useState('');
  const [link, setLink] = useState('');
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    const r = await fetch('/api/admin/tutors', { cache: 'no-store' });
    const j = await r.json();
    setTutors(j.tutors ?? []); setMonth(j.month ?? '');
  }, []);
  useEffect(() => { ensureAdminSession().then(ok => { if (!ok) router.replace('/admin'); else void load(); }); }, [router, load]);

  async function create(e: React.FormEvent) {
    e.preventDefault(); setMsg(''); setLink('');
    const r = await fetch('/api/admin/tutors', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, name, cap: Number(cap), note }) });
    const j = await r.json();
    if (!r.ok) { setMsg(j.error || 'Failed'); return; }
    setLink(j.inviteLink); setEmail(''); setName(''); setNote(''); void load();
  }
  async function patch(id: string, body: Record<string, unknown>) {
    setMsg(''); setLink('');
    const r = await fetch('/api/admin/tutors', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...body }) });
    const j = await r.json();
    if (!r.ok) { setMsg(j.error || 'Failed'); return; }
    if (j.inviteLink) setLink(j.inviteLink);
    void load();
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="text-2xl font-bold">🧑‍🏫 Tutors</h1>
      <p className="mb-4 text-sm text-slate-500">Other tutors hand in their students’ papers at <b>/tutor</b>. Invite only — hidden from search. Their papers wait until your students’ queue is empty.</p>

      <form onSubmit={create} className="mb-6 rounded-xl border bg-white p-4">
        <h2 className="mb-2 font-semibold">Invite a tutor</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          <input className="rounded-lg border px-3 py-2" placeholder="Tutor’s name" value={name} onChange={e => setName(e.target.value)} />
          <input className="rounded-lg border px-3 py-2" type="email" placeholder="Tutor’s email" value={email} onChange={e => setEmail(e.target.value)} />
          <label className="flex items-center gap-2 text-sm">Papers a month <input className="w-20 rounded-lg border px-2 py-1" inputMode="numeric" value={cap} onChange={e => setCap(e.target.value)} /></label>
          <input className="rounded-lg border px-3 py-2" placeholder="Note (only you see it)" value={note} onChange={e => setNote(e.target.value)} />
        </div>
        <button className="mt-3 rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white">Make account + invite link</button>
      </form>

      {link && (
        <div className="mb-6 rounded-xl border border-green-300 bg-green-50 p-4">
          <p className="text-sm font-semibold">Send this link to the tutor (works once, for 14 days):</p>
          <p className="mt-1 break-all font-mono text-sm">{link}</p>
          <button className="mt-2 rounded-lg border bg-white px-3 py-1 text-sm" onClick={() => navigator.clipboard.writeText(link).then(() => setMsg('Copied'))}>Copy</button>
        </div>
      )}
      {msg && <p className="mb-4 text-sm text-slate-700">{msg}</p>}

      <h2 className="mb-2 font-semibold">This month ({month})</h2>
      {!tutors ? <p className="text-slate-500">Loading…</p> : tutors.length === 0 ? <p className="text-sm text-slate-500">No tutors yet.</p> : (
        <ul className="space-y-3">
          {tutors.map(t => (
            <li key={t.id} className={`rounded-xl border bg-white p-4 ${t.active ? '' : 'opacity-60'}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{t.name} {!t.active && <span className="text-sm text-red-600">(off)</span>}</p>
                  <p className="text-sm text-slate-500">{t.email}{t.note ? ` · ${t.note}` : ''}</p>
                  <p className="text-sm text-slate-500">{t.joined ? (t.lastLoginAt ? `Last in ${new Date(t.lastLoginAt).toLocaleDateString('en-SG')}` : 'Joined') : t.inviteOpen ? 'Invite sent, not joined yet' : 'Invite expired'}</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold">{t.papersThisMonth} / {t.cap}</p>
                  <p className="text-xs text-slate-500">papers this month · ≈ US${t.costThisMonthUsd.toFixed(2)}</p>
                  <p className="text-xs text-slate-500">{t.students} students · {t.papersAllTime} papers in all{t.waiting ? ` · ${t.waiting} waiting` : ''}</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-sm">
                <button className="rounded-lg border px-3 py-1" onClick={() => { const v = prompt('Papers a month for ' + t.name, String(t.cap)); if (v !== null) void patch(t.id, { cap: Number(v) }); }}>Change cap</button>
                <button className="rounded-lg border px-3 py-1" onClick={() => void patch(t.id, { active: !t.active })}>{t.active ? 'Switch off' : 'Switch on'}</button>
                <button className="rounded-lg border px-3 py-1" onClick={() => { if (confirm('Make a new link? Their old password stops working until they set a new one.')) void patch(t.id, { newInvite: true }); }}>New invite link</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
