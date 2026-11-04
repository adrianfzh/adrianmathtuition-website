'use client';

// /admin/another-way — 🔀 "Another way to solve this" waiting for Adrian (SPEC-ANOTHER-WAY.md).
// Each card: the bank question, the main worked solution (folded), and the drop-down exactly as a
// student sees it — shown OPEN here so every line can be read. Nothing reaches a student until he
// presses Approve. A row whose blind check did not pass cannot be approved.

import { useCallback, useEffect, useState } from 'react';
import { ensureAdminSession, loginAdminSession } from '@/lib/admin-client';
import SolutionText from '@/components/SolutionText';
import AnotherWay from '@/components/AnotherWay';
import { mathHtml } from '@/lib/math-inline';
import { checkProblems } from '@/lib/alt-method';
import type { AnotherWayRow } from '@/app/api/admin/another-way/route';

const TABS = [
  { key: 'pending', label: 'Waiting' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
] as const;

const LEVEL: Record<string, string> = { S1: 'Sec 1', S2: 'Sec 2', EM: 'E Math', AM: 'A Math', S3_EM: 'E Math', S3_AM: 'A Math', JC1: 'H2 Math', JC2: 'H2 Math' };

export default function AnotherWayReview() {
  const [authed, setAuthed] = useState(false);
  const [pw, setPw] = useState('');
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('pending');
  const [rows, setRows] = useState<AnotherWayRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/another-way?status=${tab}`);
      if (r.ok) setRows((await r.json()).rows ?? []);
    } finally { setLoading(false); }
  }, [tab]);

  useEffect(() => { ensureAdminSession().then(ok => { if (ok) setAuthed(true); }); }, []);
  useEffect(() => { if (authed) void load(); }, [authed, load]);

  async function act(id: string, action: 'approve' | 'reject' | 'pending') {
    const note = action === 'reject' ? (window.prompt('What is wrong with it? (optional)') ?? '') : undefined;
    setBusy(id);
    try {
      const r = await fetch('/api/admin/another-way', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action, ...(note ? { note } : {}) }) });
      if (r.ok) setRows(prev => prev.filter(x => x.id !== id));
      else alert((await r.json().catch(() => ({}))).error ?? 'Could not save');
    } finally { setBusy(null); }
  }

  if (!authed) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-neutral-100">
        <form className="bg-white rounded-xl shadow p-6 w-full max-w-xs space-y-3"
          onSubmit={async (e) => { e.preventDefault(); if (await loginAdminSession(pw)) setAuthed(true); }}>
          <div className="font-semibold text-neutral-800">🔀 Another way</div>
          <input type="password" value={pw} onChange={e => setPw(e.target.value)} placeholder="Admin password"
            className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm" />
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
          <h1 className="text-lg font-semibold text-neutral-800">🔀 Another way to solve this</h1>
          <button onClick={() => void load()} className="ml-auto text-sm text-neutral-500 hover:text-neutral-800" disabled={loading}>{loading ? 'Refreshing…' : '↻ Refresh'}</button>
        </header>
        <p className="text-sm text-neutral-600 px-1">
          A second method for a bank question, re-solved by a separate checker that had to reach the bank&apos;s answer.
          Each card below is shown closed, exactly as a student sees it — tap it to open. You also see waiting ones under the worked solution on Practice (marked “Waiting for your approval”). No student sees one until you press <b>Approve</b>.
        </p>
        <div className="flex gap-2 px-1">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`text-sm rounded-full px-3 py-1 border ${tab === t.key ? 'bg-neutral-900 text-white border-neutral-900' : 'bg-white text-neutral-700 border-neutral-300'}`}>
              {t.label}
            </button>
          ))}
        </div>
        {!loading && rows.length === 0 && <p className="text-sm text-neutral-500 px-1">Nothing here.</p>}
        {rows.map(r => {
          const q = r.question;
          const problems = checkProblems(r.checks);
          return (
            <section key={r.id} className="bg-white rounded-2xl border border-black/5 shadow-sm p-4 space-y-3" data-another-way-review>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full bg-neutral-100 text-neutral-700 px-2 py-0.5">{LEVEL[q?.level ?? ''] ?? q?.level} · {(q?.topics ?? []).join(', ')}</span>
                <span className="rounded-full bg-sky-50 text-sky-800 px-2 py-0.5">{r.main_method} → {r.alt_method}</span>
                {problems.length === 0
                  ? <span className="rounded-full bg-emerald-50 text-emerald-800 px-2 py-0.5">✓ Checked: same answer</span>
                  : <span className="rounded-full bg-rose-50 text-rose-700 px-2 py-0.5">✗ {problems.join('; ')}</span>}
              </div>
              {q?.question_text && <div className="text-[14px] text-neutral-800 leading-relaxed" dangerouslySetInnerHTML={{ __html: mathHtml(q.question_text) }} />}
              {q?.answer && <div className="text-[13px] text-neutral-600">Bank answer: <span dangerouslySetInnerHTML={{ __html: mathHtml(q.answer) }} /></div>}
              {q?.solution && (
                <details className="text-[13px]">
                  <summary className="cursor-pointer text-neutral-500">The main worked solution ({r.main_method})</summary>
                  <div className="mt-2"><SolutionText text={q.solution} /></div>
                </details>
              )}
              {/* Exactly what a student sees — closed until tapped. */}
              <AnotherWay alt={{ method: r.alt_method, mainMethod: r.main_method, working: r.working, better: r.better }} />
              {r.checks?.notes && <p className="text-[12px] text-neutral-500">Checker: {r.checks.notes}</p>}
              {r.note && <p className="text-[12px] text-rose-700">Your note: {r.note}</p>}
              <div className="flex gap-2 pt-1">
                {r.status !== 'approved' && (
                  <button disabled={busy === r.id || problems.length > 0} onClick={() => void act(r.id, 'approve')}
                    className="text-sm font-semibold bg-emerald-600 text-white rounded-lg px-3.5 py-1.5 disabled:opacity-50">✓ Approve</button>
                )}
                {r.status !== 'rejected' && (
                  <button disabled={busy === r.id} onClick={() => void act(r.id, 'reject')}
                    className="text-sm font-semibold bg-white border border-neutral-300 text-neutral-700 rounded-lg px-3.5 py-1.5 disabled:opacity-50">✗ Reject</button>
                )}
                {r.status !== 'pending' && (
                  <button disabled={busy === r.id} onClick={() => void act(r.id, 'pending')}
                    className="text-sm text-neutral-500 rounded-lg px-2 py-1.5 disabled:opacity-50">Back to waiting</button>
                )}
                <a href={`/admin/questions?id=${r.question_id}`} className="ml-auto self-center text-[12px] text-neutral-400 hover:text-neutral-600">Open question ›</a>
              </div>
            </section>
          );
        })}
      </div>
    </main>
  );
}
