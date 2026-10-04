'use client';

// /admin/stuck — 🧭 where students are stuck, the week's picture on one page
// (5 Oct 2026, Adrian: "yes to all 3"). The same report the Sunday-evening
// Telegram message is written from (/api/cron/stuck-weekly → stuck_reports):
// per class, what students asked the bot about and where they lost marks; the
// gaps (both); who is stuck by name; and the sheets prepared for the top gaps
// with a Send button each. Nothing reaches a student until a Send here, a ✅
// under the Telegram message, or his typed "send <slug>" (/api/admin/stuck).

import { useCallback, useEffect, useState } from 'react';
import { ensureAdminSession, loginAdminSession } from '@/lib/admin-client';
import type { GroupPicture, StuckPicture } from '@/lib/stuck-picture';
import type { StoredMaterial } from '@/lib/stuck-send';
import { areaLine } from '@/lib/stuck-picture';

type Report = {
  id: string; created_at: string; week_from: string; week_to: string; dry: boolean;
  picture: StuckPicture & { notes?: string[]; names?: Record<string, string> };
  materials: StoredMaterial[]; message: string | null; telegram_sent: boolean;
};

const day = (iso: string) => new Date(iso).toLocaleDateString('en-SG', { timeZone: 'Asia/Singapore', day: 'numeric', month: 'short' });

function Group({ g }: { g: GroupPicture }) {
  const areas = g.areas.filter(a => a.gap || a.askStudents.length + a.lossStudents.length >= 2).slice(0, 5);
  const rest = g.areas.length - areas.length;
  return (
    <section className="bg-white rounded-xl shadow-sm p-4 space-y-2">
      <h2 className="font-semibold text-neutral-800">{g.label} <span className="text-xs font-normal text-neutral-400">{g.roster.length} active</span></h2>
      {areas.length === 0 && <p className="text-sm text-neutral-500">Only single questions this week.</p>}
      {areas.map(a => (
        <div key={a.area} className="text-sm leading-snug">
          <div className="font-medium text-neutral-800">
            {a.gap && <span className="mr-1 rounded bg-rose-100 px-1.5 py-0.5 text-[11px] font-semibold text-rose-700">gap</span>}
            {a.rising && <span className="mr-1 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700">{a.isNew ? 'new' : 'rising'}</span>}
            {a.area}
          </div>
          <div className="text-neutral-600">{areaLine(a)}</div>
          {a.skills.length > 0 && <div className="text-xs text-neutral-400">Asked: {a.skills.slice(0, 3).map(s => `${s.name} (${s.n})`).join(' · ')}</div>}
        </div>
      ))}
      {rest > 0 && <p className="text-xs text-neutral-400">+ {rest} topic{rest === 1 ? '' : 's'} with one question each.</p>}
    </section>
  );
}

export default function StuckPage() {
  const [authed, setAuthed] = useState(false);
  const [pw, setPw] = useState('');
  const [reports, setReports] = useState<Report[] | null>(null);
  const [pick, setPick] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    const r = await fetch('/api/admin/stuck?limit=6');
    const d = await r.json().catch(() => ({}));
    if (r.ok) setReports(d.reports ?? []); else setMsg(d.error || `HTTP ${r.status}`);
  }, []);
  useEffect(() => { ensureAdminSession().then(ok => { if (ok) setAuthed(true); }); }, []);
  useEffect(() => { if (authed) load(); }, [authed, load]);

  async function send(report: Report, index: number, target: 'stuck' | 'all') {
    const m = report.materials[index];
    const n = target === 'all' ? new Set([...m.groupStudents, ...m.stuckStudents]).size : m.stuckStudents.length;
    if (!window.confirm(`Send "${m.title ?? m.area}" to ${target === 'all' ? `all ${n} in ${m.groupLabel}` : `the ${n} stuck on it`}? Each gets it under From Adrian, with a Telegram nudge if linked.`)) return;
    setBusy(`${index}:${target}`); setMsg('');
    try {
      const r = await fetch('/api/admin/stuck', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reportId: report.id, index, target }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok && !d.sent?.length) throw new Error(d.error || `HTTP ${r.status}`);
      const parts = [d.sent?.length ? `Sent to ${d.sent.join(', ')}.` : 'Nobody new to send to.'];
      if (d.already?.length) parts.push(`Already had it: ${d.already.join(', ')}.`);
      if (d.failed?.length) parts.push(`Failed: ${d.failed.map((f: { name: string; error: string }) => `${f.name} (${f.error})`).join(', ')}.`);
      setMsg(parts.join(' '));
      await load();
    } catch (e) { setMsg(`Could not send: ${(e as Error).message}`); }
    finally { setBusy(null); }
  }

  if (!authed) {
    return (
      <main className="min-h-screen bg-neutral-100 flex items-center justify-center p-6">
        <form className="bg-white rounded-xl shadow p-6 w-full max-w-xs space-y-3"
          onSubmit={async (e) => { e.preventDefault(); if (await loginAdminSession(pw)) setAuthed(true); }}>
          <div className="font-semibold text-neutral-800">🧭 Where students are stuck</div>
          <input type="password" value={pw} onChange={e => setPw(e.target.value)} placeholder="Admin password"
            className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm" />
          <button className="w-full bg-neutral-900 text-white rounded-lg py-2 text-sm">Enter</button>
        </form>
      </main>
    );
  }

  const r = reports?.[pick];
  const names = r?.picture.names ?? {};
  const nameOf = (id: string) => names[id] ?? id;

  return (
    <main className="min-h-screen bg-neutral-100 p-4 sm:p-6">
      <div className="max-w-2xl mx-auto space-y-4">
        <header className="flex items-center gap-3">
          <a href="/admin" className="text-neutral-400 hover:text-neutral-600 text-sm">← Hub</a>
          <h1 className="text-lg font-semibold text-neutral-800">🧭 Where students are stuck</h1>
        </header>
        <p className="text-sm text-neutral-600">
          What students asked the bot, and where they lost marks in papers. A <b>gap</b> is a topic with both.
          Every Sunday evening; nothing is sent to a student until you press Send.
        </p>
        {reports && reports.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {reports.map((x, i) => (
              <button key={x.id} onClick={() => setPick(i)}
                className={`rounded-full px-3 py-1 text-xs ${i === pick ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-600'}`}>
                {day(x.week_from)}–{day(x.week_to)}{x.dry ? ' · test' : ''}
              </button>
            ))}
          </div>
        )}
        {msg && <div className="rounded-lg bg-indigo-50 p-3 text-sm text-indigo-900">{msg}</div>}
        {!reports && <p className="text-sm text-neutral-500">Loading…</p>}
        {reports && !r && <p className="text-sm text-neutral-500">No report yet. The first one comes on Sunday evening.</p>}
        {r && (
          <>
            <p className="text-xs text-neutral-500">
              {day(r.week_from)} to {day(r.week_to)}: {r.picture.totals.asks} questions to the bot, {r.picture.totals.losses} questions with lost marks, from {r.picture.totals.students} students.
              {r.picture.totals.lossesUnmapped > 0 && ` ${r.picture.totals.lossesUnmapped} lost questions had a topic the page could not file.`}
              {r.dry && ' (A test run: no message was sent.)'}
            </p>

            {r.materials.length > 0 && (
              <section className="bg-white rounded-xl shadow-sm p-4 space-y-3">
                <h2 className="font-semibold text-neutral-800">Ready for you</h2>
                {r.materials.map((m, i) => {
                  const sentTo = (m.sent ?? []).flatMap(s => s.studentIds);
                  return (
                    <div key={m.slug} className="border-t border-neutral-100 pt-3 first:border-0 first:pt-0 text-sm space-y-1.5">
                      <div className="font-medium text-neutral-800">{m.title ?? m.area}</div>
                      {m.ok ? (
                        <>
                          <div className="text-neutral-600">{m.count} questions from the bank, for {m.groupLabel}. <a href={m.pdfUrl} target="_blank" rel="noreferrer" className="text-indigo-600 underline">Look at the sheet</a></div>
                          <div className="text-xs text-neutral-500">Stuck on it: {m.stuckStudents.map(nameOf).join(', ')}</div>
                          {sentTo.length > 0 && <div className="text-xs text-emerald-700">Sent to {sentTo.map(nameOf).join(', ')}.</div>}
                          <div className="flex flex-wrap gap-2 pt-1">
                            <button disabled={!!busy} onClick={() => send(r, i, 'stuck')}
                              className="rounded-lg bg-neutral-900 px-3 py-2 text-white disabled:opacity-50">
                              {busy === `${i}:stuck` ? 'Sending…' : `Send to the ${m.stuckStudents.length} stuck`}
                            </button>
                            <button disabled={!!busy} onClick={() => send(r, i, 'all')}
                              className="rounded-lg bg-white px-3 py-2 text-neutral-800 ring-1 ring-neutral-300 disabled:opacity-50">
                              {busy === `${i}:all` ? 'Sending…' : `Send to all ${m.groupStudents.length} in ${m.groupLabel}`}
                            </button>
                          </div>
                          <div className="text-xs text-neutral-400">In Telegram: send {m.slug} · send {m.slug} to all</div>
                        </>
                      ) : (
                        <div className="text-rose-700">Could not prepare: {m.error}</div>
                      )}
                    </div>
                  );
                })}
              </section>
            )}

            {r.picture.students.length > 0 && (
              <section className="bg-white rounded-xl shadow-sm p-4 space-y-1.5">
                <h2 className="font-semibold text-neutral-800">Stuck, by name</h2>
                {r.picture.students.slice(0, 12).map((s, i) => (
                  <div key={i} className="text-sm text-neutral-700">
                    <span className="font-medium">{s.names.join(', ')}</span> <span className="text-neutral-400">({s.groupLabel})</span>: {s.area}, asked {s.asks}×{s.losses ? `, lost marks ${s.losses}×` : ''}
                  </div>
                ))}
              </section>
            )}

            {r.picture.groups.map(g => <Group key={g.key} g={g} />)}

            {(r.picture.notes ?? []).length > 0 && <p className="text-xs text-neutral-400">Notes: {r.picture.notes!.join(' · ')}</p>}
          </>
        )}
      </div>
    </main>
  );
}
