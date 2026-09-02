'use client';

// /admin/ops — the centre's machine on one page. Read-only: every automated job's
// last logbook row (job_runs) with green/amber lights, the jobs that have never
// stamped, and the marking queue's live lag. The ALARM lives in the health check
// (lib/job-health rules → Telegram); this page is where a "job missed its slot"
// message sends Adrian to see everything at a glance.

import { useCallback, useEffect, useState } from 'react';
import { ensureAdminSession, loginAdminSession } from '@/lib/admin-client';
import { planShareLow, type MarkingShare } from '@/lib/marking-path';

type JobRow = { job: string; ranAt: string; ok: boolean; summary: string | null; rhythm: string | null; staleReason: string | null };
type OpsData = {
  jobs: JobRow[];
  neverStamped: { job: string; rhythm: string }[];
  queue: { pending: number; oldestMinutes: number | null };
  marking: { d7: MarkingShare; d30: MarkingShare } | null;
  generatedAt: string;
};

const JOB_LINKS: Record<string, string> = {
  'generate-invoices': '/admin/invoices',
  'send-invoices': '/admin/invoices',
  'prorated-arrears': '/admin/invoices',
  'prorated-arrears-send': '/admin/invoices',
  'payment-reminder': '/admin/invoices',
  'progress-digest': '/admin/digests',
  'qb-topup': '/admin/bank-health',
  'file-subgroups': '/admin/bank-health',
  'plan-marking': '/admin/papers',
};

function ago(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (!isFinite(mins)) return '—';
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const h = Math.round(mins / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export default function OpsPage() {
  const [authed, setAuthed] = useState(false);
  const [pw, setPw] = useState('');
  const [data, setData] = useState<OpsData | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const r = await fetch('/api/admin/ops');
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
  // The board is a glance-surface: refresh itself every minute while open.
  useEffect(() => {
    if (!authed) return;
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [authed, load]);

  if (!authed) {
    return (
      <main className="min-h-screen bg-neutral-100 flex items-center justify-center p-6">
        <form
          className="bg-white rounded-xl shadow p-6 w-full max-w-xs space-y-3"
          onSubmit={async (e) => { e.preventDefault(); if (await loginAdminSession(pw)) setAuthed(true); }}
        >
          <div className="font-semibold text-neutral-800">🩺 Ops</div>
          <input type="password" value={pw} onChange={e => setPw(e.target.value)} placeholder="Admin password"
            className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm" />
          <button className="w-full bg-neutral-900 text-white rounded-lg py-2 text-sm">Enter</button>
        </form>
      </main>
    );
  }

  const amberJobs = (data?.jobs || []).filter(j => j.staleReason);

  return (
    <main className="min-h-screen bg-neutral-100 p-4 sm:p-6">
      <div className="max-w-3xl mx-auto space-y-4">
        <header className="flex items-center gap-3">
          <a href="/admin" className="text-neutral-400 hover:text-neutral-600 text-sm">← Hub</a>
          <h1 className="text-lg font-semibold text-neutral-800">🩺 Ops — the centre&apos;s machine</h1>
          <button onClick={load} className="ml-auto text-sm text-neutral-500 hover:text-neutral-800" disabled={loading}>
            {loading ? 'Refreshing…' : '↻ Refresh'}
          </button>
        </header>

        {err && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{err}</div>}

        {amberJobs.length > 0 && (
          <div className="bg-amber-50 border border-amber-300 rounded-xl px-4 py-3 text-sm text-amber-900">
            <b>{amberJobs.length} job{amberJobs.length > 1 ? 's' : ''} need{amberJobs.length > 1 ? '' : 's'} attention</b> — the health check has Telegrammed the details.
          </div>
        )}

        {/* Marking queue — event-driven, so it gets a live row of its own. */}
        <section className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden">
          <div className="px-4 py-3 flex items-center gap-3 text-sm">
            <span className={`inline-block w-2.5 h-2.5 rounded-full ${data && data.queue.pending && (data.queue.oldestMinutes ?? 0) > 120 ? 'bg-amber-500' : 'bg-green-600'}`} />
            <span className="font-medium text-neutral-800">Marking queue</span>
            <span className="text-neutral-500">
              {data
                ? data.queue.pending === 0
                  ? 'empty — nothing waiting'
                  : `${data.queue.pending} paper${data.queue.pending > 1 ? 's' : ''} waiting · oldest ${data.queue.oldestMinutes}m`
                : '…'}
            </span>
            <a href="/admin/mark/triage" className="ml-auto text-xs text-neutral-400 hover:text-neutral-700">triage →</a>
          </div>
        </section>

        {/* Marking bill (2 Sep 2026): whose bill Adrian's own papers landed on — the
            Mac (plan usage) or the API. Hand-ins are always API by design, so they
            sit apart. Amber when a busy week is leaking to the API. */}
        {data?.marking && (() => {
          const { d7, d30 } = data.marking;
          const pct = (s: MarkingShare) => (s.planShare == null ? '—' : `${Math.round(s.planShare * 100)}%`);
          const line = (s: MarkingShare) => {
            const own = s.own.plan.runs + s.own.api.runs;
            if (!own && !s.handins.runs) return 'no papers marked';
            const parts = [
              `💻 plan ${s.own.plan.runs}${s.own.plan.costUsd ? ` (API extras $${s.own.plan.costUsd.toFixed(2)})` : ''}`,
              `☁️ API ${s.own.api.runs} ($${s.own.api.costUsd.toFixed(2)})`,
              `plan share ${pct(s)}`,
            ];
            if (s.handins.runs) parts.push(`hand-ins ${s.handins.runs} ($${s.handins.costUsd.toFixed(2)}, always API)`);
            return parts.join(' · ');
          };
          const detail = (s: MarkingShare) => `API split — 🌙 queue ${s.own.byPath['api-queue']}, ⚡ mark now ${s.own.byPath['api-now']}, ▶ sync Mark ${s.own.byPath['api-sync']}`;
          return (
            <section className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden">
              <div className="px-4 py-3 flex items-center gap-3 text-sm">
                <span className={`inline-block w-2.5 h-2.5 rounded-full ${planShareLow(d7) ? 'bg-amber-500' : 'bg-green-600'}`} />
                <span className="font-medium text-neutral-800">Marking bill</span>
                <div className="text-neutral-500 flex flex-col gap-0.5">
                  <span title={detail(d7)}><span className="text-neutral-400">7d</span> {line(d7)}</span>
                  <span title={detail(d30)}><span className="text-neutral-400">30d</span> {line(d30)}</span>
                </div>
                <a href="/admin/mark-paper" className="ml-auto text-xs text-neutral-400 hover:text-neutral-700 whitespace-nowrap">mark-paper →</a>
              </div>
            </section>
          );
        })()}

        {/* The logbook: newest row per job. Amber rows float to the top (API sorts). */}
        <section className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-neutral-400 border-b border-neutral-200">
                <th className="px-4 py-2 font-medium">Job</th>
                <th className="px-2 py-2 font-medium whitespace-nowrap">Last ran</th>
                <th className="px-2 py-2 font-medium">What happened</th>
                <th className="px-4 py-2 font-medium text-right">Rhythm</th>
              </tr>
            </thead>
            <tbody>
              {(data?.jobs || []).map(j => (
                <tr key={j.job} className="border-b border-neutral-100 last:border-0">
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <span className={`inline-block w-2.5 h-2.5 rounded-full mr-2 align-middle ${j.staleReason ? 'bg-amber-500' : j.ok ? 'bg-green-600' : 'bg-red-500'}`} />
                    {JOB_LINKS[j.job]
                      ? <a href={JOB_LINKS[j.job]} className="text-neutral-800 hover:underline">{j.job}</a>
                      : <span className="text-neutral-800">{j.job}</span>}
                  </td>
                  <td className="px-2 py-2.5 text-neutral-500 whitespace-nowrap font-mono text-xs">{ago(j.ranAt)}</td>
                  <td className="px-2 py-2.5 text-neutral-600">
                    {j.staleReason ? <span className="text-amber-700">⚠ {j.staleReason}</span> : (j.summary || (j.ok ? 'ok' : 'failed'))}
                  </td>
                  <td className="px-4 py-2.5 text-right text-neutral-400 text-xs whitespace-nowrap">{j.rhythm || '—'}</td>
                </tr>
              ))}
              {data && data.jobs.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-neutral-400">No logbook entries yet — rows appear as each job next runs.</td></tr>
              )}
            </tbody>
          </table>
        </section>

        {data && data.neverStamped.length > 0 && (
          <section className="text-xs text-neutral-500 px-1">
            Not stamped yet (rows appear on each job&apos;s next run):{' '}
            {data.neverStamped.map(n => `${n.job} (${n.rhythm})`).join(' · ')}
          </section>
        )}

        <footer className="text-xs text-neutral-400 px-1">
          Alarms come from the 6-hourly health check reading this same logbook — a missed slot Telegrams you.
          {data && <> Updated {ago(data.generatedAt)}.</>}
        </footer>
      </div>
    </main>
  );
}
