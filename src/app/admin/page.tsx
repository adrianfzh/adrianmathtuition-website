'use client';

// /admin — the dashboard "at a glance" (5 Oct 2026, Adrian: "admin hub seems
// cluttered > why not have a dashboard?" … "make the dashboard 'at a glance' -
// like a monitoring dashboard"). One read (GET /api/admin/glance, counts only,
// cached 60 s server-side), refreshed every minute while the page is open.
// Tiles: a big number, a colour with its plain word, a tiny 7-day trend.
//
// 6 Oct 2026 (Adrian: "it's just tabs/buttons leading to pages. can i have a
// dash board with information on the dashboard itself?" + "common use buttons
// on the old admin hub … easily accessible on the dashboard"):
//  · a tile carries the things themselves (Tile.rows) — which papers, which
//    jobs failed and why, today's lessons, who is stuck — each row its own link;
//  · a Shortcuts row sits at the top: the pages he opens most, one tap. Which
//    ones is his choice (Edit → tap to pin / unpin), kept on the device like the
//    old hub's tile order — and seeded from that order the first time.
// Every other page sits in the Tools menu. The old launcher grid is /admin/classic.

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ensureAdminSession, loginAdminSession } from '@/lib/admin-client';
import PasswordInput from '@/components/PasswordInput';
import { overallTone, type Glance, type Row, type Tile, type Tone } from '@/lib/glance';

const REFRESH_MS = 60_000;

const TONE_COLOUR: Record<Tone, string> = { green: '#0ca30c', amber: '#e79e00', red: '#d03b3b', grey: '#9ca3af' };
const OVERALL_WORD: Record<Tone, string> = { green: 'All fine', amber: 'Some things to look at', red: 'Something needs you now', grey: 'No reading yet' };

type ToolLink = { label: string; href: string };
const TOOLS: { group: string; links: ToolLink[] }[] = [
  { group: 'Teaching', links: [
    { label: 'Schedule', href: '/admin/schedule' }, { label: 'Log lessons', href: '/admin/log' },
    { label: 'Students', href: '/admin/students' }, { label: 'Exams', href: '/admin/exams' }, { label: 'Follow-ups', href: '/admin/followups' },
    { label: 'Parent digests', href: '/admin/digests' }, { label: 'Waitlist', href: '/admin/waitlist' }, { label: 'Suggestions', href: '/admin/suggestions' },
  ] },
  { group: 'Marking', links: [
    { label: 'Mark a paper', href: '/admin/mark-paper' }, { label: 'Marked papers', href: '/admin/papers' }, { label: 'Mark schemes', href: '/admin/schemes' },
    { label: 'Calibration', href: '/admin/calibration' }, { label: 'Stuck', href: '/admin/stuck' },
    { label: 'Generated', href: '/admin/generated' }, { label: 'Essays', href: '/admin/essays' },
  ] },
  { group: 'The machine', links: [
    { label: 'Ops logbook', href: '/admin/ops' }, { label: 'Switches', href: '/admin/switches' }, { label: 'Costs', href: '/admin/costs' },
    { label: 'Extraction rules', href: '/admin/extraction-rules' }, { label: 'Bot', href: '/admin/bot' },
  ] },
  { group: 'Bank + materials', links: [
    { label: 'Question bank', href: '/admin/questions' }, { label: 'Question proposals', href: '/admin/question-proposals' }, { label: 'Bank health', href: '/admin/bank-health' },
    { label: 'Bank figures', href: '/admin/figures-bank' }, { label: 'Figure review', href: '/admin/figures' }, { label: 'Trap review', href: '/admin/pitfalls' }, { label: 'Science pictures', href: '/admin/science-diagrams' },
    { label: 'Topic cards', href: '/admin/topic-cards' }, { label: 'Notes', href: '/admin/notes' }, { label: 'Prelim builder', href: '/admin/prelim-builder' },
    { label: 'Print a paper', href: '/app/print' }, { label: 'Worksheet builder', href: '/admin/worksheet-builder' }, { label: 'Teaching decks', href: '/admin/lessons' },
    { label: 'Curriculum', href: '/admin/curriculum' },
  ] },
  { group: 'Money', links: [
    { label: 'Invoices', href: '/admin/invoices' }, { label: 'Email log', href: '/admin/emails' },
  ] },
  { group: 'Other', links: [
    { label: 'My to-dos', href: '/admin/my-todos' }, { label: 'Loop tasks', href: '/admin/my-todos?tab=loop' }, { label: 'Kiosk (on Switches)', href: '/admin/switches#kiosk' },
    { label: 'Math tools', href: '/tools' }, { label: 'TI-84', href: '/calculator?real=1' }, { label: 'Casio fx-97SG X', href: '/calculator/casio' },
    { label: 'Revision decks', href: '/revise/am' }, { label: 'Kiosk (student view)', href: '/kiosk' },
    { label: 'Marketing calendar', href: '/admin/calendar-marketing-post' },
    { label: 'Old hub (tiles)', href: '/admin/classic' },
  ] },
];

// ── Shortcuts (per device, like the old hub's tile order) ───────────────────
const ALL_LINKS: ToolLink[] = TOOLS.flatMap(g => g.links);
const PINS_KEY = 'admin_dash_pins_v1';
const HUB_ORDER_KEY = 'admin_hub_order_v1'; // the old hub's drag order (admin/classic)
const DEFAULT_PINS = ['/admin/schedule', '/admin/log', '/admin/students', '/admin/mark-paper', '/admin/invoices', '/admin/questions', '/admin/notes', '/admin/my-todos'];
const SEED_PINS = 8;

function loadPins(): string[] {
  const known = new Set(ALL_LINKS.map(l => l.href));
  const clean = (v: unknown) => (Array.isArray(v) ? v.filter((h): h is string => typeof h === 'string' && known.has(h)) : []);
  try {
    const saved = localStorage.getItem(PINS_KEY);
    if (saved) return clean(JSON.parse(saved));
    // First time: the top of the order he dragged the old hub into.
    const hub = clean(JSON.parse(localStorage.getItem(HUB_ORDER_KEY) || '[]'));
    if (hub.length) return hub.slice(0, SEED_PINS);
  } catch { /* private mode / blocked storage → defaults */ }
  return DEFAULT_PINS;
}

export default function AdminDashboard() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [data, setData] = useState<Glance | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [pins, setPins] = useState<string[]>(DEFAULT_PINS);
  const [editPins, setEditPins] = useState(false);
  useEffect(() => { setPins(loadPins()); }, []);
  const togglePin = (href: string) => setPins(prev => {
    const next = prev.includes(href) ? prev.filter(h => h !== href) : [...prev, href];
    try { localStorage.setItem(PINS_KEY, JSON.stringify(next)); } catch { /* best-effort */ }
    return next;
  });
  const pinned = pins.map(h => ALL_LINKS.find(l => l.href === h)).filter((l): l is ToolLink => !!l);
  const [, tick] = useState(0);
  const busy = useRef(false);

  useEffect(() => { ensureAdminSession().then(ok => setAuthed(ok)); }, []);

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

  // Refresh every minute while the page is in view, and at once when it comes back.
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

  const tone = data ? overallTone(data) : 'grey';
  const ago = data ? Math.max(0, Math.round((Date.now() - Date.parse(data.generatedAt)) / 1000)) : null;

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
            <button className="gl-btn" onClick={() => load(true)} disabled={loading} aria-label="Refresh now">
              {loading ? '…' : '↻'}
            </button>
            <button className={`gl-btn gl-tools-btn${toolsOpen ? ' on' : ''}`} onClick={() => { setToolsOpen(o => !o); setEditPins(false); }} aria-expanded={toolsOpen}>
              All tools ▾
            </button>
          </div>
        </div>
        {toolsOpen && (
          <nav className="gl-tools" aria-label="Tools">
            {editPins && <div className="gl-tools-edit">Tap a page to pin it to Shortcuts, or to take it off. <button className="gl-pin-done" onClick={() => { setEditPins(false); setToolsOpen(false); }}>Done</button></div>}
            {TOOLS.map(g => (
              <div key={g.group} className="gl-tools-group">
                <div className="gl-tools-h">{g.group}</div>
                {g.links.map(l => editPins
                  ? <button key={l.href} className={`gl-tools-a gl-tools-pin${pins.includes(l.href) ? ' on' : ''}`} onClick={() => togglePin(l.href)} aria-pressed={pins.includes(l.href)}>
                      <span aria-hidden>{pins.includes(l.href) ? '★' : '☆'}</span> {l.label}
                    </button>
                  : <Link key={l.href} href={l.href} className="gl-tools-a">{l.label}</Link>)}
              </div>
            ))}
          </nav>
        )}
      </header>

      <main className="gl-body">
        <nav className="gl-pins" aria-label="Shortcuts">
          {pinned.map(l => <Link key={l.href} href={l.href} className="gl-pin">{l.label}</Link>)}
          <button className="gl-pin gl-pin-edit" onClick={() => { const on = !(editPins && toolsOpen); setEditPins(on); setToolsOpen(on); if (on) window.scrollTo({ top: 0 }); }}>
            {editPins && toolsOpen ? 'Done' : pinned.length ? 'Edit' : '＋ Add shortcuts'}
          </button>
        </nav>

        {error && <div className="gl-error">Could not refresh: {error}</div>}
        {!data && !error && <div className="gl-wait">Reading the machine…</div>}

        {data?.sections.map(s => (
          <section key={s.id} className={`gl-sec gl-sec-${s.id}`}>
            <h2 className="gl-h2">{s.title}</h2>
            <div className="gl-grid">
              {s.tiles.map(t => <TileCard key={t.id} t={t} />)}
            </div>
          </section>
        ))}

        {data && (
          <div className="gl-foot">
            Updated {ago != null && ago < 90 ? `${ago} s` : `${Math.round((ago ?? 0) / 60)} min`} ago · refreshes every minute · <Link href="/admin/classic">old hub</Link>
          </div>
        )}
      </main>
    </div>
  );
}

// A tile with rows is a panel: its head opens the page behind the number, and
// each row opens its own thing. (A link cannot sit inside a link, so the head
// is the link and the rows are its siblings.)
function TileCard({ t }: { t: Tile }) {
  const head = (
    <>
      <div className="gl-tile-label">{t.label}{t.href && <span className="gl-tile-go" aria-hidden> ›</span>}</div>
      <div className="gl-tile-mid">
        <span className="gl-tile-val">{t.value}</span>
        {t.trend && t.trend.length > 1 && <Spark values={t.trend} />}
      </div>
      {t.sub && !(t.rowsReplaceSub && t.rows?.length) && <div className="gl-tile-sub">{t.sub}</div>}
    </>
  );
  return (
    <div className={`gl-tile${t.wide ? ' gl-wide' : ''}`} style={{ borderTopColor: TONE_COLOUR[t.tone] }}>
      {t.href ? <Link href={t.href} className="gl-tile-head">{head}</Link> : <div className="gl-tile-head">{head}</div>}
      {t.rows && t.rows.length > 0 && (
        <div className="gl-rows">
          {t.rows.map((r, i) => <RowLine key={i} r={r} />)}
          {t.more && (t.href ? <Link href={t.href} className="gl-row gl-row-more">{t.more} ›</Link> : <div className="gl-row gl-row-more">{t.more}</div>)}
        </div>
      )}
      <div className="gl-tile-status"><i style={{ background: TONE_COLOUR[t.tone] }} />{t.status}</div>
    </div>
  );
}

function RowLine({ r }: { r: Row }) {
  const body = (
    <>
      {r.tone && <i style={{ background: TONE_COLOUR[r.tone] }} />}
      <span className="gl-row-main">{r.main}</span>
      {r.note && <span className="gl-row-note">{r.note}</span>}
      {r.href && <span className="gl-row-go" aria-hidden>›</span>}
    </>
  );
  return r.href ? <Link href={r.href} className="gl-row gl-row-a">{body}</Link> : <div className="gl-row">{body}</div>;
}

/** Seven thin bars, today darkest. Hover (or long-press) a bar for its value. */
function Spark({ values }: { values: number[] }) {
  const max = Math.max(...values, 0);
  const W = 64, H = 22, gap = 2;
  const bw = (W - gap * (values.length - 1)) / values.length;
  const days = values.map((_, i) => (i === values.length - 1 ? 'today' : `${values.length - 1 - i}d ago`));
  return (
    <svg className="gl-spark" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`last ${values.length} days: ${values.join(', ')}`}>
      {values.map((v, i) => {
        const h = max > 0 ? Math.max(v > 0 ? 2 : 1, (v / max) * H) : 1;
        return (
          <rect key={i} x={i * (bw + gap)} y={H - h} width={bw} height={h} rx={1.5}
            fill={i === values.length - 1 ? '#475569' : '#cbd5e1'}>
            <title>{`${days[i]}: ${v}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

const CSS = `
.gl-wrap { min-height: 100vh; background: #f3f4f6; color: #111827; padding-bottom: 32px; }
.gl-head { position: sticky; top: 0; z-index: 10; background: #fff; border-bottom: 1px solid #e5e7eb; }
.gl-head-in { max-width: 1120px; margin: 0 auto; padding: 12px 16px; display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.gl-head-left { display: flex; align-items: baseline; gap: 12px; min-width: 0; flex-wrap: wrap; }
.gl-title { font-size: 18px; font-weight: 700; }
.gl-overall { font-size: 13px; color: #374151; display: inline-flex; align-items: center; gap: 6px; }
.gl-overall i, .gl-tile-status i { display: inline-block; width: 9px; height: 9px; border-radius: 50%; flex: none; }
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
.gl-tools-edit { grid-column: 1 / -1; font-size: 13px; color: #374151; background: #fef9c3; border-radius: 8px; padding: 8px 10px; display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.gl-pin-done { border: none; background: #111827; color: #fff; border-radius: 999px; padding: 4px 14px; font-size: 13px; font-weight: 600; cursor: pointer; flex: none; }
.gl-tools-pin { background: none; border: none; text-align: left; width: 100%; cursor: pointer; font-family: inherit; color: #6b7280; }
.gl-tools-pin.on { color: #111827; font-weight: 600; }
.gl-tools-pin.on span { color: #e79e00; }
.gl-pins { display: flex; flex-wrap: wrap; gap: 8px; margin: 6px 0 2px; }
.gl-pin { background: #fff; border: 1px solid #d1d5db; border-radius: 999px; padding: 8px 14px; font-size: 14px; font-weight: 600; color: #111827; text-decoration: none; cursor: pointer; font-family: inherit; line-height: 1.2; }
a.gl-pin:hover { background: #f9fafb; border-color: #9ca3af; }
.gl-pin-edit { background: none; border-style: dashed; color: #6b7280; font-weight: 500; }
.gl-body { max-width: 1120px; margin: 0 auto; padding: 8px 16px; }
.gl-error { background: #fef2f2; color: #b91c1c; border-radius: 10px; padding: 10px 12px; font-size: 13px; margin: 8px 0; }
.gl-wait { color: #6b7280; font-size: 14px; padding: 40px 0; text-align: center; }
.gl-sec { margin-top: 14px; }
.gl-h2 { font-size: 12px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: .06em; margin: 0 0 8px 2px; }
.gl-sec-needs .gl-h2 { color: #b45309; }
.gl-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
@media (min-width: 760px) { .gl-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (min-width: 1000px) { .gl-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
.gl-grid { grid-auto-flow: dense; }
.gl-tile { display: flex; flex-direction: column; gap: 4px; background: #fff; border: 1px solid #e5e7eb; border-top: 4px solid #9ca3af; border-radius: 12px; padding: 10px 12px 10px; color: inherit; min-width: 0; }
.gl-wide { grid-column: span 2; }
.gl-tile-head { display: flex; flex-direction: column; gap: 4px; text-decoration: none; color: inherit; min-width: 0; }
.gl-tile-go { color: #9ca3af; }
a.gl-tile-head:hover .gl-tile-label { color: #1d4ed8; }
.gl-rows { display: flex; flex-direction: column; margin: 4px 0 2px; border-top: 1px solid #f3f4f6; }
.gl-row { display: flex; align-items: baseline; gap: 8px; padding: 6px 0; border-bottom: 1px solid #f3f4f6; font-size: 13px; line-height: 1.3; color: #111827; text-decoration: none; min-width: 0; }
.gl-row i { display: inline-block; width: 7px; height: 7px; border-radius: 50%; flex: none; align-self: center; }
.gl-row-main { font-weight: 600; flex: none; max-width: 60%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gl-row-note { color: #6b7280; flex: 1; min-width: 0; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.gl-row-go { color: #9ca3af; flex: none; }
a.gl-row-a:hover { background: #f9fafb; }
.gl-row-more { color: #1d4ed8; font-size: 12px; border-bottom: none; }
.gl-tile-label { font-size: 12px; color: #6b7280; line-height: 1.25; }
.gl-tile-mid { display: flex; align-items: flex-end; justify-content: space-between; gap: 6px; }
.gl-tile-val { font-size: 28px; font-weight: 800; letter-spacing: -.5px; line-height: 1.05; font-variant-numeric: tabular-nums; white-space: nowrap; }
.gl-spark { flex: none; margin-bottom: 3px; }
.gl-tile-sub { font-size: 12px; color: #4b5563; line-height: 1.3; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.gl-tile-status { margin-top: auto; padding-top: 2px; font-size: 12px; font-weight: 600; color: #374151; display: flex; align-items: center; gap: 6px; }
.gl-foot { margin-top: 18px; font-size: 12px; color: #9ca3af; text-align: center; }
.gl-foot a { color: #6b7280; }
.gl-login { min-height: 100vh; background: #f3f4f6; display: flex; align-items: center; justify-content: center; padding: 16px; }
.gl-login-card { width: 100%; max-width: 340px; background: #fff; border: 1px solid #e5e7eb; border-radius: 16px; padding: 28px 24px; text-align: center; }
.gl-login-card h1 { font-size: 20px; margin: 0 0 16px; }
.gl-pw { width: 100%; border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px 14px; font-size: 15px; box-sizing: border-box; margin-bottom: 10px; color: #111; }
.gl-pw-err { font-size: 13px; color: #ef4444; margin-bottom: 10px; }
.gl-pw-btn { width: 100%; background: #1e3a5f; color: #fff; border: none; border-radius: 10px; padding: 12px 0; font-size: 15px; font-weight: 600; cursor: pointer; }
.gl-pw-btn:disabled { opacity: .45; }
`;
