'use client';

// /admin — the dashboard (5 Oct 2026, Adrian: "why not have a dashboard?").
//
// Third shape, 6 Oct 2026. The first was a grid of number tiles; the second put lists
// inside the tiles; both read to him as "just a lot of buttons". His words now: "i want
// something visual, not wordy" — and a list of what he does NOT need on it (papers to
// check, lessons today / to log, practice, students stuck, tabs opened, science topics).
// So the page is three rows and almost no sentences:
//   1. TOOLS — the pages he opens most, big, one tap. The row learns from what he opens
//      (lib/admin-tools.ts + components/AdminVisitCounter.tsx): "learn from my taps".
//   2. LIGHTS — is each part of the machine fine? A green or amber disc, two rings.
//   3. CHARTS — only what changes day to day: extraction, our own questions, papers
//      marked, marking cost. Seven bars each, today darkest.
// A thin line of chips under the lights carries anything waiting on him ("Needs you").
// One read (GET /api/admin/glance, 60 s cache), refreshed every minute while visible.
// Every other page is in "All tools"; the old launcher grid is /admin/classic.

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ensureAdminSession, loginAdminSession } from '@/lib/admin-client';
import PasswordInput from '@/components/PasswordInput';
import { overallTone, type Glance, type Tile, type Tone } from '@/lib/glance';
import { ADMIN_TOOLS, TAPS_KEY, TAPS_MERGED_KEY, parseTaps, topTools, type AdminTool } from '@/lib/admin-tools';
import { countAdminOpen } from '@/components/AdminVisitCounter';

const REFRESH_MS = 60_000;
const TONE_COLOUR: Record<Tone, string> = { green: '#2f9e44', amber: '#e79e00', red: '#d03b3b', grey: '#9ca3af' };
const OVERALL_WORD: Record<Tone, string> = { green: 'All fine', amber: 'Some things to look at', red: 'Something needs you now', grey: 'No reading yet' };

/** The lights, in order: the glance tile each reads, its two-word name, and whether it is a ring. */
const LIGHTS: { id: string; name: string; ring?: boolean }[] = [
  { id: 'queue', name: 'Marking' }, { id: 'jobs', name: 'Jobs' }, { id: 'deploys', name: 'Bot + site' }, { id: 'backups', name: 'Backups' },
  { id: 'disk', name: 'Disk', ring: true }, { id: 'logins', name: 'Plan used', ring: true },
];
/** The charts: the tile, the title, the unit beside the big number, and the bar colours (past days · today). */
const CHARTS: { id: string; title: string; unit: string; light: string; dark: string; todayBar?: boolean }[] = [
  // the extraction tile's own number is what is LEFT in the queue; the chart is about what got done
  { id: 'extraction', title: 'Papers extracted', unit: 'done today', light: '#a5c8f0', dark: '#1c64b0', todayBar: true },
  { id: 'twins', title: 'Our own questions written', unit: 'today', light: '#c4bff2', dark: '#5b50c4' },
  { id: 'marked', title: 'Papers marked', unit: 'today', light: '#a7e3cf', dark: '#11795e' },
  { id: 'cost', title: 'Marking cost', unit: 'a paper', light: '#f8d08c', dark: '#96590c' },
];
/** Not on this page (his list, 6 Oct 2026) — the read still carries them for whoever wants them. */
const NEEDS_HIDDEN = new Set(['papers-to-check']);

export default function AdminDashboard() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [data, setData] = useState<Glance | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [row, setRow] = useState<AdminTool[]>(() => topTools({}));
  const [, tick] = useState(0);
  const busy = useRef(false);

  useEffect(() => { ensureAdminSession().then(ok => setAuthed(ok)); }, []);
  // The row: this browser's copy at once, then the SHARED tally (8 Oct 2026 — the phone and
  // the computer each learnt their own and showed different tiles). A device's old private
  // tally is added to the shared one once.
  useEffect(() => {
    const read = () => { try { setRow(topTools(parseTaps(localStorage.getItem(TAPS_KEY)))); } catch { /* defaults stand */ } };
    const sync = async () => {
      try {
        let mine: Record<string, number> = {}; let merged = true;
        try { mine = parseTaps(localStorage.getItem(TAPS_KEY)); merged = localStorage.getItem(TAPS_MERGED_KEY) === '1'; } catch { /* no store */ }
        const r = !merged && Object.keys(mine).length
          ? await fetch('/api/admin/dash-taps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ merge: mine }) })
          : await fetch('/api/admin/dash-taps');
        if (!r.ok) return;
        const d = (await r.json()) as { counts?: Record<string, number> };
        if (!d.counts) return;
        try { localStorage.setItem(TAPS_KEY, JSON.stringify(d.counts)); localStorage.setItem(TAPS_MERGED_KEY, '1'); } catch { /* fine */ }
        setRow(topTools(parseTaps(JSON.stringify(d.counts))));
      } catch { /* this device's copy stands */ }
    };
    const both = () => { read(); void sync(); };
    both();
    window.addEventListener('pageshow', both);
    return () => window.removeEventListener('pageshow', both);
  }, []);

  const load = useCallback(async (fresh = false) => {
    if (busy.current) return;
    busy.current = true; setLoading(true);
    try {
      const r = await fetch(`/api/admin/glance${fresh ? '?fresh=1' : ''}`, { cache: 'no-store' });
      if (r.status === 401) { setAuthed(false); return; }
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`);
      setData(d); setError('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      busy.current = false; setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authed) return;
    load();
    const id = setInterval(() => { if (document.visibilityState === 'visible') load(); tick(n => n + 1); }, REFRESH_MS);
    const onVis = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis); };
  }, [authed, load]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    const ok = await loginAdminSession(password);
    if (ok) setAuthed(true); else setAuthError('Incorrect password');
  }

  if (authed === false) {
    return (
      <div className="gl-login">
        <style>{CSS}</style>
        <form className="gl-login-card" onSubmit={handleLogin}>
          <h1>Admin</h1>
          <PasswordInput className="gl-pw" placeholder="Admin password" value={password} onChange={v => { setPassword(v); setAuthError(''); }} autoFocus />
          {authError && <div className="gl-pw-err">{authError}</div>}
          <button type="submit" className="gl-pw-btn" disabled={!password}>Enter</button>
        </form>
      </div>
    );
  }

  const tiles = new Map((data?.sections ?? []).flatMap(s => s.tiles).map(t => [t.id, t]));
  const needs = (data?.sections.find(s => s.id === 'needs')?.tiles ?? []).filter(t => !NEEDS_HIDDEN.has(t.id));
  // the header's word follows what this page shows, not the tiles it leaves out
  const shown: Tile[] = [...LIGHTS.map(l => tiles.get(l.id)), ...CHARTS.map(c => tiles.get(c.id)), ...needs].filter((t): t is Tile => !!t);
  const tone = data ? overallTone({ ...data, sections: [{ id: 'machine', title: '', tiles: shown }] }) : 'grey';
  const ago = data ? Math.max(0, Math.round((Date.now() - Date.parse(data.generatedAt)) / 1000)) : null;
  // a tool outside /admin is not seen by the layout's counter — count the tap here
  const tap = (href: string) => { if (!href.startsWith('/admin')) countAdminOpen(href); };

  return (
    <div className="gl-wrap">
      <style>{CSS}</style>
      <header className="gl-head">
        <div className="gl-head-in">
          <div className="gl-head-left">
            <span className="gl-title">Admin</span>
            <span className="gl-overall"><i style={{ background: TONE_COLOUR[tone] }} />{OVERALL_WORD[tone]}</span>
          </div>
          <div className="gl-head-right">
            <button className="gl-btn" onClick={() => load(true)} disabled={loading} aria-label="Refresh now">{loading ? '…' : '↻'}</button>
            <button className={`gl-btn gl-tools-btn${toolsOpen ? ' on' : ''}`} onClick={() => setToolsOpen(o => !o)} aria-expanded={toolsOpen}>All tools ▾</button>
          </div>
        </div>
        {toolsOpen && (
          <nav className="gl-tools" aria-label="All tools">
            {ADMIN_TOOLS.map(g => (
              <div key={g.group} className="gl-tools-group">
                <div className="gl-tools-h">{g.group}</div>
                {g.links.map(l => <Link key={l.href} href={l.href} className="gl-tools-a" onClick={() => tap(l.href)}><span aria-hidden>{l.emoji}</span> {l.label}</Link>)}
              </div>
            ))}
          </nav>
        )}
      </header>

      <main className="gl-body">
        <nav className="gl-row-tools" aria-label="Most used tools">
          {row.map(t => (
            <Link key={t.href} href={t.href} className="gl-tool" onClick={() => tap(t.href)}>
              <span className="gl-tool-e" aria-hidden>{t.emoji}</span>
              <span className="gl-tool-l">{t.label}</span>
            </Link>
          ))}
        </nav>

        {error && <div className="gl-error">Could not refresh: {error}</div>}
        {!data && !error && <div className="gl-wait">Reading the machine…</div>}

        {data && (
          <>
            <section className="gl-lights" aria-label="Is everything running">
              {LIGHTS.map(l => <Light key={l.id} name={l.name} ring={l.ring} t={tiles.get(l.id)} />)}
            </section>

            {needs.length > 0 && (
              <section className="gl-chips" aria-label="Needs you">
                {needs.map(t => {
                  const body = <><b style={{ color: TONE_COLOUR[t.tone] }}>{t.value}</b> {t.label.toLowerCase()}</>;
                  return t.href ? <Link key={t.id} href={t.href} className="gl-chip">{body}</Link> : <span key={t.id} className="gl-chip">{body}</span>;
                })}
              </section>
            )}

            <section className="gl-charts">
              {CHARTS.map(c => <Chart key={c.id} c={c} t={tiles.get(c.id)} today={new Date(Date.parse(data.generatedAt) + 8 * 3600_000).getUTCDay()} />)}
            </section>

            <div className="gl-foot">
              Updated {ago != null && ago < 90 ? `${ago} s` : `${Math.round((ago ?? 0) / 60)} min`} ago · the tools row follows what you open most
            </div>
          </>
        )}
      </main>
    </div>
  );
}

/** A disc: a tick when fine, the count or "!" when not. A ring for a percentage. */
function Light({ name, ring, t }: { name: string; ring?: boolean; t?: Tile }) {
  const tone: Tone = t?.tone ?? 'grey';
  const colour = TONE_COLOUR[tone];
  const pct = ring && t ? Number.parseFloat(t.value) : NaN;
  const C = 2 * Math.PI * 23;
  const inner = ring && Number.isFinite(pct) ? (
    <svg width="64" height="64" viewBox="0 0 64 64" role="img" aria-label={`${name} ${Math.round(pct)} %`}>
      <circle cx="32" cy="32" r="23" fill="none" stroke="#e5e7eb" strokeWidth="8" />
      <circle cx="32" cy="32" r="23" fill="none" stroke={colour} strokeWidth="8" strokeLinecap="round"
        strokeDasharray={`${(Math.min(100, Math.max(0, pct)) / 100) * C} ${C}`} transform="rotate(-90 32 32)" />
      <text x="32" y="37" textAnchor="middle" fontSize="15" fontWeight="700" fill="#111827">{Math.round(pct)}%</text>
    </svg>
  ) : (
    <span className="gl-disc" style={{ background: colour }} role="img" aria-label={`${name}: ${t?.status ?? 'no reading'}`}>
      {tone === 'green' ? '✓' : tone === 'grey' ? '–' : /^\d+$/.test(t?.value ?? '') && t?.value !== '0' ? t?.value : '!'}
    </span>
  );
  const body = <>{inner}<span className="gl-light-n">{name}</span><span className="gl-light-s">{t?.status ?? 'No reading'}</span></>;
  return t?.href ? <Link href={t.href} className="gl-light">{body}</Link> : <div className="gl-light">{body}</div>;
}

const DAY_LETTER = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
/** Seven bars, oldest first, today darkest, a weekday letter under each (Singapore days). */
function Chart({ c, t, today }: { c: { title: string; unit: string; light: string; dark: string; todayBar?: boolean }; t?: Tile; today: number }) {
  const values = t?.trend ?? [];
  const max = Math.max(...values, 0);
  const body = (
    <>
      <div className="gl-chart-t">{c.title}</div>
      <div className="gl-chart-v">{c.todayBar && values.length ? values[values.length - 1] : t?.value ?? '—'} <span>{c.unit}</span></div>
      <div className="gl-bars" role="img" aria-label={`last ${values.length} days: ${values.join(', ')}`}>
        {values.map((v, i) => (
          <div key={i} className="gl-bar-col" title={String(v)}>
            <div className="gl-bar-box"><div className="gl-bar" style={{ height: `${max > 0 ? Math.max(v > 0 ? 4 : 1.5, (v / max) * 100) : 1.5}%`, background: i === values.length - 1 ? c.dark : c.light }} /></div>
            <span>{DAY_LETTER[(today - (values.length - 1 - i) + 70) % 7]}</span>
          </div>
        ))}
      </div>
    </>
  );
  return t?.href ? <Link href={t.href} className="gl-chart">{body}</Link> : <div className="gl-chart">{body}</div>;
}

const CSS = `
.gl-wrap { min-height: 100vh; background: #f3f4f6; color: #111827; padding-bottom: 32px; }
.gl-head { position: sticky; top: 0; z-index: 10; background: #fff; border-bottom: 1px solid #e5e7eb; }
.gl-head-in { max-width: 1120px; margin: 0 auto; padding: 12px 16px; display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.gl-head-left { display: flex; align-items: baseline; gap: 12px; min-width: 0; flex-wrap: wrap; }
.gl-title { font-size: 18px; font-weight: 700; }
.gl-overall { font-size: 13px; color: #374151; display: inline-flex; align-items: center; gap: 6px; }
.gl-overall i { display: inline-block; width: 9px; height: 9px; border-radius: 50%; flex: none; }
.gl-head-right { display: flex; gap: 8px; flex: none; }
.gl-btn { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 6px 12px; font-size: 14px; color: #374151; cursor: pointer; }
.gl-btn:disabled { opacity: .5; }
.gl-tools-btn.on { background: #111827; color: #fff; border-color: #111827; }
.gl-tools { max-width: 1120px; margin: 0 auto; padding: 4px 16px 16px; display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px 20px; max-height: 70vh; overflow-y: auto; }
@media (min-width: 760px) { .gl-tools { grid-template-columns: repeat(3, 1fr); } }
@media (min-width: 1000px) { .gl-tools { grid-template-columns: repeat(6, 1fr); } }
.gl-tools-h { font-size: 11px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: .05em; margin: 6px 0 4px; }
.gl-tools-a { display: block; font-size: 14px; color: #111827; text-decoration: none; padding: 5px 0; }
.gl-tools-a:hover { color: #1d4ed8; }
.gl-body { max-width: 1120px; margin: 0 auto; padding: 14px 16px 8px; }
.gl-error { background: #fef2f2; color: #b91c1c; border-radius: 10px; padding: 10px 12px; font-size: 13px; margin: 8px 0; }
.gl-wait { color: #6b7280; font-size: 14px; padding: 40px 0; text-align: center; }
.gl-row-tools { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
@media (min-width: 760px) { .gl-row-tools { grid-template-columns: repeat(9, minmax(0, 1fr)); } }
.gl-tool { display: flex; flex-direction: column; align-items: center; gap: 6px; background: #fff; border: 1px solid #e5e7eb; border-radius: 16px; padding: 14px 4px 12px; text-decoration: none; color: #111827; min-width: 0; }
.gl-tool:hover { background: #f9fafb; border-color: #d1d5db; }
.gl-tool-e { font-size: 30px; line-height: 1; }
.gl-tool-l { font-size: 12.5px; font-weight: 600; text-align: center; line-height: 1.2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
.gl-lights { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px 8px; background: #fff; border: 1px solid #e5e7eb; border-radius: 16px; padding: 18px 8px 14px; margin-top: 14px; }
@media (min-width: 760px) { .gl-lights { grid-template-columns: repeat(6, minmax(0, 1fr)); } }
.gl-light { display: flex; flex-direction: column; align-items: center; gap: 3px; text-decoration: none; color: inherit; min-width: 0; }
.gl-disc { width: 56px; height: 56px; margin: 4px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 26px; font-weight: 800; }
.gl-light-n { font-size: 13px; font-weight: 700; margin-top: 2px; }
.gl-light-s { font-size: 11.5px; color: #6b7280; text-align: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
.gl-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.gl-chip { background: #fff; border: 1px solid #e5e7eb; border-radius: 999px; padding: 6px 12px; font-size: 12.5px; color: #374151; text-decoration: none; }
.gl-chip b { font-size: 14px; font-weight: 800; }
.gl-charts { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; margin-top: 14px; }
@media (min-width: 760px) { .gl-charts { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.gl-chart { display: block; background: #fff; border: 1px solid #e5e7eb; border-radius: 16px; padding: 14px 16px 10px; text-decoration: none; color: inherit; min-width: 0; }
.gl-chart-t { font-size: 12.5px; color: #6b7280; font-weight: 600; }
.gl-chart-v { font-size: 30px; font-weight: 800; letter-spacing: -.5px; line-height: 1.15; font-variant-numeric: tabular-nums; }
.gl-chart-v span { font-size: 12.5px; font-weight: 500; color: #6b7280; letter-spacing: 0; }
.gl-bars { display: flex; align-items: stretch; gap: 8px; height: 132px; margin-top: 8px; }
.gl-bar-col { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.gl-bar-box { flex: 1; display: flex; align-items: flex-end; min-height: 0; }
.gl-bar { width: 100%; border-radius: 6px 6px 0 0; }
.gl-bar-col span { font-size: 11px; color: #9ca3af; text-align: center; padding-top: 4px; flex: none; }
.gl-foot { margin-top: 18px; font-size: 12px; color: #9ca3af; text-align: center; }
.gl-login { min-height: 100vh; background: #f3f4f6; display: flex; align-items: center; justify-content: center; padding: 16px; }
.gl-login-card { width: 100%; max-width: 340px; background: #fff; border: 1px solid #e5e7eb; border-radius: 16px; padding: 28px 24px; text-align: center; }
.gl-login-card h1 { font-size: 20px; margin: 0 0 16px; }
.gl-pw { width: 100%; border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px 14px; font-size: 15px; box-sizing: border-box; margin-bottom: 10px; color: #111; }
.gl-pw-err { font-size: 13px; color: #ef4444; margin-bottom: 10px; }
.gl-pw-btn { width: 100%; background: #1e3a5f; color: #fff; border: none; border-radius: 10px; padding: 12px 0; font-size: 15px; font-weight: 600; cursor: pointer; }
.gl-pw-btn:disabled { opacity: .45; }
`;
