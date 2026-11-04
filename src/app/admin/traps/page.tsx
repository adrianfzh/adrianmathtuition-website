'use client';

// /admin/traps — 🪤 common traps: the bank questions most students lose marks on, and the mistake
// most of them make (4 Nov 2026). A label separate from the level — a Core question can be a trap.
// Counts: each student's first go (marked papers + maths practice); filled nightly. Admin only.

import { useEffect, useState } from 'react';
import { ensureAdminSession, loginAdminSession } from '@/lib/admin-client';
import { MathMarkdown } from '@/lib/math-markdown';
import { trapLine } from '@/lib/question-traps';
import type { TrapListRow } from '@/app/api/admin/traps/route';
import type { ErrorKind } from '@/lib/error-kinds';

const LEVEL_WORD: Record<string, string> = { Standard: 'Core', Advanced: 'Advanced', Challenging: 'Challenge' };

export default function TrapsPage() {
  const [authed, setAuthed] = useState(false);
  const [pw, setPw] = useState('');
  const [rows, setRows] = useState<TrapListRow[]>([]);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [level, setLevel] = useState('all');

  useEffect(() => { ensureAdminSession().then(ok => { if (ok) setAuthed(true); }); }, []);
  useEffect(() => {
    if (!authed) return;
    setLoading(true);
    fetch('/api/admin/traps').then(r => r.json()).then(d => { if (d.error) setErr(d.error); else setRows(d.rows ?? []); })
      .catch(e => setErr(String(e))).finally(() => setLoading(false));
  }, [authed]);

  if (!authed) {
    return (
      <main className="min-h-screen bg-neutral-100 flex items-center justify-center p-6">
        <form className="bg-white rounded-xl shadow p-6 w-full max-w-xs space-y-3"
          onSubmit={async (e) => { e.preventDefault(); if (await loginAdminSession(pw)) setAuthed(true); }}>
          <div className="font-semibold text-neutral-800">🪤 Common traps</div>
          <input type="password" value={pw} onChange={e => setPw(e.target.value)} placeholder="Admin password"
            className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm" />
          <button className="w-full bg-neutral-900 text-white rounded-lg py-2 text-sm">Enter</button>
        </form>
      </main>
    );
  }

  const levels = Array.from(new Set(rows.map(r => r.questions?.level).filter((x): x is string => Boolean(x)))).sort();
  const shown = level === 'all' ? rows : rows.filter(r => r.questions?.level === level);
  return (
    <main className="min-h-screen bg-neutral-100 p-4 sm:p-6">
      <div className="max-w-3xl mx-auto space-y-4">
        <header className="flex items-center gap-3">
          <a href="/admin" className="text-neutral-400 hover:text-neutral-600 text-sm">← Hub</a>
          <h1 className="text-lg font-semibold text-neutral-800">🪤 Common traps</h1>
        </header>
        <p className="text-sm text-neutral-600 px-1">
          Questions where most students lost marks on their first go (5 students or more), and the mistake at least half of them made, when there is one.
          From marked papers and practice; updated every night. Separate from the level — a Core question can be a trap.
        </p>
        <div className="flex flex-wrap gap-2 px-1">
          {['all', ...levels].map(l => (
            <button key={l} onClick={() => setLevel(l)}
              className={`text-sm rounded-full px-3 py-1 border ${level === l ? 'bg-neutral-900 text-white border-neutral-900' : 'bg-white text-neutral-700 border-neutral-300'}`}>
              {l === 'all' ? `All (${rows.length})` : l}
            </button>
          ))}
        </div>
        {err && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-800">{err}</div>}
        {loading && <div className="text-sm text-neutral-500 px-1">Loading…</div>}
        {!loading && !err && !shown.length && <div className="text-sm text-neutral-500 px-1">Nothing yet — the nightly run fills this.</div>}
        {shown.map(r => {
          const q = r.questions;
          return (
            <section key={r.question_id} className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4">
              <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                {q?.level && <span className="rounded-full bg-neutral-100 px-2 py-0.5">{q.level}</span>}
                {q?.topics?.[0] && <span className="rounded-full bg-neutral-100 px-2 py-0.5">{q.topics[0]}</span>}
                <span>{[q?.school, q?.year, q?.paper ? `P${q.paper}` : null, q?.question_number ? `Q${q.question_number}` : null].filter(Boolean).join(' ')}</span>
                <span className="rounded-full bg-amber-50 text-amber-800 px-2 py-0.5">{LEVEL_WORD[q?.difficulty ?? ''] ?? 'Core'}</span>
              </div>
              <div className="mt-2 text-sm font-semibold text-red-800">{trapLine({ ...r, kind: r.kind as ErrorKind | null })}</div>
              <div className="mt-2 text-sm text-neutral-800"><MathMarkdown content={(q?.question_text || '(question opens with a figure)') + ((q?.question_text?.length ?? 0) >= 240 ? '…' : '')} /></div>
              <div className="mt-2 text-[11px] text-neutral-400">{r.from_papers} from marked papers · {r.from_practice} from practice</div>
            </section>
          );
        })}
      </div>
    </main>
  );
}
