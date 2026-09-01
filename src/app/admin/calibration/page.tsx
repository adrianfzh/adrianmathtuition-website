'use client';

// /admin/calibration — is the AI marker trusted yet, subject by subject?
//
// "The marking SYSTEM is the product" (SPEC-SUBJECTS.md): any frontier model
// drafts plausible marks; trust comes from measuring it against a human
// marking and gating release on the result. This page is that measurement,
// read straight from calibration_results — rows the bot repo's
// scripts/eval-mark-model.js --truth … --save writes; this page never writes.
//
// Per subject: papers compared, share within the ±2 gate, mean |Δ|, question
// agreement, over/under split, latest prompt version, and whether the gate is
// met (≥10 papers AND ≥90% within ±2 — lib/calibration-stats.ts, tested). The
// stretch target is quoted, not computed: there is no dual-rater data yet.
//
// Read-only, admin-only (cookie session), same shape as /admin/ops.

import { Fragment, useCallback, useEffect, useState } from 'react';
import { ensureAdminSession, loginAdminSession } from '@/lib/admin-client';
import SubjectChip from '@/components/SubjectChip';
import { subjectLabel } from '@/lib/mark-subjects';
import {
  isWithinGate, signedDelta,
  type CalibrationRow, type CalibrationStats, type SubjectStats, type TrendPoint,
} from '@/lib/calibration-stats';

type Data = { rows: CalibrationRow[]; stats: CalibrationStats; limit: number; generatedAt: string };

function pct(x: number | null | undefined, digits = 0): string {
  return x === null || x === undefined ? '—' : `${(x * 100).toFixed(digits)}%`;
}
function fix(x: number | null | undefined, digits = 1): string {
  return x === null || x === undefined ? '—' : x.toFixed(digits);
}
function fmtWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-SG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
function weekLabel(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}
/** Δ = AI − human. + is lenient (amber), − short-changes the student (red). */
function fmtDelta(d: number): string {
  return d > 0 ? `+${d}` : String(d);
}
function deltaClass(d: number): string {
  return d > 0 ? 'text-amber-700' : d < 0 ? 'text-red-700' : 'text-emerald-700';
}

// ── Trend: mean |Δ| per week as bars, the gate as a dashed line ─────────────
const BAR_W = 14, GAP = 8, H = 48, BASE = 40, TOP = 6;

function TrendBars({ trend, threshold }: { trend: TrendPoint[]; threshold: number }) {
  const w = trend.length * (BAR_W + GAP) - GAP;
  // Headroom of twice the gate so a run of good weeks doesn't sit on the line.
  const maxV = Math.max(threshold * 2, ...trend.map(p => p.meanAbsDelta ?? 0));
  const y = (v: number) => BASE - (v / maxV) * (BASE - TOP);
  return (
    <svg viewBox={`0 0 ${w} ${H}`} width={w} height={H} role="img"
      aria-label={`Mean absolute delta per week, last ${trend.length} weeks`}
      style={{ maxWidth: '100%', display: 'block' }}>
      <line x1={0} x2={w} y1={y(threshold)} y2={y(threshold)} stroke="#9ca3af" strokeDasharray="3 3" strokeWidth={1} />
      {trend.map((p, i) => {
        const x = i * (BAR_W + GAP);
        if (p.meanAbsDelta === null) {
          // No papers that week: a baseline tick, never a zero-height "perfect" bar.
          return (
            <g key={p.weekStart}>
              <title>{`Week of ${weekLabel(p.weekStart)}: no papers`}</title>
              <rect x={x} y={BASE - 1.5} width={BAR_W} height={1.5} fill="#d1d5db" />
            </g>
          );
        }
        const top = y(p.meanAbsDelta);
        const ok = p.meanAbsDelta <= threshold;
        return (
          <g key={p.weekStart}>
            <title>{`Week of ${weekLabel(p.weekStart)}: ${p.papers} paper${p.papers === 1 ? '' : 's'} · mean |Δ| ${p.meanAbsDelta.toFixed(1)}`}</title>
            <rect x={x} y={Math.min(top, BASE - 2)} width={BAR_W} height={Math.max(2, BASE - top)} rx={2} fill={ok ? '#059669' : '#dc2626'} />
          </g>
        );
      })}
    </svg>
  );
}

// ── Per-subject card ─────────────────────────────────────────────────────────
function GateChip({ s }: { s: SubjectStats }) {
  const g = s.gate;
  const base = 'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap';
  if (g.met) return <span className={`${base} bg-emerald-50 border-emerald-200 text-emerald-700`}>✅ Gate met</span>;
  if (g.papersShort > 0) {
    return (
      <span className={`${base} bg-amber-50 border-amber-200 text-amber-800`} title={`${g.minPapers} papers minimum before the gate can be judged`}>
        ⏳ {s.papers}/{g.minPapers} papers
      </span>
    );
  }
  return (
    <span className={`${base} bg-red-50 border-red-200 text-red-700`}>
      ✗ {pct(s.withinGateShare)} within ±{g.threshold} — need {pct(g.minWithinShare)}
    </span>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string | null }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wider text-neutral-400">{label}</dt>
      <dd className="text-lg font-semibold text-neutral-800 leading-tight">
        {value}
        {sub && <span className="ml-1 text-xs font-normal text-neutral-400">{sub}</span>}
      </dd>
    </div>
  );
}

function SubjectCard({ s, threshold }: { s: SubjectStats; threshold: number }) {
  const empty = s.papers === 0;
  return (
    <section className={`bg-white rounded-xl shadow-sm border p-4 ${s.gate.met ? 'border-emerald-300' : 'border-neutral-200'} ${empty ? 'opacity-70' : ''}`}>
      <div className="flex items-center gap-2">
        <h2 className="font-semibold text-neutral-800">{subjectLabel(s.subject)}</h2>
        <div className="ml-auto"><GateChip s={s} /></div>
      </div>
      <dl className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3 text-sm">
        <Stat label="Papers compared" value={String(s.papers)} />
        <Stat label={`Within ±${threshold}`} value={pct(s.withinGateShare)} sub={s.papers ? `${s.withinGate} of ${s.papers}` : null} />
        <Stat label="Mean |Δ|" value={fix(s.meanAbsDelta)} sub={s.papers ? 'marks / paper' : null} />
        <Stat label="Question agreement" value={pct(s.questionAgreement)} />
        <Stat label="AI over · under" value={s.overShare === null ? '—' : `${pct(s.overShare)} · ${pct(s.underShare)}`} sub={s.overShare === null ? null : 'of verdicts'} />
        <Stat label="Latest prompt" value={s.latestPromptVersion ?? '—'} sub={s.latestModel} />
      </dl>
      <div className="mt-3">
        <div className="text-[11px] uppercase tracking-wider text-neutral-400 mb-1">Mean |Δ| per week · last {s.trend.length} weeks · dashed = gate</div>
        <TrendBars trend={s.trend} threshold={threshold} />
      </div>
    </section>
  );
}

// ── Per-question verdicts inside an expanded row ─────────────────────────────
const VERDICT_CLASS: Record<string, string> = {
  agree: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  over: 'bg-amber-50 text-amber-700 border-amber-200',
  under: 'bg-red-50 text-red-700 border-red-200',
  missing: 'bg-neutral-100 text-neutral-600 border-neutral-200',
  extra: 'bg-neutral-100 text-neutral-600 border-neutral-200',
};
function VerdictChip({ verdict }: { verdict: string }) {
  return (
    <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold ${VERDICT_CLASS[verdict] ?? VERDICT_CLASS.missing}`}>
      {verdict}
    </span>
  );
}

function marks(awarded: number | null, max: number | null): string {
  if (awarded === null || awarded === undefined) return '—';
  return max === null || max === undefined ? String(awarded) : `${awarded}/${max}`;
}

export default function CalibrationPage() {
  const [authed, setAuthed] = useState(false);
  const [pw, setPw] = useState('');
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const r = await fetch('/api/admin/calibration');
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setData(d);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { ensureAdminSession().then(ok => { if (ok) setAuthed(true); }); }, []);
  useEffect(() => { if (authed) load(); }, [authed, load]);

  function toggle(id: string) {
    setOpen(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  if (!authed) {
    return (
      <main className="min-h-screen bg-neutral-100 flex items-center justify-center p-6">
        <form
          className="bg-white rounded-xl shadow p-6 w-full max-w-xs space-y-3"
          onSubmit={async (e) => { e.preventDefault(); if (await loginAdminSession(pw)) setAuthed(true); }}
        >
          <div className="font-semibold text-neutral-800">⚖️ Calibration</div>
          <input type="password" value={pw} onChange={e => setPw(e.target.value)} placeholder="Admin password"
            className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm" />
          <button className="w-full bg-neutral-900 text-white rounded-lg py-2 text-sm">Enter</button>
        </form>
      </main>
    );
  }

  const stats = data?.stats ?? null;
  const rows = data?.rows ?? [];
  const threshold = stats?.gate.threshold ?? 2;

  return (
    <main className="min-h-screen bg-neutral-100 p-4 sm:p-6">
      <div className="max-w-5xl mx-auto space-y-4">
        <header className="flex items-center gap-3">
          <a href="/admin" className="text-neutral-400 hover:text-neutral-600 text-sm">← Hub</a>
          <h1 className="text-lg font-semibold text-neutral-800">⚖️ Calibration — AI marks vs the human standard</h1>
          <button onClick={load} className="ml-auto text-sm text-neutral-500 hover:text-neutral-800" disabled={loading}>
            {loading ? 'Refreshing…' : '↻ Refresh'}
          </button>
        </header>

        {stats && (
          <p className="text-sm text-neutral-600 px-1">
            Gate per paper: <b>|Δ| ≤ {stats.gate.threshold} marks</b> against a trusted human marking. A subject is trusted once
            <b> ≥{stats.gate.minPapers} papers</b> have been compared and <b>≥{pct(stats.gate.minWithinShare)}</b> of them sit inside the gate
            (SPEC-SUBJECTS · SPEC-SCIENCE-MARKING). Target line: <em>&ldquo;{stats.gate.targetLine}&rdquo;</em>.
          </p>
        )}

        {err && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{err}</div>}

        {data && rows.length === 0 && (
          <section className="bg-white rounded-xl border border-dashed border-neutral-300 px-4 py-6 text-center text-sm text-neutral-500">
            <div className="font-medium text-neutral-700">No calibration runs yet</div>
            <div className="mt-1">
              Run <code className="bg-neutral-100 rounded px-1.5 py-0.5 text-[12px] text-neutral-800">scripts/eval-mark-model.js --truth … --save</code> in
              the bot repo — each saved comparison lands here as a row.
            </div>
          </section>
        )}

        {stats && (
          <div className="grid gap-4 sm:grid-cols-2">
            {stats.subjects.map(s => <SubjectCard key={s.subject} s={s} threshold={threshold} />)}
          </div>
        )}

        {rows.length > 0 && (
          <section className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-x-auto">
            <div className="px-4 py-3 text-sm font-medium text-neutral-800 border-b border-neutral-200">
              Recent comparisons <span className="text-neutral-400 font-normal">· latest {rows.length} · tap a row for its questions</span>
            </div>
            <table className="w-full text-sm min-w-[820px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-neutral-400 border-b border-neutral-200">
                  <th className="px-4 py-2 font-medium whitespace-nowrap">When</th>
                  <th className="px-2 py-2 font-medium">Subject</th>
                  <th className="px-2 py-2 font-medium">Paper</th>
                  <th className="px-2 py-2 font-medium">Truth</th>
                  <th className="px-2 py-2 font-medium">Model · prompt</th>
                  <th className="px-2 py-2 font-medium text-right">Human</th>
                  <th className="px-2 py-2 font-medium text-right">AI</th>
                  <th className="px-2 py-2 font-medium text-right">Δ</th>
                  <th className="px-2 py-2 font-medium text-center">Gate</th>
                  <th className="px-4 py-2 font-medium text-right whitespace-nowrap">Q agree</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const d = signedDelta(r);
                  const within = isWithinGate(r, threshold);
                  const isOpen = open.has(r.id);
                  const pq = Array.isArray(r.per_question) ? r.per_question : [];
                  return (
                    <Fragment key={r.id}>
                      <tr onClick={() => toggle(r.id)} className={`border-b border-neutral-100 cursor-pointer hover:bg-neutral-50 ${isOpen ? 'bg-neutral-50' : ''}`}>
                        <td className="px-4 py-2.5 text-neutral-500 whitespace-nowrap font-mono text-xs">{fmtWhen(r.created_at)}</td>
                        <td className="px-2 py-2.5"><SubjectChip subject={r.subject} showMath /></td>
                        <td className="px-2 py-2.5 text-neutral-800">
                          {r.paper_name || <span className="text-neutral-400">—</span>}
                          {r.run_id && (
                            <a href={`/admin/mark-paper?run=${r.run_id}`} onClick={e => e.stopPropagation()}
                              className="ml-1.5 text-violet-700 hover:underline text-xs" title="Open the marking run">✍️ run</a>
                          )}
                        </td>
                        <td className="px-2 py-2.5 text-neutral-700 whitespace-nowrap">
                          {r.truth_label || r.truth_source}
                          {r.truth_label && <span className="text-neutral-400 text-xs"> · {r.truth_source}</span>}
                        </td>
                        <td className="px-2 py-2.5 text-neutral-600 whitespace-nowrap">{r.model}{r.prompt_version ? ` · ${r.prompt_version}` : ''}</td>
                        <td className="px-2 py-2.5 text-right whitespace-nowrap">{r.truth_awarded}/{r.truth_max}</td>
                        <td className="px-2 py-2.5 text-right whitespace-nowrap">{r.ai_awarded}/{r.ai_max}</td>
                        <td className={`px-2 py-2.5 text-right font-semibold ${deltaClass(d)}`}>{fmtDelta(d)}</td>
                        <td className={`px-2 py-2.5 text-center font-semibold ${within ? 'text-emerald-700' : 'text-red-700'}`} title={within ? `within ±${threshold}` : `outside ±${threshold}`}>
                          {within ? '✓' : '✗'}
                        </td>
                        <td className="px-4 py-2.5 text-right whitespace-nowrap">{r.questions_agree}/{r.questions_total}</td>
                      </tr>
                      {isOpen && (
                        <tr className="border-b border-neutral-200">
                          <td colSpan={10} className="bg-neutral-50 px-4 py-3">
                            {pq.length === 0 ? (
                              <div className="text-xs text-neutral-500">No per-question detail on this row.</div>
                            ) : (
                              <table className="text-xs w-full max-w-xl">
                                <thead>
                                  <tr className="text-left text-[10px] uppercase tracking-wider text-neutral-400">
                                    <th className="py-1 pr-3 font-medium">Q</th>
                                    <th className="py-1 pr-3 font-medium">Label</th>
                                    <th className="py-1 pr-3 font-medium text-right">Human</th>
                                    <th className="py-1 pr-3 font-medium text-right">AI</th>
                                    <th className="py-1 pr-3 font-medium text-right">Δ</th>
                                    <th className="py-1 font-medium">Verdict</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {pq.map((q, i) => {
                                    const qd = typeof q.delta === 'number' ? q.delta
                                      : (typeof q.ai_awarded === 'number' && typeof q.truth_awarded === 'number' ? q.ai_awarded - q.truth_awarded : null);
                                    return (
                                      <tr key={`${q.question}-${i}`} className="border-t border-neutral-200">
                                        <td className="py-1 pr-3 font-medium text-neutral-800">{q.question}</td>
                                        <td className="py-1 pr-3 text-neutral-500">{q.label || ''}</td>
                                        <td className="py-1 pr-3 text-right">{marks(q.truth_awarded, q.truth_max)}</td>
                                        <td className="py-1 pr-3 text-right">{marks(q.ai_awarded, q.ai_max)}</td>
                                        <td className={`py-1 pr-3 text-right font-semibold ${qd === null ? 'text-neutral-400' : deltaClass(qd)}`}>{qd === null ? '—' : fmtDelta(qd)}</td>
                                        <td className="py-1"><VerdictChip verdict={String(q.verdict)} /></td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            )}
                            {r.notes && <div className="mt-2 text-xs text-neutral-500 whitespace-pre-wrap">{r.notes}</div>}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </section>
        )}

        <footer className="text-xs text-neutral-400 px-1">
          Δ = AI − human: <span className="text-amber-700">+ over-awarded (lenient)</span> · <span className="text-red-700">− under-awarded (student short-changed)</span>.
          {data && <> Stats cover the same {data.limit}-row window as the table. Updated {fmtWhen(data.generatedAt)}.</>}
        </footer>
      </div>
    </main>
  );
}
