'use client';

// /admin/generated — the questions written from students' photos
// (SPEC-PRACTICE-PHOTO.md §7, §12 step 6). Newest first; each card shows the
// question, its solution folded, the seed it was re-skinned from (or "from
// scratch"), who it was written for, and any student report. Two actions:
// Restore (clears a report) and Retire (deleted_at — never served again).
// The PRACTICE_PHOTO_OPEN_TO_STUDENTS flag flips only after Adrian has read
// the first 20 here.

import { useCallback, useEffect, useState } from 'react';
import { ensureAdminSession, loginAdminSession } from '@/lib/admin-client';
import { MathMarkdown } from '@/lib/math-markdown';
import { questionMarkdown, solutionMarkdown, type BankPart, type BankQuestion } from '@/lib/bank-question-markdown';
import type { GeneratedRow } from '@/app/api/admin/generated/route';

function fmtWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-SG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// Where a generated row came from, in one chip (gen_meta.kind): a Set paper slot,
// a practice photo, the finder, or the nightly top-up (no kind, twin_of only).
function sourceChip(meta: Record<string, unknown>, twinOf: string | null): string {
  const kind = typeof meta.kind === 'string' ? meta.kind : '';
  if (kind === 'gce-set') return `📚 Set ${meta.set ?? '?'} · ${meta.key ?? ''}${meta.slot != null ? ` slot ${meta.slot}` : ''}`;
  if (kind === 'practice-photo') return '📷 Practice photo';
  if (kind === 'find') return '🔍 Find a question';
  if (kind === 'science-twin') return `🧪 Science twin${typeof meta.level_written === 'string' ? ` · ${meta.level_written[0].toUpperCase()}${meta.level_written.slice(1)}` : ''}${typeof meta.pool === 'string' && meta.pool.startsWith('CS_') ? ' · Combined' : ''}`;
  if (kind) return kind;
  return twinOf ? '🌙 top-up twin' : 'generated';
}

// Per-part answers, indented like the question ("**(a)** 31.5 / (i) 9.28…").
function partAnswers(parts: unknown, depth = 0): string {
  if (!Array.isArray(parts)) return '';
  const pad = '&nbsp;&nbsp;'.repeat(depth);
  return (parts as BankPart[]).map(pt => {
    const ans = (pt as { answer?: unknown }).answer;
    const line = pt.label ? `${pad}**(${pt.label})** ${ans == null || ans === '' ? '—' : String(ans)}` : '';
    return [line, partAnswers(pt.subparts, depth + 1)].filter(Boolean).join('\n\n');
  }).filter(Boolean).join('\n\n');
}

function Card({ r, onAction }: { r: GeneratedRow; onAction: (id: string, action: 'restore' | 'retire' | 'verify') => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const retired = Boolean(r.deleted_at);
  const reported = Boolean(r.reported_at);
  const meta = r.gen_meta ?? {};
  const reskin = meta.reskin === true || Boolean(r.twin_of);
  // The bank's own renderer: stem images + text + the parts tree with marks.
  const bq: BankQuestion = {
    id: r.id, question_text: r.question_text, parts: Array.isArray(r.parts) ? (r.parts as BankPart[]) : null,
    image_url: r.image_url, images: Array.isArray(r.images) ? (r.images as { filename: string }[]) : null,
    solution: r.solution, answer: r.answer,
  };
  // A generated figure lives in figure_url (Set papers), a bank scan in question_image_url.
  const figure = r.figure_url || r.question_image_url || null;
  const answers = partAnswers(r.parts);
  return (
    <section className={`bg-white rounded-xl shadow-sm border p-4 ${reported ? 'border-red-300' : retired ? 'border-neutral-300 opacity-60' : 'border-neutral-200'}`}>
      <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
        <span>{fmtWhen(r.created_at)}</span>
        {r.level && <span className="rounded-full bg-neutral-100 px-2 py-0.5">{r.level}</span>}
        {r.topics?.length ? <span className="rounded-full bg-neutral-100 px-2 py-0.5">{r.topics.join(" · ")}</span> : null}
        {typeof meta.subgroup === 'string' && <span className="rounded-full bg-sky-50 text-sky-700 px-2 py-0.5">{meta.subgroup}</span>}
        {r.total_marks != null && <span>[{r.total_marks}]</span>}
        {r.twin_of && (r.verified ? <span className="rounded-full bg-emerald-600 text-white px-2 py-0.5">✓ verified</span> : <span className="rounded-full bg-amber-50 text-amber-700 px-2 py-0.5">unverified — not served</span>)}
        <span className="rounded-full bg-emerald-50 text-emerald-700 px-2 py-0.5">{sourceChip(meta, r.twin_of)}</span>
        <span className={`rounded-full px-2 py-0.5 ${reskin ? 'bg-violet-50 text-violet-700' : 'bg-amber-50 text-amber-700'}`}>{reskin ? 're-skin' : 'from scratch'}</span>
        {r.student && <span>for <b>{r.student}</b></span>}
        {retired && <span className="rounded-full bg-neutral-200 px-2 py-0.5">retired</span>}
      </div>
      {reported && (
        <div className="mt-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-800">
          🚩 Reported {r.reported_at ? fmtWhen(r.reported_at) : ''}{r.reported_by ? ` by ${r.reported_by}` : ''}: {r.report_reason || '—'}
        </div>
      )}
      <div className="mt-3 text-sm text-neutral-900">
        {figure && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={figure} alt="figure" className="mb-3 max-h-72 rounded border border-neutral-200 bg-white" />
        )}
        <MathMarkdown content={questionMarkdown(bq) || '(no text)'} />
      </div>
      <button onClick={() => setOpen(o => !o)} className="mt-3 text-xs text-neutral-500 hover:text-neutral-800">{open ? '▾ Hide' : '▸ Solution + seed'}</button>
      {open && (
        <div className="mt-2 space-y-3 text-sm">
          <div className="rounded-lg bg-neutral-50 p-3">
            <div className="text-[11px] uppercase tracking-wider text-neutral-400 mb-1">Answers</div>
            <MathMarkdown content={[r.answer ? `**Answer:** ${r.answer}` : '', answers].filter(Boolean).join('\n\n') || '(none)'} />
          </div>
          <div className="rounded-lg bg-neutral-50 p-3">
            <div className="text-[11px] uppercase tracking-wider text-neutral-400 mb-1">Solution</div>
            <MathMarkdown content={solutionMarkdown({ ...bq, answer: null }) || '(none)'} />
          </div>
          <div className="rounded-lg bg-neutral-50 p-3">
            <div className="text-[11px] uppercase tracking-wider text-neutral-400 mb-1">
              Seed {r.seed ? `· ${[r.seed.school, r.seed.year, r.seed.paper].filter(Boolean).join(' ')}${r.seed.total_marks != null ? ` [${r.seed.total_marks}]` : ''}` : '· none (written from scratch)'}
            </div>
            {r.seed && <MathMarkdown content={r.seed.question_text || ''} />}
          </div>
          {typeof meta.gates === 'object' && meta.gates && (
            <div className="text-xs text-neutral-500">Gates: <code>{JSON.stringify(meta.gates)}</code></div>
          )}
        </div>
      )}
      <div className="mt-3 flex gap-2">
        {(reported || retired) && (
          <button disabled={busy} onClick={async () => { setBusy(true); await onAction(r.id, 'restore'); setBusy(false); }}
            className="text-xs rounded-lg border border-emerald-300 text-emerald-700 px-3 py-1 hover:bg-emerald-50">Restore</button>
        )}
        {!retired && r.twin_of && !r.verified && (
          <button disabled={busy} onClick={async () => { setBusy(true); await onAction(r.id, 'verify'); setBusy(false); }}
            className="text-xs rounded-lg bg-emerald-600 text-white px-3 py-1 hover:bg-emerald-700">✓ Verify — serve it</button>
        )}
        {!retired && (
          <button disabled={busy} onClick={async () => { if (!confirm('Retire this question? It will never be served or used as a seed again.')) return; setBusy(true); await onAction(r.id, 'retire'); setBusy(false); }}
            className="text-xs rounded-lg border border-neutral-300 text-neutral-600 px-3 py-1 hover:bg-neutral-50">Retire</button>
        )}
      </div>
    </section>
  );
}

export default function GeneratedPage() {
  const [authed, setAuthed] = useState(false);
  const [pw, setPw] = useState('');
  const [rows, setRows] = useState<GeneratedRow[]>([]);
  type GapPool = { pool: string; subskills: number; covered: number; short: number; no_seed: number; need: number; open_need: number };
  const [gap, setGap] = useState<{ per_skill: number; pools: GapPool[]; total: Omit<GapPool, 'pool'> } | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [reportedOnly, setReportedOnly] = useState(false);
  // Maths | Science (5 Oct 2026): the science bank's twins live in the science project
  const [bank, setBank] = useState<'math' | 'science' | 'figures'>(() => {
    if (typeof window === 'undefined') return 'math';
    const sp = new URLSearchParams(window.location.search);
    return sp.get('tab') === 'figures' ? 'figures' : sp.get('bank') === 'science' ? 'science' : 'math';
  });
  // 🖼 Figures we need (5 Oct 2026): what twins needed that no figure family draws, by shape
  type NeedGroup = { shape: string; count: number; ready: boolean; banks: string[]; subjects: string[]; topics: string[]; examples: string[]; newThisWeek: number };
  const [needs, setNeeds] = useState<{ ready_at: number; groups: NeedGroup[] } | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      if (bank === 'figures') {
        const f = await fetch('/api/admin/figure-needs');
        const fd = await f.json();
        if (!f.ok) throw new Error(fd.error || `HTTP ${f.status}`);
        setNeeds(fd); setRows([]); return;
      }
      const qs = bank === 'science' ? '?bank=science' : reportedOnly ? '?reported=1' : '';
      const r = await fetch(`/api/admin/generated${qs}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setRows(d.rows ?? []);
      setGap(d.gap ?? null);
    } catch (e) { setErr((e as Error).message); } finally { setLoading(false); }
  }, [reportedOnly, bank]);

  useEffect(() => { ensureAdminSession().then(ok => { if (ok) setAuthed(true); }); }, []);
  useEffect(() => { if (authed) load(); }, [authed, load]);

  async function onAction(id: string, action: 'restore' | 'retire' | 'verify') {
    const r = await fetch('/api/admin/generated', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action, bank }) });
    if (!r.ok) { setErr(`${action} failed: HTTP ${r.status}`); return; }
    await load();
  }

  if (!authed) {
    return (
      <main className="min-h-screen bg-neutral-100 flex items-center justify-center p-6">
        <form className="bg-white rounded-xl shadow p-6 w-full max-w-xs space-y-3"
          onSubmit={async (e) => { e.preventDefault(); if (await loginAdminSession(pw)) setAuthed(true); }}>
          <div className="font-semibold text-neutral-800">📷 Generated questions</div>
          <input type="password" value={pw} onChange={e => setPw(e.target.value)} placeholder="Admin password"
            className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm" />
          <button className="w-full bg-neutral-900 text-white rounded-lg py-2 text-sm">Enter</button>
        </form>
      </main>
    );
  }

  const reportedCount = rows.filter(r => r.reported_at).length;
  return (
    <main className="min-h-screen bg-neutral-100 p-4 sm:p-6">
      <div className="max-w-3xl mx-auto space-y-4">
        <header className="flex items-center gap-3">
          <a href="/admin" className="text-neutral-400 hover:text-neutral-600 text-sm">← Hub</a>
          <h1 className="text-lg font-semibold text-neutral-800">📷 Questions written from students’ photos</h1>
          <button onClick={load} className="ml-auto text-sm text-neutral-500 hover:text-neutral-800" disabled={loading}>{loading ? 'Refreshing…' : '↻ Refresh'}</button>
        </header>
        <p className="text-sm text-neutral-600 px-1">
          Newest first. Read the first 20 before the Practice photo page opens to students (SPEC-PRACTICE-PHOTO §12).
          A student’s report stops a question being served or used as a seed; <b>Restore</b> clears it, <b>Retire</b> removes it for good.
        </p>
        <div className="flex gap-2 px-1">
          {(['math', 'science', 'figures'] as const).map(b => (
            <button key={b} onClick={() => setBank(b)}
              className={`text-sm rounded-full px-3 py-1 border ${bank === b ? 'bg-neutral-900 text-white border-neutral-900' : 'bg-white text-neutral-700 border-neutral-300'}`}>
              {b === 'math' ? 'Maths' : b === 'science' ? '🧪 Science twins' : '🖼 Figures we need'}
            </button>
          ))}
        </div>
        {bank === 'science' && (
          <div className="space-y-2 px-1">
            <p className="text-sm text-neutral-600">Our own MCQs, {gap?.per_skill ?? 3} for every sub-skill, each at its seed&apos;s level (Core, Exam or Challenge), written by the worker&apos;s science-twins lane and cloud sessions. Each passed every check, so it is already in practice; <b>Retire</b> takes one out.</p>
            {gap && (
              <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
                <table className="w-full text-xs">
                  <thead className="text-neutral-500"><tr><th className="text-left px-2 py-1">Science</th><th className="px-2 py-1">Sub-skills</th><th className="px-2 py-1">Done</th><th className="px-2 py-1">Short</th><th className="px-2 py-1">Twins to write</th></tr></thead>
                  <tbody>
                    {gap.pools.map(g => (
                      <tr key={g.pool} className="border-t border-neutral-100">
                        <td className="px-2 py-1">{({ PHY: 'Physics', CHEM: 'Chemistry', BIO: 'Biology', CS_PHY: 'Combined · Physics', CS_CHEM: 'Combined · Chemistry', CS_BIO: 'Combined · Biology' } as Record<string, string>)[g.pool] ?? g.pool}</td>
                        <td className="px-2 py-1 text-center">{g.subskills}</td><td className="px-2 py-1 text-center">{g.covered}</td><td className="px-2 py-1 text-center">{g.short + g.no_seed}</td>
                        <td className="px-2 py-1 text-center">{g.need}{g.open_need ? <span className="text-neutral-400"> ({g.open_need} open topics)</span> : null}</td>
                      </tr>
                    ))}
                    <tr className="border-t border-neutral-200 font-semibold"><td className="px-2 py-1">All</td><td className="px-2 py-1 text-center">{gap.total.subskills}</td><td className="px-2 py-1 text-center">{gap.total.covered}</td><td className="px-2 py-1 text-center">{gap.total.short + gap.total.no_seed}</td><td className="px-2 py-1 text-center">{gap.total.need}</td></tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
        {bank === 'figures' && (
          <div className="space-y-2 px-1">
            <p className="text-sm text-neutral-600">Pictures our twins needed that no figure family can draw yet — the seed was set aside each time. A shape needed by {needs?.ready_at ?? 3} or more questions is ready to build. You get this list every Sunday.</p>
            {!loading && needs && !needs.groups.length && <div className="text-sm text-neutral-500">Nothing waiting.</div>}
            {needs?.groups.map(g => (
              <div key={g.shape} className={`rounded-lg border bg-white p-3 ${g.ready ? 'border-emerald-300' : 'border-neutral-200'}`}>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <b>{g.shape.replace(/-/g, ' ')}</b>
                  <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs">{g.count} question{g.count === 1 ? '' : 's'}</span>
                  {g.ready && <span className="rounded-full bg-emerald-600 text-white px-2 py-0.5 text-xs">ready to build</span>}
                  {g.newThisWeek > 0 && <span className="text-xs text-neutral-500">{g.newThisWeek} new this week</span>}
                  <span className="text-xs text-neutral-500">{[...g.subjects, ...g.topics.slice(0, 3)].join(' · ')}</span>
                  <span className="ml-auto flex gap-2">
                    <button className="text-xs rounded-lg border border-emerald-300 text-emerald-700 px-2 py-0.5" onClick={async () => { const fam = prompt('Built — which family draws it now?') ?? ''; await fetch('/api/admin/figure-needs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ shape: g.shape, status: 'built', family: fam || null }) }); load(); }}>Built</button>
                    <button className="text-xs rounded-lg border border-neutral-300 text-neutral-600 px-2 py-0.5" onClick={async () => { if (!confirm('Drop this shape? It will not be suggested again.')) return; await fetch('/api/admin/figure-needs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ shape: g.shape, status: 'dropped' }) }); load(); }}>Drop</button>
                  </span>
                </div>
                <ul className="mt-1 list-disc pl-5 text-xs text-neutral-600">{g.examples.map(e => <li key={e}>{e}</li>)}</ul>
              </div>
            ))}
          </div>
        )}
        <label className="flex items-center gap-2 text-sm text-neutral-700 px-1">
          <input type="checkbox" checked={reportedOnly} onChange={e => setReportedOnly(e.target.checked)} /> Reported only{reportedCount && !reportedOnly ? ` (${reportedCount} in this list)` : ''}
        </label>
        {err && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-800">{err}</div>}
        {!loading && !rows.length && <div className="text-sm text-neutral-500 px-1">Nothing written yet.</div>}
        {rows.map(r => <Card key={r.id} r={r} onAction={onAction} />)}
      </div>
    </main>
  );
}
