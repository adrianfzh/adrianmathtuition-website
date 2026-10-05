'use client';

// /admin — the dashboard "at a glance" (5 Oct 2026, Adrian: "admin hub seems
// cluttered > why not have a dashboard?" … "make the dashboard 'at a glance' -
// like a monitoring dashboard"). One read (GET /api/admin/glance, counts only,
// cached 60 s server-side), refreshed every minute while the page is open.
// Tiles: a big number, a colour with its plain word, a tiny 7-day trend. Every
// other page sits in the Tools menu. The old launcher grid is /admin/classic.

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ensureAdminSession, loginAdminSession } from '@/lib/admin-client';
import PasswordInput from '@/components/PasswordInput';
import { overallTone, type Glance, type Tile, type Tone } from '@/lib/glance';

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
    { label: 'Bank figures', href: '/admin/figures-bank' }, { label: 'Figure review', href: '/admin/figures' }, { label: 'Trap review', href: '/admin/pitfalls' },
    { label: 'Topic cards', href: '/admin/topic-cards' }, { label: 'Notes', href: '/admin/notes' }, { label: 'Prelim builder', href: '/admin/prelim-builder' },
    { label: 'Print a paper', href: '/app/print' }, { label: 'Worksheet builder', href: '/admin/worksheet-builder' }, { label: 'Teaching decks', href: '/admin/lessons' },
    { label: 'Curriculum', href: '/admin/curriculum' },
  ] },
  { group: 'Money', links: [
    { label: 'Invoices', href: '/admin/invoices' }, { label: 'Email log', href: '/admin/emails' },
  ] },
  { group: 'Other', links: [
    { label: 'My to-dos', href: '/admin/my-todos' }, { label: 'Loop tasks', href: '/admin/my-todos?tab=loop' }, { label: 'Kiosk (on Switches)', href: '/admin/switches#kiosk' },
    { label: 'Math tools', href: '/tools' }, { label: 'Marketing calendar', href: '/admin/calendar-marketing-post' },
    { label: 'Old hub (tiles)', href: '/admin/classic' },
  ] },
];

export default function AdminDashboard() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [data, setData] = useState<Glance | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
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
            <button className={`gl-btn gl-tools-btn${toolsOpen ? ' on' : ''}`} onClick={() => setToolsOpen(o => !o)} aria-expanded={toolsOpen}>
              Tools ▾
            </button>
          </div>
        </div>
        {toolsOpen && (
          <nav className="gl-tools" aria-label="Tools">
            {TOOLS.map(g => (
              <div key={g.group} className="gl-tools-group">
                <div className="gl-tools-h">{g.group}</div>
                {g.links.map(l => <Link key={l.href} href={l.href} className="gl-tools-a">{l.label}</Link>)}
              </div>
            ))}
          </nav>
        )}
      </header>

      <main className="gl-body">
        {error && <div className="gl-error">Could not refresh: {error}</div>}
        {!data && !error && <div className="gl-wait">Reading the machine…</div>}

        {data?.sections.map(s => (
          <section key={s.id} className={`gl-sec gl-sec-${s.id}`}>
            <h2 className="gl-h2">{s.title}</h2>
            <div className="gl-grid">
              {s.tiles.map(t => <TileCard key={t.id} t={t} />)}
            </div>
            {s.id === 'today' && data.lessons && data.lessons.length > 0 && (
              <details className="gl-lessons-fold">
                <summary>Next lesson pages · {data.lessons.length} today</summary>
                <div className="gl-lessons">
                  {data.lessons.map(l => (
                    <Link key={l.lessonId} href={l.href} className="gl-lesson">
                      <span className="gl-lesson-t">{l.time || '—'}</span>
                      <span className="gl-lesson-n">{l.name}</span>
                      <span className="gl-lesson-go">Next lesson ›</span>
                    </Link>
                  ))}
                </div>
              </details>
            )}
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

function TileCard({ t }: { t: Tile }) {
  const body = (
    <>
      <div className="gl-tile-label">{t.label}</div>
      <div className="gl-tile-mid">
        <span className="gl-tile-val">{t.value}</span>
        {t.trend && t.trend.length > 1 && <Spark values={t.trend} />}
      </div>
      {t.sub && <div className="gl-tile-sub">{t.sub}</div>}
      <div className="gl-tile-status"><i style={{ background: TONE_COLOUR[t.tone] }} />{t.status}</div>
    </>
  );
  const style = { borderTopColor: TONE_COLOUR[t.tone] };
  return t.href
    ? <Link href={t.href} className="gl-tile" style={style}>{body}</Link>
    : <div className="gl-tile" style={style}>{body}</div>;
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
.gl-body { max-width: 1120px; margin: 0 auto; padding: 8px 16px; }
.gl-error { background: #fef2f2; color: #b91c1c; border-radius: 10px; padding: 10px 12px; font-size: 13px; margin: 8px 0; }
.gl-wait { color: #6b7280; font-size: 14px; padding: 40px 0; text-align: center; }
.gl-sec { margin-top: 14px; }
.gl-h2 { font-size: 12px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: .06em; margin: 0 0 8px 2px; }
.gl-sec-needs .gl-h2 { color: #b45309; }
.gl-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
@media (min-width: 760px) { .gl-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (min-width: 1000px) { .gl-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
.gl-tile { display: flex; flex-direction: column; gap: 4px; background: #fff; border: 1px solid #e5e7eb; border-top: 4px solid #9ca3af; border-radius: 12px; padding: 10px 12px 10px; text-decoration: none; color: inherit; min-width: 0; }
a.gl-tile:hover { background: #f9fafb; }
.gl-tile-label { font-size: 12px; color: #6b7280; line-height: 1.25; }
.gl-tile-mid { display: flex; align-items: flex-end; justify-content: space-between; gap: 6px; }
.gl-tile-val { font-size: 28px; font-weight: 800; letter-spacing: -.5px; line-height: 1.05; font-variant-numeric: tabular-nums; white-space: nowrap; }
.gl-spark { flex: none; margin-bottom: 3px; }
.gl-tile-sub { font-size: 12px; color: #4b5563; line-height: 1.3; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.gl-tile-status { margin-top: auto; padding-top: 2px; font-size: 12px; font-weight: 600; color: #374151; display: flex; align-items: center; gap: 6px; }
.gl-lessons-fold { margin-top: 10px; }
.gl-lessons-fold summary { cursor: pointer; font-size: 13px; font-weight: 600; color: #1d4ed8; padding: 6px 2px; list-style-position: inside; }
.gl-lessons { display: flex; flex-direction: column; gap: 6px; margin-top: 10px; }
@media (min-width: 760px) { .gl-lessons { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); } }
.gl-lesson { display: flex; align-items: center; gap: 10px; background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 8px 12px; text-decoration: none; color: #111827; font-size: 14px; min-width: 0; }
.gl-lesson:hover { background: #f9fafb; }
.gl-lesson-t { color: #6b7280; font-size: 12px; width: 62px; flex: none; }
.gl-lesson-n { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
.gl-lesson-go { color: #1d4ed8; font-size: 12px; flex: none; }
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
