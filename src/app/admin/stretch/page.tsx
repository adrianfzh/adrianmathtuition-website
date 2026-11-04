'use client';

// /admin/stretch — 🧩 preview any student's stretch set for this week (SPEC-STRETCH-SET.md).
// Opening a student builds their set if they have none yet and KEEPS it — the
// student later gets exactly what is shown here. Each card wears a grey "why"
// line (where it came from), and the top lists every slot that had to be filled
// from a next-best source this week (the gaps).

import { useCallback, useEffect, useState } from 'react';
import { ensureAdminSession, loginAdminSession } from '@/lib/admin-client';
import StretchSet from '@/components/StretchSet';
import type { ScreenItem } from '@/lib/stretch-set-store';
import { SLOT_TITLE, type StretchSlot } from '@/lib/stretch-set';

const slotName = (s: string) => SLOT_TITLE[s as StretchSlot]?.title ?? s;
const gapLine = (note: string) => { const i = note.indexOf(': '); return i > 0 ? `${slotName(note.slice(0, i))} — ${note.slice(i + 2)}` : note; };

type Student = { id: string; name: string; level: string | null; setLevel: string | null; hasSet: boolean; gaps: number; answered: number };
type Overview = { week: string; students: Student[]; setsBuilt: number; gaps: { note: string; n: number }[] };
type Preview = { account: { id: string; name: string | null; level: string | null }; week: string; level: string; builtBy: string; builtAt: string; built: boolean; answered: boolean; gaps: { slot: string; note: string }[]; items: ScreenItem[] };

const LEVEL: Record<string, string> = { AM: 'A Math', EM: 'E Math', S3_AM: 'A Math (Sec 3)', S3_EM: 'E Math (Sec 3)', JC1: 'H2 (JC1)', JC2: 'H2', S1: 'Sec 1', S2: 'Sec 2' };

export default function StretchAdmin() {
  const [authed, setAuthed] = useState(false);
  const [pw, setPw] = useState('');
  const [ov, setOv] = useState<Overview | null>(null);
  const [pick, setPick] = useState('');
  const [pv, setPv] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const loadOverview = useCallback(async () => {
    const r = await fetch('/api/admin/stretch');
    if (r.ok) setOv(await r.json());
  }, []);
  useEffect(() => { ensureAdminSession().then(ok => { if (ok) setAuthed(true); }); }, []);
  useEffect(() => { if (authed) void loadOverview(); }, [authed, loadOverview]);
  useEffect(() => { const sp = new URLSearchParams(window.location.search); const a = sp.get('account'); if (a) setPick(a); }, []);

  const open = useCallback(async (id: string, rebuild = false) => {
    if (!id) return;
    setBusy(true); setErr(''); setPv(null);
    try {
      const r = rebuild
        ? await fetch('/api/admin/stretch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ account: id, action: 'rebuild' }) })
        : await fetch(`/api/admin/stretch?account=${id}`);
      const j = await r.json();
      if (!r.ok) setErr(j.error ?? 'Could not build'); else setPv(j);
      void loadOverview();
    } finally { setBusy(false); }
  }, [loadOverview]);
  useEffect(() => { if (authed && pick) void open(pick); }, [authed, pick, open]);

  if (!authed) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-neutral-100">
        <form className="bg-white rounded-xl shadow p-6 w-full max-w-xs space-y-3"
          onSubmit={async (e) => { e.preventDefault(); if (await loginAdminSession(pw)) setAuthed(true); }}>
          <div className="font-semibold text-neutral-800">🧩 Stretch sets</div>
          <input type="password" value={pw} onChange={e => setPw(e.target.value)} placeholder="Admin password" className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm" />
          <button className="w-full bg-neutral-900 text-white rounded-lg py-2 text-sm">Enter</button>
        </form>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-100 p-4 sm:p-6">
      <div className="max-w-2xl mx-auto space-y-4">
        <header className="flex items-center gap-3">
          <a href="/admin" className="text-neutral-400 hover:text-neutral-600 text-sm">← Hub</a>
          <h1 className="text-lg font-semibold text-neutral-800">🧩 Stretch sets</h1>
        </header>
        <p className="text-sm text-neutral-600 px-1">
          Five things a week per student: a recent topic asked a new way, a stretch question, an older topic, a spot-the-mistake card, and a “guess first” prompt on one of them.
          Pick a student to see their set <b>as they will see it</b>. Opening it builds it for this week and keeps it — they get exactly this set.
          {ov && <> Week of <b>{ov.week}</b> · {ov.setsBuilt} built so far.</>}
        </p>

        <div className="flex gap-2">
          <select value={pick} onChange={e => setPick(e.target.value)} className="flex-1 min-w-0 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm">
            <option value="">Choose a student…</option>
            {ov?.students.map(s => (
              <option key={s.id} value={s.id}>{s.name} · {LEVEL[s.setLevel ?? ''] ?? s.setLevel}{s.hasSet ? (s.answered ? ' · started' : ' · built') : ''}</option>
            ))}
          </select>
          {pv && !pv.answered && <button disabled={busy} onClick={() => void open(pick, true)} className="text-sm rounded-lg border border-neutral-300 bg-white px-3 py-2">↻ Rebuild</button>}
        </div>

        {ov && ov.gaps.length > 0 && (
          <details className="bg-white rounded-xl border border-neutral-200 p-3 text-sm">
            <summary className="cursor-pointer font-medium text-neutral-700">Gaps this week ({ov.gaps.reduce((a, g) => a + g.n, 0)}) — slots filled from the next-best source</summary>
            <ul className="mt-2 space-y-1 text-neutral-600">{ov.gaps.map(g => <li key={g.note}>· {gapLine(g.note)} <span className="text-neutral-400">×{g.n}</span></li>)}</ul>
          </details>
        )}

        {busy && <p className="text-sm text-neutral-500">Building…</p>}
        {err && <p className="text-sm text-rose-600">{err}</p>}
        {pv && (
          <div className="space-y-3">
            <p className="text-sm text-neutral-700 px-1">
              <b>{pv.account.name}</b> · set built at {LEVEL[pv.level] ?? pv.level} · {pv.built ? 'built just now' : `built ${new Date(pv.builtAt).toLocaleString('en-SG')} by ${pv.builtBy}`}{pv.answered ? ' · the student has started it' : ''}
            </p>
            {pv.gaps.length > 0 && (
              <ul className="text-[13px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-0.5">
                {pv.gaps.map((g, i) => <li key={i}>⚠️ {slotName(g.slot)} — {g.note}</li>)}
              </ul>
            )}
            <StretchSet items={pv.items} preview />
          </div>
        )}
      </div>
    </main>
  );
}
