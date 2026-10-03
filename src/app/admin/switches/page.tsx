'use client';

// /admin/switches — 🎚 every on/off switch for the machine, on one page (Adrian, 2 Oct
// 2026: "why not we shift the whole toggle to admin hub? have a page just for toggles?").
//   · the marking lane      — 🖥 Mac plan only, 🌙 Gemini Batch (/api/admin/marking-settings)
//   · the plan accounts     — one switch + meters each     (/api/admin/slot-accounts)
//   · the worker's jobs     — extraction, twins, filing, the daily reviews, the
//                             on-request jobs               (/api/admin/worker-jobs)
// The first two sat on /admin/mark-paper until today; the routes and their rules are
// unchanged. A switch stops NEW work only — whatever is running finishes.
// Student-facing switches (the *_OPEN_TO_STUDENTS constants) are code, not settings, and
// are not here.

import { useCallback, useEffect, useState } from 'react';
import { ensureAdminSession, loginAdminSession } from '@/lib/admin-client';
import { WORKER_JOB_GROUPS, type WorkerJobRow } from '@/lib/worker-jobs';

type Flag = { on: boolean; at: string | null };
type SlotUsage = { five_hour: number | null; seven_day: number | null; resets_5h: string | null; resets_7d: string | null; at: string; from: string | null };
type SlotAccountRow = { email: string; key: string; label: string; on: boolean; at: string | null; usage: SlotUsage | null };

const sgt = (iso: string | null, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) =>
  iso ? new Date(iso).toLocaleString('en-SG', { timeZone: 'Asia/Singapore', ...opts }) : null;

function Toggle({ on, busy, label, onClick, tone = '#4f46e5' }: { on: boolean; busy: boolean; label: string; onClick: () => void; tone?: string }) {
  return (
    <button
      type="button" role="switch" aria-checked={on} aria-label={label} disabled={busy} onClick={onClick}
      style={{ position: 'relative', width: 48, height: 28, borderRadius: 999, border: 'none', cursor: busy ? 'default' : 'pointer', background: on ? tone : '#d1d5db', opacity: busy ? 0.5 : 1, flexShrink: 0 }}
    >
      <span style={{ position: 'absolute', top: 4, left: on ? 24 : 4, width: 20, height: 20, borderRadius: 999, background: '#fff', transition: 'left .15s' }} />
    </button>
  );
}

function Meter({ v, label, resets }: { v: number | null; label: string; resets: string | null }) {
  const n = v ?? 0;
  return (
    <span className="inline-flex items-center gap-1.5" title={resets ? `resets ${sgt(resets, { weekday: 'short', hour: '2-digit', minute: '2-digit' })}` : undefined}>
      <span className="inline-block overflow-hidden rounded" style={{ width: 64, height: 6, background: '#e5e7eb' }}>
        <span className="block h-full" style={{ width: `${n}%`, background: n >= 90 ? '#dc2626' : n >= 70 ? '#f59e0b' : '#16a34a' }} />
      </span>
      {label} {v === null ? '?' : `${Math.round(v)}%`}
    </span>
  );
}

export default function SwitchesPage() {
  const [authed, setAuthed] = useState(false);
  const [pw, setPw] = useState('');
  const [macOnly, setMacOnly] = useState<Flag | null>(null);
  const [visionBatch, setVisionBatch] = useState<Flag | null>(null);
  const [accounts, setAccounts] = useState<SlotAccountRow[] | null>(null);
  const [jobs, setJobs] = useState<WorkerJobRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    const get = async (url: string) => { const r = await fetch(url); const d = await r.json().catch(() => ({})); if (!r.ok && !d.jobs) throw new Error(d.error || `HTTP ${r.status}`); return d; };
    const [m, a, j] = await Promise.allSettled([get('/api/admin/marking-settings'), get('/api/admin/slot-accounts'), get('/api/admin/worker-jobs?fresh=1')]);
    if (m.status === 'fulfilled' && m.value?.macOnly) setMacOnly({ on: !!m.value.macOnly.on, at: m.value.macOnly.at ?? null });
    if (m.status === 'fulfilled' && m.value?.visionBatch) setVisionBatch({ on: !!m.value.visionBatch.on, at: m.value.visionBatch.at ?? null });
    if (a.status === 'fulfilled' && Array.isArray(a.value?.accounts)) setAccounts(a.value.accounts);
    if (j.status === 'fulfilled' && Array.isArray(j.value?.jobs)) setJobs(j.value.jobs);
    const failed = [m, a, j].filter(x => x.status === 'rejected').map(x => (x as PromiseRejectedResult).reason?.message).filter(Boolean);
    setErr(failed.length ? `Could not read: ${failed.join(' · ')}` : '');
  }, []);

  useEffect(() => { ensureAdminSession().then(ok => { if (ok) setAuthed(true); }); }, []);
  useEffect(() => { if (authed) load(); }, [authed, load]);
  // The meters move while the lanes run: refresh each minute while the tab is in front.
  useEffect(() => {
    if (!authed) return;
    const t = setInterval(() => { if (!document.hidden && !busy) load(); }, 60000);
    return () => clearInterval(t);
  }, [authed, load, busy]);

  async function post(url: string, body: unknown, id: string, apply: (d: Record<string, unknown>) => void) {
    if (busy) return;
    setBusy(id);
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      apply(d);
      setErr('');
    } catch (e) {
      setErr(`Could not change the switch: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }
  const flipMacOnly = () => {
    if (!macOnly) return;
    const next = !macOnly.on;
    if (!window.confirm(next
      ? 'Mac plan only: nothing goes to the API until you switch it back. Papers wait for a plan slot. Turn it on?'
      : 'Back to the normal split: the plan slots get a head start, the API takes the rest. Turn Mac-only off?')) return;
    post('/api/admin/marking-settings', { macOnly: next }, 'macOnly', d => { const v = d.macOnly as Flag | undefined; if (v) setMacOnly({ on: !!v.on, at: v.at ?? null }); });
  };
  // 🌙 Gemini Batch (3 Oct 2026): half price, up to an hour a paper; no confirm —
  // either way every paper still gets marked, only the price and the wait change.
  const flipVisionBatch = () => {
    if (!visionBatch) return;
    post('/api/admin/marking-settings', { visionBatch: !visionBatch.on }, 'visionBatch', d => { const v = d.visionBatch as Flag | undefined; if (v) setVisionBatch({ on: !!v.on, at: v.at ?? null }); });
  };
  const flipAccount = (a: SlotAccountRow) =>
    post('/api/admin/slot-accounts', { email: a.email, on: !a.on }, `acct:${a.email}`, d => { if (Array.isArray(d.accounts)) setAccounts(d.accounts as SlotAccountRow[]); });
  const flipJob = (j: WorkerJobRow) => {
    if (j.on && !window.confirm(`Switch ${j.label} off? No new run starts; one already running finishes.`)) return;
    post('/api/admin/worker-jobs', { job: j.key, on: !j.on }, `job:${j.key}`, d => { if (Array.isArray(d.jobs)) setJobs(d.jobs as WorkerJobRow[]); });
  };

  if (!authed) {
    return (
      <main className="min-h-screen bg-neutral-100 flex items-center justify-center p-6">
        <form className="bg-white rounded-xl shadow p-6 w-full max-w-xs space-y-3"
          onSubmit={async (e) => { e.preventDefault(); if (await loginAdminSession(pw)) setAuthed(true); }}>
          <div className="font-semibold text-neutral-800">🎚 Switches</div>
          <input type="password" value={pw} onChange={e => setPw(e.target.value)} placeholder="Admin password"
            className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm" />
          <button className="w-full bg-neutral-900 text-white rounded-lg py-2 text-sm">Enter</button>
        </form>
      </main>
    );
  }

  const offCount = (jobs ?? []).filter(j => !j.on).length + (accounts ?? []).filter(a => !a.on).length;

  return (
    <main className="min-h-screen bg-neutral-100 p-4 sm:p-6">
      <div className="max-w-2xl mx-auto space-y-4">
        <header className="flex items-center gap-3">
          <a href="/admin" className="text-neutral-400 hover:text-neutral-600 text-sm">← Hub</a>
          <h1 className="text-lg font-semibold text-neutral-800">🎚 Switches</h1>
          <a href="/admin/ops" className="ml-auto text-xs text-neutral-500 hover:text-neutral-800">🩺 ops →</a>
        </header>
        <p className="text-sm text-neutral-600">
          A switch stops new work only. Whatever is running finishes.
          {offCount > 0 && <span className="font-semibold text-amber-700"> {offCount} switched off.</span>}
        </p>
        {err && <div className="rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm px-3 py-2">{err}</div>}

        {/* ── Marking ── */}
        <section className="bg-white rounded-xl shadow-sm p-4" data-section="marking">
          <h2 className="text-xs font-bold uppercase tracking-wide text-neutral-500 mb-2">Marking</h2>
          {macOnly ? (
            <div className="flex items-center gap-3" data-mac-only={macOnly.on ? 'on' : 'off'}>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm text-neutral-900">🖥 Mac plan only{macOnly.on ? ' — ON' : ''}</div>
                <div className="text-xs text-neutral-500 mt-0.5">
                  {macOnly.on ? 'Nothing goes to the API. Every paper waits for a plan slot.' : 'Off: plan slots first, the API takes what they do not pick up.'}
                  {macOnly.at ? ` · since ${sgt(macOnly.at)}` : ''}
                </div>
              </div>
              <Toggle on={macOnly.on} busy={busy === 'macOnly'} label="Mac plan only" onClick={flipMacOnly} tone="#0e7490" />
            </div>
          ) : <div className="text-sm text-neutral-400">Loading…</div>}
          {visionBatch && (
            <div className="flex items-center gap-3 mt-3 pt-3 border-t border-neutral-100" data-vision-batch={visionBatch.on ? 'on' : 'off'}>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm text-neutral-900">🌙 Gemini Batch for queued papers{visionBatch.on ? ' — ON' : ''}</div>
                <div className="text-xs text-neutral-500 mt-0.5">
                  {visionBatch.on
                    ? 'Half price for the first vision round. A paper may wait up to an hour; papers behind it wait too. Mark now still goes live.'
                    : 'Off: every vision call is live — full price, no waiting.'}
                  {visionBatch.at ? ` · since ${sgt(visionBatch.at)}` : ''}
                </div>
              </div>
              <Toggle on={visionBatch.on} busy={busy === 'visionBatch'} label="Gemini Batch for queued papers" onClick={flipVisionBatch} tone="#4338ca" />
            </div>
          )}
          <p className="text-xs text-neutral-400 mt-3">Marking itself has no off switch here on purpose. Auto-release and the Science tab are settled and stay on.</p>
        </section>

        {/* ── Accounts ── */}
        <section className="bg-white rounded-xl shadow-sm p-4" data-section="accounts">
          <h2 className="text-xs font-bold uppercase tracking-wide text-neutral-500">Plan accounts</h2>
          <p className="text-xs text-neutral-500 mt-0.5 mb-1">Every slot and lane picks the emptiest account before each job. Off = never picked.</p>
          {accounts ? accounts.map(a => {
            const u = a.usage;
            const stale = u ? Date.now() - Date.parse(u.at) > 6 * 3600_000 : false;
            return (
              <div key={a.email} className="flex items-center gap-3 py-2 border-t border-neutral-100" data-slot-account={a.key} data-on={a.on ? 'on' : 'off'}>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm text-neutral-900 break-all">{a.email}{a.on ? '' : ' — OFF'}</div>
                  {a.at && <div className="text-xs text-neutral-500">{a.on ? 'on' : 'off'} since {sgt(a.at)}</div>}
                  {u ? (
                    <div className="text-xs mt-1 flex gap-x-4 gap-y-1 flex-wrap" style={{ color: stale ? '#9ca3af' : '#374151' }}>
                      <Meter v={u.five_hour} label="5 h" resets={u.resets_5h} />
                      <Meter v={u.seven_day} label="week" resets={u.resets_7d} />
                      <span className="text-neutral-400">read {sgt(u.at)}{stale ? ' (old)' : ''}</span>
                    </div>
                  ) : <div className="text-xs text-neutral-400 mt-1">no usage reading yet</div>}
                </div>
                <Toggle on={a.on} busy={busy === `acct:${a.email}`} label={`Account ${a.email}`} onClick={() => flipAccount(a)} />
              </div>
            );
          }) : <div className="text-sm text-neutral-400">Loading…</div>}
        </section>

        {/* ── Worker jobs ── */}
        <section className="bg-white rounded-xl shadow-sm p-4" data-section="jobs">
          <h2 className="text-xs font-bold uppercase tracking-wide text-neutral-500">Worker jobs</h2>
          <p className="text-xs text-neutral-500 mt-0.5">The cloud worker reads these every two minutes. A daily job switched back on runs its latest missed slot once.</p>
          {jobs ? WORKER_JOB_GROUPS.map(g => {
            const rows = jobs.filter(j => j.group === g.key);
            if (!rows.length) return null;
            return (
              <div key={g.key} className="mt-3">
                <div className="text-xs font-semibold text-neutral-700">{g.title} <span className="font-normal text-neutral-400">· {g.hint}</span></div>
                {rows.map(j => (
                  <div key={j.key} className="flex items-center gap-3 py-2 border-t border-neutral-100 mt-1" data-worker-job={j.key} data-on={j.on ? 'on' : 'off'}>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm text-neutral-900">{j.label}{j.on ? '' : ' — OFF'}</div>
                      <div className="text-xs text-neutral-500">{j.what}</div>
                      <div className="text-xs text-neutral-400">{j.when}{j.at ? ` · ${j.on ? 'on' : 'off'} since ${sgt(j.at)}` : ''}</div>
                    </div>
                    <Toggle on={j.on} busy={busy === `job:${j.key}`} label={j.label} onClick={() => flipJob(j)} tone="#047857" />
                  </div>
                ))}
              </div>
            );
          }) : <div className="text-sm text-neutral-400 mt-2">Loading…</div>}
        </section>
      </div>
    </main>
  );
}
