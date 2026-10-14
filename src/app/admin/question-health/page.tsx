'use client';

// /admin/question-health — 🩺 the question check (SPEC-QUESTION-HEALTH.md, 14 Oct 2026).
// The switch; the week's counts; the short list of questions paused for Adrian (our solver and the
// school's key disagree) with one tap each; and the automatic fixes, each with Undo.

import { useCallback, useEffect, useState } from 'react';
import { ensureAdminSession, loginAdminSession } from '@/lib/admin-client';
import type { WeekCounts } from '@/lib/question-health';

type Part = { label: string; ours: string | null; solver: string | null; scheme?: string | null; agree: boolean };
type Paused = {
  question_id: string; note: string | null; checked_at: string | null;
  method: { parts?: Part[]; scheme_source?: string | null; problem?: string | null } | null;
  question: { question_text?: string | null; school?: string | null; year?: number | null; paper?: string | null; question_number?: string | null; level?: string | null; figure_url?: string | null; image_url?: string | null; parts?: { label?: string; text?: string }[] | null } | null;
};
type EditRow = { id: number; question_id: string; field: string; kind: string; evidence: string; made_at: string; made_by: string; undone_at: string | null };
type Data = { settings: { on: boolean; changedAt: string | null }; week: WeekCounts; paused: Paused[]; edits: EditRow[] };

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-SG', { timeZone: 'Asia/Singapore', day: 'numeric', month: 'short' }) : '');
const KIND: Record<string, string> = { copy: 'Copy slip fixed', topic: 'Topic fixed', level: 'Level fixed', key: 'Key corrected', 'twin-rewrite': 'Our question reworded', adrian: 'Your choice' };

export default function QuestionHealthPage() {
  const [authed, setAuthed] = useState(false);
  const [pw, setPw] = useState('');
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch('/api/admin/question-health');
    const j = await r.json();
    if (!r.ok) setErr(j.error || 'could not load'); else { setErr(null); setData(j); }
  }, []);
  useEffect(() => { ensureAdminSession().then((ok) => { if (ok) setAuthed(true); }); }, []);
  useEffect(() => { if (authed) load(); }, [authed, load]);

  const post = async (key: string, body: Record<string, unknown>) => {
    setBusy(key);
    const r = await fetch('/api/admin/question-health', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    setBusy(null);
    if (!r.ok) setErr(j.error || 'failed'); else load();
  };

  if (!authed) {
    return (
      <form className="mx-auto mt-24 max-w-xs space-y-3 px-4" onSubmit={async (e) => { e.preventDefault(); if (await loginAdminSession(pw)) setAuthed(true); }}>
        <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Password" className="w-full rounded border px-3 py-2" />
        <button className="w-full rounded bg-neutral-900 py-2 text-white">Log in</button>
      </form>
    );
  }

  const w = data?.week;
  return (
    <main className="mx-auto max-w-3xl space-y-5 px-4 py-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">🩺 Question check</h1>
        <p className="text-sm text-neutral-600">A maths question is checked the first time it is about to reach a student. A separate solver works it without our answer and we compare.</p>
      </header>
      {err && <p className="rounded bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</p>}
      {!data && !err && <p className="text-sm text-neutral-500">Loading…</p>}

      {data && (
        <section className="flex items-center justify-between rounded-xl bg-white p-4 shadow-sm">
          <div>
            <div className="font-medium">{data.settings.on ? 'On' : 'Off'}</div>
            <div className="text-xs text-neutral-500">{data.settings.on ? 'Questions are checked as students meet them.' : 'Nothing is checked. Turning it on uses plan time on the worker.'}{data.settings.changedAt ? ` · changed ${day(data.settings.changedAt)}` : ''}</div>
          </div>
          <button disabled={busy === 'switch'} onClick={() => post('switch', { action: 'switch', on: !data.settings.on })}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${data.settings.on ? 'bg-neutral-200 text-neutral-800' : 'bg-emerald-600 text-white'}`}>
            {data.settings.on ? 'Turn off' : 'Turn on'}
          </button>
        </section>
      )}

      {w && (
        <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[['Checked', w.checked], ['Fixed', w.fixed], ['Paused for you', w.pausedWaiting], ['Retired', w.retired]].map(([k, v]) => (
            <div key={k} className="rounded-xl bg-white p-3 text-center shadow-sm">
              <div className="text-2xl font-semibold">{v}</div>
              <div className="text-xs text-neutral-500">{k}{k === 'Paused for you' ? '' : ' · 7 days'}</div>
            </div>
          ))}
        </section>
      )}

      {data && (
        <section className="space-y-3">
          <h2 className="font-semibold">Paused for you ({data.paused.length})</h2>
          {!data.paused.length && <p className="text-sm text-neutral-500">Nothing waiting.</p>}
          {data.paused.map((p) => {
            const q = p.question;
            const ref = q ? [q.school, q.year, q.paper, q.question_number && `Q${q.question_number}`, q.level].filter(Boolean).join(' · ') : p.question_id;
            const bad = (p.method?.parts ?? []).filter((x) => !x.agree);
            const fig = q?.figure_url || q?.image_url;
            return (
              <article key={p.question_id} className="space-y-2 rounded-xl bg-white p-4 shadow-sm">
                <div className="text-xs text-neutral-500">{ref}</div>
                {q?.question_text && <p className="whitespace-pre-wrap text-sm">{q.question_text}</p>}
                {(q?.parts ?? []).map((pt, i) => <p key={i} className="text-sm text-neutral-700">({String(pt.label ?? '').replace(/[()]/g, '')}) {pt.text}</p>)}
                {fig && /^https?:/.test(fig) && <img src={fig} alt="" className="max-h-64 rounded border" />}
                <p className="text-sm font-medium text-amber-800">{p.note}</p>
                {bad.length > 0 && (
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-xs text-neutral-500"><th>Part</th><th>Our key</th><th>Solver</th><th>School</th></tr></thead>
                    <tbody>{bad.map((b) => <tr key={b.label}><td>{b.label}</td><td>{b.ours ?? '—'}</td><td>{b.solver ?? '—'}</td><td>{b.scheme ?? '—'}</td></tr>)}</tbody>
                  </table>
                )}
                <div className="flex flex-wrap gap-2 pt-1">
                  <button disabled={!!busy} onClick={() => post(p.question_id, { action: 'decide', question_id: p.question_id, choice: 'keep' })} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm text-white">Our key is right</button>
                  {bad.some((b) => b.solver) && <button disabled={!!busy} onClick={() => post(p.question_id, { action: 'decide', question_id: p.question_id, choice: 'use-solver' })} className="rounded-lg bg-sky-600 px-3 py-1.5 text-sm text-white">Solver is right — fix the key</button>}
                  <button disabled={!!busy} onClick={() => post(p.question_id, { action: 'decide', question_id: p.question_id, choice: 'retire' })} className="rounded-lg bg-neutral-200 px-3 py-1.5 text-sm">Retire it</button>
                </div>
              </article>
            );
          })}
        </section>
      )}

      {data && data.edits.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold">Automatic fixes</h2>
          <ul className="divide-y rounded-xl bg-white text-sm shadow-sm">
            {data.edits.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-2">
                <div>
                  <div className={e.undone_at ? 'text-neutral-400 line-through' : ''}>{KIND[e.kind] ?? e.kind} · {e.field.replace('_', ' ')}</div>
                  <div className="text-xs text-neutral-500">{e.evidence} · {day(e.made_at)} · <a className="underline" href={`/admin/questions?id=${e.question_id}`}>open</a></div>
                </div>
                {!e.undone_at && <button disabled={!!busy} onClick={() => post(`undo-${e.id}`, { action: 'undo', edit_id: e.id })} className="rounded border px-2 py-1 text-xs">Undo</button>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
