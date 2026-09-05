'use client';
// /admin/figures-bank — eyeball EVERY bank figure and flag the ones needing work.
// A paginated thumbnail grid (pre-built 320px thumbs, full image as fallback);
// tapping a figure toggles its 🚩 flag (Supabase figure_flags via
// /api/admin/figures-bank). The Flagged tab is the work queue — each card
// deep-links into /admin/questions?id= where the ♻️ Replace button lives.
// Progress resumes: last page is remembered per level filter (localStorage).

import { useState, useEffect, useCallback } from 'react';
import { CORRECTNESS_HOLD } from '@/lib/figure-flag-release';
import {
  candidateChip, candidateCaption, candidateButtonLabel, candidateButtonColour,
} from '@/lib/solution-candidate-chip';
import { ensureAdminSession, loginAdminSession } from '@/lib/admin-client';

const C = {
  bg: '#f4f6fa', card: '#fff', border: '#e2e8f0', navy: '#1c3a5e',
  muted: '#64748b', flag: '#dc2626', flagBg: '#fef2f2',
};

type Item = {
  path: string; qid: string; level: string | null; school: string | null;
  year: number | null; qnum: string | null; url: string; thumb: string; flagged: boolean;
  currentUrl?: string | null; changed?: boolean;
  stem?: string; stemEmpty?: boolean; figureMissing?: boolean; watermark?: string | null;
  checks?: { width: number; height: number; inkShare: number; textShare: number;
             small: boolean; blank: boolean; textInCrop: boolean;
             margins: { left: number; right: number; top: number; bottom: number } | null;
             wideMargins: boolean } | null;
  note?: string | null;
};

/* ── the solution vet lane ─────────────────────────────────────────────────────
 * 152 SOLUTION images are switched off (figure_flags kind='solution'
 * status='held') because they carry another school's or centre's watermark.
 * Adrian: "i do want to see them and if approve, or amended, put them back into
 * solutions." Each card shows what is in the bank now beside the cleaned
 * candidate, WITH the cleaning session's own verdict — a hold is never hidden,
 * but its button reads "Use it anyway" so approving a remnant is a conscious act. */
type Candidate = {
  url: string; verdict: string; route: string | null; note: string | null;
  holdKind: string | null; holdReason: string | null; methodNote: string | null;
};
type SolItem = {
  path: string; qid: string; level: string | null; school: string | null;
  year: number | null; paper: string | null; qnum: string | null;
  partLabel: string | null; note: string | null; claimedBy: string | null;
  liveUrl: string; candidateUrl: string | null; candidate: Candidate | null;
};
const MAX_AMEND = 3.5 * 1024 * 1024;
const SOL_PAGE = 20;

/* ── the fitness lane ───────────────────────────────────────────────────────
 * A fitness-verification pass flags question figures that may be the wrong
 * figure, cropped short, illegible, or carry foreign content — as figure_flags
 * kind='question' status='held' (not 'open': an open QUESTION flag withdraws
 * the whole question from serving immediately, and most fitness failures are
 * cosmetic). This lane is where Adrian sees each one and decides: hide it,
 * accept it as fine, or send it to the repair queue. */
type FitItem = {
  path: string; qid: string; level: string | null; school: string | null;
  year: number | null; paper: string | null; qnum: string | null;
  stem: string; figureUrl: string;
  severity: 'blocks-answering' | 'cosmetic' | null; verdict: string | null;
  note: string | null; claimedBy: string | null;
};
const FIT_PAGE = 20;

/** The chip beside a candidate, the caption above it and the approve button's
 *  label all come from lib/solution-candidate-chip (pure + tested). hold_kind and
 *  route are EXPLICIT fields — never inferred from the reason text, because a
 *  keyword guess once called an uninspected image inspected, and a null
 *  method_note once made five REDRAWN figures read "exact removal". */
const verdictChip = candidateChip;

/** The severity chip on a fitness card. Red only for a verdict that blocks
 *  answering the question; everything else (cosmetic, or no verdict parsed
 *  at all) reads as a neutral grey — the pass itself may not have rated it. */
function severityChip(it: FitItem): { text: string; colour: string; bg: string } {
  if (it.severity === 'blocks-answering') return { text: '⛔ blocks answering', colour: '#b91c1c', bg: '#fef2f2' };
  if (it.severity === 'cosmetic') return { text: 'cosmetic', colour: '#475569', bg: '#f1f5f9' };
  return { text: 'unrated', colour: '#475569', bg: '#f1f5f9' };
}

type Tab = 'all' | 'flagged' | 'solutions' | 'fitness';

const LEVELS = ['', 'AM', 'EM', 'EM_NA', 'S1', 'S2', 'S3_AM', 'S3_EM', 'S3_EM_NA', 'JC1', 'JC2'];
/** Mirrors JC_LEVELS in the route — the solution lane's Sec/JC scope split. */
const isJc = (level: unknown) =>
  typeof level === 'string' && ['JC1', 'JC2', 'JC2_H1'].includes(level.trim().toUpperCase());
const lsKey = (level: string) => `figures-page-${level || 'all'}`;

export default function FiguresPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [page, setPage] = useState(0);
  const [pageSize] = useState(60);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [flaggedCount, setFlaggedCount] = useState(0);
  const [withheld, setWithheld] = useState(0);
  const [busy, setBusy] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);

  const [level, setLevel] = useState('');
  const [tab, setTab] = useState<Tab>('all');
  const [sols, setSols] = useState<SolItem[]>([]);
  const [solTotals, setSolTotals] = useState({ held: 0, withCandidate: 0, sec: 0, jc: 0, allHeld: 0 });
  // Sec first: Adrian paused JC cleaning until Sec completes, and one undivided
  // list put the 112 Sec decisions on page 11 behind 202 paused JC rows.
  const [solScope, setSolScope] = useState<'sec' | 'jc' | 'all'>('sec');
  const [solBusy, setSolBusy] = useState('');
  const [solErr, setSolErr] = useState<Record<string, string>>({});
  const [fits, setFits] = useState<FitItem[]>([]);
  const [fitTotals, setFitTotals] = useState({ held: 0, blocking: 0, cosmetic: 0, sentToRepair: 0 });
  // Rows already sent to repair are decided, so they leave the working lane.
  // `?sent=1` shows them — the count is a door, never a disappearance.
  const [fitSent, setFitSent] = useState(false);
  const [fitBusy, setFitBusy] = useState('');
  const [fitErr, setFitErr] = useState<Record<string, string>>({});
  // ?flagged=1 opens the review directly — the tab buttons are easy to miss,
  // and a link is something that can be sent. ?kind=solution / ?kind=fitness
  // do the same for those lanes.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const p = new URLSearchParams(window.location.search);
    if (p.get('kind') === 'solution') {
      setTab('solutions'); setPage(0);
      const s = p.get('scope');
      if (s === 'jc' || s === 'all' || s === 'sec') setSolScope(s);
    }
    else if (p.get('kind') === 'fitness') { setTab('fitness'); setPage(0); }
    else if (p.get('flagged') === '1') { setTab('flagged'); setPage(0); }
  }, []);
  const goTab = (t: Tab) => {
    setTab(t); setPage(0);
    if (typeof window !== 'undefined') {
      const u = new URL(window.location.href);
      u.searchParams.delete('flagged'); u.searchParams.delete('kind');
      if (t === 'flagged') u.searchParams.set('flagged', '1');
      if (t === 'solutions') u.searchParams.set('kind', 'solution');
      if (t === 'fitness') u.searchParams.set('kind', 'fitness');
      window.history.replaceState(null, '', u.toString());
    }
  };
  const [loading, setLoading] = useState(false);

  useEffect(() => { ensureAdminSession().then(setAuthed); }, []);
  // Resume where the ALL-FIGURES grid left off — and only there. The save below
  // is guarded by `tab === 'all'`; this read was not, so the grid's page number
  // was applied to whichever lane you opened. Adrian had browsed the grid to
  // page 146 (2,920 figures / 20 = 146), then opened Fitness — 9 pages long —
  // and every page rendered empty (5 Sep 2026).
  useEffect(() => {
    if (tab !== 'all') return;
    const saved = Number(localStorage.getItem(lsKey(level)) ?? 0);
    setPage(Number.isFinite(saved) ? saved : 0);
  }, [level, tab]);

  // The count on the Solutions / Fitness tabs, so each lane announces itself before it is opened.
  useEffect(() => {
    if (!authed) return;
    fetch('/api/admin/figures-bank?kind=solution&scope=sec&page=0&pageSize=1')
      .then((r) => r.json())
      .then((d) => { if (d?.totals) setSolTotals(d.totals); })
      .catch(() => { /* a count is a nicety, not a precondition */ });
    fetch('/api/admin/figures-bank?kind=fitness&page=0&pageSize=1')
      .then((r) => r.json())
      .then((d) => { if (d?.totals) setFitTotals(d.totals); })
      .catch(() => { /* a count is a nicety, not a precondition */ });
  }, [authed]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = tab === 'solutions'
        ? `kind=solution&scope=${solScope}&page=${page}&pageSize=${SOL_PAGE}`
        : tab === 'fitness'
          ? `kind=fitness&page=${page}&pageSize=${FIT_PAGE}${fitSent ? '&sent=1' : ''}`
          : tab === 'flagged'
            ? `flagged=1&page=${page}&pageSize=20`
            : `page=${page}&pageSize=${pageSize}${level ? `&level=${level}` : ''}`;
      const r = await fetch(`/api/admin/figures-bank?${qs}`);
      const d = await r.json();
      if (d.error) return;
      if (tab === 'solutions') {
        setSols(d.items ?? []);
        if (d.totals) setSolTotals(d.totals);
        if (!(d.items ?? []).length && page > 0) setPage(0);
        return;
      }
      if (tab === 'fitness') {
        setFits(d.items ?? []);
        if (d.totals) setFitTotals(d.totals);
        // An empty page that is not the first means we are past the end of this
        // lane — from a stale saved page, or a lane that shrank under us while
        // figures were being repaired. Walk back rather than show blank.
        if (!(d.items ?? []).length && page > 0) setPage(0);
        return;
      }
      setItems(d.items ?? []);
      if (tab === 'all') {
        setTotalQuestions(d.totalQuestions ?? 0);
        setFlaggedCount(d.flaggedCount ?? 0);
        if (typeof d.withheld === 'number') setWithheld(d.withheld);
        localStorage.setItem(lsKey(level), String(page));
      }
    } finally { setLoading(false); }
  }, [tab, page, pageSize, level, solScope, fitSent]);
  useEffect(() => { if (authed) load(); }, [authed, load]);

  /** "Looks fine" — mark the flag fixed, which releases the question back into
   *  every serving pool (kiosk, worksheets, portal practice, print). */
  const resolve = async (it: Item) => {
    if (busy) return;
    setBusy(it.path);
    setItems(cur => cur.filter(x => x.path !== it.path));
    setFlaggedCount(c => Math.max(0, c - 1));
    setWithheld(w => Math.max(0, w - 1));
    try {
      const r = await fetch('/api/admin/figures-bank', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: it.path, questionId: it.qid, resolve: true }),
      });
      if (r.status === 409) {
        // A correctness hold: the fault is not in the pixels (wrong figure,
        // leaked answer). The route refuses a blind release; say why and ask.
        const j = await r.json().catch(() => ({})) as { reason?: string | null };
        const reason = (j.reason ?? it.note ?? '').slice(0, 600);
        const go = window.confirm(
          `This figure was flagged for a reason the image alone cannot show:\n\n${reason}\n\n` +
          'Release it anyway? Only do this if you have checked it against the paper.',
        );
        if (!go) { load(); return; }
        const r2 = await fetch('/api/admin/figures-bank', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: it.path, questionId: it.qid, resolve: true, force: true, note: 'confirmed on the flagged tab' }),
        });
        if (!r2.ok) throw new Error('failed');
        return;
      }
      if (!r.ok) throw new Error('failed');
    } catch { load(); }
    finally { setBusy(''); }
  };

  /** Release every figure on this page that no check objects to. Sequential —
   *  a failure stops the run rather than half-releasing a page silently. */
  const releaseQuiet = async () => {
    const quiet = items.filter(isQuiet);
    if (!quiet.length || bulkBusy) return;
    setBulkBusy(true);
    let done = 0;
    try {
      for (const it of quiet) {
        const r = await fetch('/api/admin/figures-bank', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: it.path, questionId: it.qid, resolve: true }),
        });
        if (!r.ok) break;
        done++;
      }
    } finally {
      setBulkBusy(false);
      setFlaggedCount((c) => Math.max(0, c - done));
      setWithheld((w) => Math.max(0, w - done));
      load();                       // re-fetch: the page has shifted under us
    }
  };

  /** The chips under a figure. The bulk release reads the SAME function, so it
   *  can never release a figure the page is warning you about. */
  const chipsFor = (it: Item): [string, string][] => {
    const c = it.checks;
    const chips: [string, string][] = [];
    if (it.figureMissing) chips.push(['🖼 no figure stored', C.flag]);
    if (c?.textInCrop) chips.push([`📝 crop looks like it includes question text (${(c.textShare * 100).toFixed(0)}%)`, C.flag]);
    if (c?.blank) chips.push(['◻ almost no ink', C.flag]);
    if (c?.small) chips.push([`🔍 small — ${c.width}×${c.height}px`, '#b45309']);
    if (c?.wideMargins && c.margins) {
      const m = c.margins, pc = (v: number) => `${Math.round(v * 100)}%`;
      chips.push([`⬜ blank edges — L ${pc(m.left)} R ${pc(m.right)} T ${pc(m.top)} B ${pc(m.bottom)}`, '#b45309']);
    }
    if (it.watermark && it.watermark !== 'clean' && it.watermark !== 'no_image') chips.push([`⚠ image: ${it.watermark}`, '#b45309']);
    if (it.stemEmpty) chips.push(['· stem is empty — the figure carries the whole question', C.muted]);
    return chips;
  };
  /** Never bulk-release something that could not be measured — no checks means
   *  no evidence, not a clean bill of health. */
  // A correctness hold (wrong figure, answer leak, blocks-answering, or one the
  // fitness pass re-opened) is NEVER "quiet": the pixel checks cannot see those
  // faults, and on 3 Sep 2026 a bulk release put a leaked answer and two wrong
  // figures back in front of students an hour after they were hidden.
  const CORRECTNESS = CORRECTNESS_HOLD;   // one definition, shared with the route
  const isQuiet = (it: Item) => !!it.checks && chipsFor(it).length === 0 && !CORRECTNESS.test(it.note ?? '');

  /** One vet-lane action. The card leaves the list on success; the error stays
   *  on the card (with the failed STEP named) so a half-applied write is
   *  impossible to mistake for a done one. */
  const solAct = async (it: SolItem, action: string, extra?: Record<string, unknown>) => {
    if (solBusy) return;
    setSolBusy(it.path);
    setSolErr((e) => ({ ...e, [it.path]: '' }));
    try {
      const r = await fetch('/api/admin/figures-bank', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'solution', action, path: it.path, questionId: it.qid, ...extra }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setSolErr((e) => ({ ...e, [it.path]: d.step ? `${d.step}: ${d.error}` : (d.error ?? `failed (${r.status})`) }));
        return;
      }
      setSols((cur) => cur.filter((x) => x.path !== it.path));
      if (d.status === 'fixed') {
        setSolTotals((t) => ({
          ...t,
          held: Math.max(0, t.held - 1),
          withCandidate: Math.max(0, t.withCandidate - (it.candidate ? 1 : 0)),
          // Keep the other tallies honest too — by the CARD's own level, which is
          // the only thing that is right in the 'all' scope as well.
          sec: Math.max(0, t.sec - (isJc(it.level) ? 0 : 1)),
          jc: Math.max(0, t.jc - (isJc(it.level) ? 1 : 0)),
          allHeld: Math.max(0, t.allHeld - 1),
        }));
      }
    } catch {
      setSolErr((e) => ({ ...e, [it.path]: 'network error — nothing was written' }));
    } finally { setSolBusy(''); }
  };

  const amend = async (it: SolItem, file: File) => {
    if (file.size > MAX_AMEND) {
      setSolErr((e) => ({ ...e, [it.path]: `that image is ${(file.size / 1048576).toFixed(1)}MB — 3.5MB max` }));
      return;
    }
    try {
      const b64 = await new Promise<string>((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => res(String(fr.result).split(',')[1] ?? '');
        fr.onerror = () => rej(new Error('read failed'));
        fr.readAsDataURL(file);
      });
      await solAct(it, 'amend', { imageBase64: b64, contentType: file.type || 'image/png' });
    } catch {
      setSolErr((e) => ({ ...e, [it.path]: 'could not read that file' }));
    }
  };

  /** One fitness-lane decision — hide / accept / repair. The card leaves the
   *  list on success (repair too: it's Adrian's decision recorded, the row
   *  moves on to the actual repair queue); errors stay inline on the card. */
  const fitAct = async (it: FitItem, action: 'hide' | 'accept' | 'repair') => {
    if (fitBusy) return;
    setFitBusy(it.path);
    setFitErr((e) => ({ ...e, [it.path]: '' }));
    try {
      const r = await fetch('/api/admin/figures-bank', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'fitness', action, path: it.path, questionId: it.qid }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setFitErr((e) => ({ ...e, [it.path]: d.step ? `${d.step}: ${d.error}` : (d.error ?? `failed (${r.status})`) }));
        return;
      }
      setFits((cur) => cur.filter((x) => x.path !== it.path));
      setFitTotals((t) => ({
        ...t,
        held: Math.max(0, t.held - 1),
        blocking: Math.max(0, t.blocking - (it.severity === 'blocks-answering' ? 1 : 0)),
        cosmetic: Math.max(0, t.cosmetic - (it.severity === 'cosmetic' ? 1 : 0)),
        sentToRepair: t.sentToRepair + (action === 'repair' && !fitSent ? 1 : 0),
      }));
    } catch {
      setFitErr((e) => ({ ...e, [it.path]: 'network error — nothing was written' }));
    } finally { setFitBusy(''); }
  };

  const toggle = async (it: Item) => {
    const flag = !it.flagged;
    setItems((cur) => cur.map((x) => (x.path === it.path ? { ...x, flagged: flag } : x)));
    setFlaggedCount((c) => c + (flag ? 1 : -1));
    const r = await fetch('/api/admin/figures-bank', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: it.path, questionId: it.qid, flag }),
    });
    if (!r.ok) { // roll back on failure
      setItems((cur) => cur.map((x) => (x.path === it.path ? { ...x, flagged: !flag } : x)));
      setFlaggedCount((c) => c + (flag ? -1 : 1));
    }
  };

  const login = async () => {
    setAuthError('');
    const ok = await loginAdminSession(password);
    if (ok) setAuthed(true); else setAuthError('Wrong password');
  };

  if (authed === false) {
    return (
      <main style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 24, width: 340 }}>
          <h1 style={{ fontSize: 18, marginBottom: 12 }}>🖼 Figure Review</h1>
          <input type="password" value={password} placeholder="Admin password" autoFocus
            onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && login()}
            style={{ width: '100%', padding: 10, fontSize: 16, border: `1px solid ${C.border}`, borderRadius: 8 }} />
          {authError && <div style={{ color: '#b91c1c', fontSize: 13, marginTop: 8 }}>{authError}</div>}
          <button onClick={login} style={{ marginTop: 12, width: '100%', padding: 10, fontSize: 15, fontWeight: 600, color: '#fff', background: C.navy, border: 'none', borderRadius: 8 }}>Open</button>
        </div>
      </main>
    );
  }
  if (authed === null) return <main style={{ minHeight: '100vh', background: C.bg }} />;

  // Each tab has its own length and its own page size — the review is measured
  // 20 at a time, the grid shows 60 thumbnails.
  const FLAG_PAGE = 20;
  const lastPage = tab === 'solutions'
    ? Math.max(0, Math.ceil(solTotals.held / SOL_PAGE) - 1)
    : tab === 'fitness'
      ? Math.max(0, Math.ceil(fitTotals.held / FIT_PAGE) - 1)
      : tab === 'flagged'
        ? Math.max(0, Math.ceil((withheld || flaggedCount) / FLAG_PAGE) - 1)
        : Math.max(0, Math.ceil(totalQuestions / pageSize) - 1);
  return (
    <main style={{ minHeight: '100vh', background: C.bg, padding: '14px 12px 80px', maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700 }}>🖼 Figure Review</h1>
        <span style={{ color: C.muted, fontSize: 13 }}>
          {tab === 'all' ? 'tap a figure to flag it for rectification'
            : tab === 'solutions' ? 'switched-off solution images — approve, amend, or leave hidden'
              : tab === 'fitness' ? 'question figures the fitness pass held for a look — hide, accept, or send to repair'
                : 'each figure with its question and what the checks found'}
        </span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          {/* Filled = where you are. The old pair read as two buttons rather
              than a choice, and the review kept getting missed. */}
          <button onClick={() => goTab('all')}
            style={{ fontSize: 13.5, fontWeight: 600, color: tab === 'all' ? '#fff' : '#374151',
              border: `1px solid ${tab === 'all' ? C.navy : C.border}`, background: tab === 'all' ? C.navy : '#fff',
              borderRadius: 8, padding: '6px 14px', cursor: 'pointer' }}>
            All figures
          </button>
          <button onClick={() => goTab('flagged')}
            style={{ fontSize: 13.5, fontWeight: 700, color: tab === 'flagged' ? '#fff' : C.flag,
              border: `1px solid ${C.flag}`, background: tab === 'flagged' ? C.flag : '#fff',
              borderRadius: 8, padding: '6px 14px', cursor: 'pointer' }}>
            🚩 Review {flaggedCount || ''} flagged →
          </button>
          <button onClick={() => goTab('solutions')}
            style={{ fontSize: 13.5, fontWeight: 700, color: tab === 'solutions' ? '#fff' : '#7c3aed',
              border: '1px solid #7c3aed', background: tab === 'solutions' ? '#7c3aed' : '#fff',
              borderRadius: 8, padding: '6px 14px', cursor: 'pointer' }}>
            🖼 Solutions{solTotals.held ? ` · ${solTotals.held}` : ''}
          </button>
          <button onClick={() => goTab('fitness')}
            style={{ fontSize: 13.5, fontWeight: 700, color: tab === 'fitness' ? '#fff' : '#0369a1',
              border: '1px solid #0369a1', background: tab === 'fitness' ? '#0369a1' : '#fff',
              borderRadius: 8, padding: '6px 14px', cursor: 'pointer' }}>
            🔍 Fitness{fitTotals.held ? ` · ${fitTotals.held}` : ''}
          </button>
        </span>
      </div>

      {tab === 'all' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          <select value={level} onChange={(e) => setLevel(e.target.value)}
            style={{ fontSize: 13, border: `1px solid ${C.border}`, borderRadius: 8, padding: '5px 8px', background: '#fff' }}>
            {LEVELS.map((l) => <option key={l} value={l}>{l || 'All levels'}</option>)}
          </select>
          <span style={{ color: C.muted, fontSize: 13 }}>
            page {page + 1} / {lastPage + 1} · {totalQuestions} questions with figures
          </span>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            <button disabled={page === 0 || loading} onClick={() => setPage((p) => Math.max(0, p - 1))}
              style={{ fontSize: 13, border: `1px solid ${C.border}`, background: '#fff', borderRadius: 8, padding: '4px 12px', cursor: 'pointer', opacity: page === 0 ? 0.4 : 1 }}>← Prev</button>
            <button disabled={page >= lastPage || loading} onClick={() => setPage((p) => p + 1)}
              style={{ fontSize: 13, border: `1px solid ${C.border}`, background: '#fff', borderRadius: 8, padding: '4px 12px', cursor: 'pointer', opacity: page >= lastPage ? 0.4 : 1 }}>Next →</button>
          </span>
        </div>
      )}

      {loading && <div style={{ color: C.muted, fontSize: 14, padding: 20, textAlign: 'center' }}>Loading…</div>}
      {!loading && tab === 'flagged' && items.length === 0 && (
        <div style={{ color: C.muted, fontSize: 14, padding: 20, textAlign: 'center' }}>No open flags — flag figures from the All tab.</div>
      )}

      {tab === 'flagged' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          <span style={{ fontSize: 13, color: C.muted }}>
            page {page + 1} / {lastPage + 1} · {withheld || flaggedCount} flagged figures
          </span>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
            {(() => {
              const n = items.filter(isQuiet).length;
              if (!n) return null;
              return (
                <button onClick={releaseQuiet} disabled={bulkBusy || loading}
                  title="Releases only the figures no check objects to. Anything with a chip is left for you."
                  style={{ fontSize: 13, fontWeight: 700, color: '#fff', background: '#15803d', border: 'none',
                    borderRadius: 8, padding: '5px 14px', cursor: 'pointer', opacity: bulkBusy ? 0.6 : 1, marginRight: 6 }}>
                  {bulkBusy ? 'Releasing…' : `✓ Release ${n} with no warnings`}
                </button>
              );
            })()}
            <button disabled={page === 0 || loading} onClick={() => { setPage((p) => Math.max(0, p - 1)); window.scrollTo({ top: 0 }); }}
              style={{ fontSize: 13, border: `1px solid ${C.border}`, background: '#fff', borderRadius: 8, padding: '4px 12px', cursor: 'pointer', opacity: page === 0 ? 0.4 : 1 }}>← Prev</button>
            <button disabled={page >= lastPage || loading} onClick={() => { setPage((p) => p + 1); window.scrollTo({ top: 0 }); }}
              style={{ fontSize: 13, border: `1px solid ${C.border}`, background: '#fff', borderRadius: 8, padding: '4px 12px', cursor: 'pointer', opacity: page >= lastPage ? 0.4 : 1 }}>Next →</button>
          </span>
        </div>
      )}

      {tab === 'flagged' && items.length > 0 && (
        <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 10, padding: '8px 12px', marginBottom: 10, fontSize: 13.5 }}>
          <strong>{withheld || flaggedCount} questions are withheld from students</strong> while these flags are open —
          the serving gate excludes them from the kiosk, bot worksheets, portal practice and print.
          Tapping <em>Looks fine</em> releases one immediately.
          <div style={{ marginTop: 4, color: C.muted }}>
            The chips below each figure are measured, not guessed — but they only catch what is
            measurable. A figure with no chips can still be the wrong figure; the question&apos;s own
            words are printed beside it so you can tell.
            <br />
            <strong>Release {items.filter(isQuiet).length} with no warnings</strong> clears only the ones
            nothing objects to — it cannot tell whether a figure belongs to its question, so use it when
            you have glanced down the page, not instead of glancing.
          </div>
        </div>
      )}

      {/* Flagged tab: the figure AS FLAGGED beside the figure AS IT IS NOW, so a
          pass is one glance per row rather than a hunt through thumbnails. */}
      {tab === 'flagged' && items.map((it) => (
        <div key={it.path} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 10, marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: 13 }}>
            <strong>{it.school ?? '?'} {it.year ?? ''}</strong>
            <span style={{ color: C.muted }}>{it.level ?? ''}{it.qnum ? ` · Q${it.qnum}` : ''}</span>
            {it.changed && <span style={{ fontSize: 11.5, color: '#15803d', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 999, padding: '1px 8px' }}>cleaned since you flagged it</span>}
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              <a href={`/admin/questions?id=${it.qid}`} target="_blank" rel="noreferrer"
                style={{ fontSize: 12.5, border: `1px solid ${C.border}`, borderRadius: 8, padding: '3px 10px', textDecoration: 'none', color: '#111' }}>Open question ↗</a>
              <button onClick={() => resolve(it)} disabled={!!busy}
                style={{ fontSize: 13, fontWeight: 600, color: '#fff', background: '#15803d', border: 'none', borderRadius: 8, padding: '4px 14px', cursor: 'pointer', opacity: busy === it.path ? 0.5 : 1 }}>
                ✓ Looks fine — release
              </button>
            </span>
          </div>
          {/* What a glance cannot carry: the question's own words (so a figure
              that is really the NEXT question's text, or that repeats the stem,
              is obvious), and measurements of the figure itself. */}
          {(() => {
            const c = it.checks;
            const chips = chipsFor(it);
            const hold = CORRECTNESS.test(it.note ?? '');
            return (
              <>
                {it.note && (
                  <div style={{ fontSize: 12.5, color: hold ? '#9a3412' : C.muted, background: hold ? '#fff7ed' : 'transparent', border: hold ? '1px solid #fdba74' : 'none', borderRadius: 8, padding: hold ? '6px 9px' : 0, marginBottom: 6, maxHeight: 96, overflow: 'auto' }}>
                    <strong>{hold ? 'Why it is flagged (not visible in the image): ' : 'Flag note: '}</strong>{it.note}
                  </div>
                )}
                {chips.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                    {chips.map(([t, col]) => (
                      <span key={t} style={{ fontSize: 11.5, color: col, border: `1px solid ${col}`, borderRadius: 999, padding: '1px 9px' }}>{t}</span>
                    ))}
                  </div>
                )}
                {chips.length === 0 && c && (
                  <div style={{ fontSize: 11.5, color: '#15803d', marginBottom: 6 }}>
                    ✓ nothing measurable wrong — {c.width}×{c.height}px, {(c.inkShare * 100).toFixed(1)}% ink
                    {c.margins ? `, edges L ${Math.round(c.margins.left * 100)}% R ${Math.round(c.margins.right * 100)}%` : ''}
                  </div>
                )}
                {it.stem && (
                  <div style={{ fontSize: 12.5, color: '#374151', background: '#f8fafc', border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 9px', marginBottom: 8, maxHeight: 92, overflow: 'auto' }}>
                    {it.stem}
                  </div>
                )}
              </>
            );
          })()}
          <div style={{ display: 'grid', gridTemplateColumns: it.changed ? '1fr 1fr' : '1fr', gap: 10 }}>
            {it.changed && (
              <figure style={{ margin: 0 }}>
                <figcaption style={{ fontSize: 11.5, color: C.muted, marginBottom: 3 }}>as you flagged it</figcaption>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <a href={it.url} target="_blank" rel="noreferrer"><img src={it.url} alt="" loading="lazy" style={{ width: '100%', maxHeight: 340, objectFit: 'contain', background: '#fff', border: '1px solid #94a3b8', borderRadius: 6, boxShadow: '0 0 0 5px #e2e8f0' }} /></a>
              </figure>
            )}
            <figure style={{ margin: 0 }}>
              <figcaption style={{ fontSize: 11.5, color: C.muted, marginBottom: 3 }}>{it.changed ? 'as it is now' : 'current figure'}</figcaption>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <a href={it.currentUrl ?? it.url} target="_blank" rel="noreferrer" title="open full size"><img src={it.currentUrl ?? it.url} alt="" loading="lazy" style={{ width: '100%', maxHeight: 340, objectFit: 'contain', background: '#fff', border: '1px solid #94a3b8', borderRadius: 6, boxShadow: '0 0 0 5px #e2e8f0' }} /></a>
            </figure>
          </div>
        </div>
      ))}

      {tab === 'solutions' && (
        <>
          <div style={{ background: '#faf5ff', border: '1px solid #ddd6fe', borderRadius: 10, padding: '8px 12px', marginBottom: 10, fontSize: 13.5 }}>
            <strong>{solTotals.held} solution images are switched off</strong>
            {solScope !== 'all' && solTotals.allHeld > solTotals.held ? ` of ${solTotals.allHeld}` : ''} — they
            carry another school&apos;s or centre&apos;s watermark, so the render gate withholds them
            wherever a solution is revealed. {solTotals.withCandidate} have a cleaned candidate.
            <div style={{ marginTop: 4, color: C.muted }}>
              <em>Approve as-is</em> puts the image back untouched. <em>Use cleaned candidate</em> writes
              the cleaned copy as a new object and repoints every reference to it — the original is
              never deleted, so it is revertible. A candidate the cleaning session held is still shown,
              with its reason; its button says <em>Use it anyway</em>.
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            {([
              ['sec', `Sec · ${solTotals.sec}`],
              ['jc', `JC · ${solTotals.jc}`],
              ['all', `All · ${solTotals.allHeld}`],
            ] as const).map(([s, label]) => (
              <button key={s} onClick={() => { if (s !== solScope) { setSolScope(s); setPage(0); } }}
                style={{
                  fontSize: 13, fontWeight: solScope === s ? 700 : 500,
                  color: solScope === s ? '#fff' : '#7c3aed',
                  border: '1px solid #7c3aed', background: solScope === s ? '#7c3aed' : '#fff',
                  borderRadius: 8, padding: '4px 10px', cursor: 'pointer',
                }}>{label}</button>
            ))}
            <span style={{ fontSize: 13, color: C.muted }}>page {page + 1} / {lastPage + 1}</span>
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              <button disabled={page === 0 || loading} onClick={() => { setPage((p) => Math.max(0, p - 1)); window.scrollTo({ top: 0 }); }}
                style={{ fontSize: 13, border: `1px solid ${C.border}`, background: '#fff', borderRadius: 8, padding: '4px 12px', cursor: 'pointer', opacity: page === 0 ? 0.4 : 1 }}>← Prev</button>
              <button disabled={page >= lastPage || loading} onClick={() => { setPage((p) => p + 1); window.scrollTo({ top: 0 }); }}
                style={{ fontSize: 13, border: `1px solid ${C.border}`, background: '#fff', borderRadius: 8, padding: '4px 12px', cursor: 'pointer', opacity: page >= lastPage ? 0.4 : 1 }}>Next →</button>
            </span>
          </div>
          {!loading && sols.length === 0 && (
            <div style={{ color: C.muted, fontSize: 14, padding: 20, textAlign: 'center' }}>Nothing held — every solution image has been judged.</div>
          )}
          {sols.map((it) => {
            const busy = solBusy === it.path;
            const cand = it.candidate;
            const chip = cand ? verdictChip(cand) : null;
            const btn = {
              fontSize: 13, fontWeight: 600, border: `1px solid ${C.border}`, background: '#fff',
              color: '#111', borderRadius: 8, padding: '6px 12px', cursor: busy ? 'default' : 'pointer',
              opacity: busy ? 0.5 : 1,
            } as const;
            return (
              <div key={it.path} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 10, marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', fontSize: 13.5, marginBottom: 6 }}>
                  <strong>
                    {it.level ?? '?'} · {it.school ?? '?'} {it.year ?? ''}
                    {it.paper ? ` P${it.paper}` : ''}{it.qnum ? ` Q${it.qnum}` : ''}
                  </strong>
                  <span style={{ color: '#7c3aed', fontWeight: 700 }}>{it.partLabel ?? ''}</span>
                  <a href={`/admin/questions?id=${it.qid}`} target="_blank" rel="noreferrer"
                    style={{ marginLeft: 'auto', fontSize: 12.5, border: `1px solid ${C.border}`, borderRadius: 8, padding: '3px 10px', textDecoration: 'none', color: '#111' }}>Open question ↗</a>
                </div>
                {it.note && (
                  <div style={{ fontSize: 12, color: C.muted, marginBottom: 8, maxHeight: 60, overflow: 'auto' }}>{it.note}</div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, marginBottom: 8 }}>
                  <figure style={{ margin: 0 }}>
                    <figcaption style={{ fontSize: 11.5, color: C.muted, marginBottom: 3 }}>In the bank now · tap to open full size</figcaption>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <a href={it.liveUrl} target="_blank" rel="noreferrer"><img src={it.liveUrl} alt="" loading="lazy"
                      style={{ width: '100%', maxHeight: 380, objectFit: 'contain', background: '#fff', border: '1px solid #94a3b8', borderRadius: 6 }} /></a>
                  </figure>
                  <figure style={{ margin: 0 }}>
                    <figcaption style={{ fontSize: 11.5, color: C.muted, marginBottom: 3 }}>{candidateCaption(cand)}</figcaption>
                    {cand ? (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <a href={cand.url} target="_blank" rel="noreferrer"><img src={cand.url} alt="" loading="lazy"
                          style={{ width: '100%', maxHeight: 380, objectFit: 'contain', background: '#fff', border: '1px solid #94a3b8', borderRadius: 6 }} /></a>
                        {chip && (
                          <div style={{ marginTop: 5 }}>
                            <span style={{ fontSize: 11.5, color: chip.colour, border: `1px solid ${chip.colour}`, borderRadius: 999, padding: '1px 9px' }}>{chip.text}</span>
                            {chip.hint && <div style={{ fontSize: 11.5, color: C.muted, marginTop: 3 }}>{chip.hint}</div>}
                            {(cand.holdReason ?? cand.note) && (
                              <div style={{ fontSize: 11.5, color: C.muted, marginTop: 3, maxHeight: 54, overflow: 'auto' }}>
                                {(cand.holdReason ?? cand.note ?? '').slice(0, 300)}
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    ) : (
                      <div style={{ fontSize: 13, color: C.muted, border: `1px dashed ${C.border}`, borderRadius: 6, padding: '24px 10px', textAlign: 'center' }}>
                        no cleaned candidate yet
                      </div>
                    )}
                  </figure>
                </div>
                {solErr[it.path] && (
                  <div style={{ fontSize: 12.5, color: '#b91c1c', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '5px 9px', marginBottom: 8 }}>
                    {solErr[it.path]}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button disabled={busy} onClick={() => solAct(it, 'approve-as-is')}
                    style={{ ...btn, color: '#fff', background: '#15803d', border: 'none' }}>✓ Approve as-is</button>
                  {cand && (
                    <button disabled={busy} onClick={() => solAct(it, 'approve-candidate')}
                      style={{ ...btn, color: '#fff', background: candidateButtonColour(cand), border: 'none' }}>
                      {candidateButtonLabel(cand)}
                    </button>
                  )}
                  <label style={{ ...btn, display: 'inline-block' }}>
                    ✍️ Amend…
                    <input type="file" accept="image/png,image/jpeg" disabled={busy} style={{ display: 'none' }}
                      onChange={(e) => { const f = e.target.files?.[0]; e.currentTarget.value = ''; if (f) amend(it, f); }} />
                  </label>
                  <button disabled={busy} onClick={() => solAct(it, 'keep-hidden')} style={btn}>🙈 Keep hidden</button>
                  <button disabled={busy} onClick={() => solAct(it, 'redraw')} style={btn}>✏️ Redraw</button>
                </div>
              </div>
            );
          })}
        </>
      )}

      {tab === 'fitness' && (
        <>
          <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '8px 12px', marginBottom: 10, fontSize: 13.5 }}>
            <strong>{fitTotals.held} question figures</strong>{fitSent ? ' already sent to repair' : ' still need a look'} —
            {fitTotals.blocking} rated as blocking answering, {fitTotals.cosmetic} cosmetic.
            {fitTotals.sentToRepair > 0 && (
              <button onClick={() => { setFitSent((v) => !v); setPage(0); }}
                style={{ marginLeft: 8, fontSize: 12.5, fontWeight: 700, color: '#0369a1', background: '#fff',
                  border: '1px solid #bfdbfe', borderRadius: 999, padding: '2px 10px', cursor: 'pointer' }}>
                {fitSent ? '← back to the queue' : `🛠 ${fitTotals.sentToRepair} sent to repair`}
              </button>
            )}
            <div style={{ marginTop: 4, color: C.muted }}>
              These are held, not open, so the questions keep serving while you look. <em>Hide from
              students</em> withdraws the question from the kiosk and practice pools until the figure
              is repaired. <em>Figure is fine</em> keeps it serving and closes the row. <em>Send to
              repair</em> leaves the figure exactly as held — still blocked, still serving the
              question — and moves the row out of this queue onto the 🛠 list above.
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            <span style={{ fontSize: 13, color: C.muted }}>page {page + 1} / {lastPage + 1}</span>
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              <button disabled={page === 0 || loading} onClick={() => { setPage((p) => Math.max(0, p - 1)); window.scrollTo({ top: 0 }); }}
                style={{ fontSize: 13, border: `1px solid ${C.border}`, background: '#fff', borderRadius: 8, padding: '4px 12px', cursor: 'pointer', opacity: page === 0 ? 0.4 : 1 }}>← Prev</button>
              <button disabled={page >= lastPage || loading} onClick={() => { setPage((p) => p + 1); window.scrollTo({ top: 0 }); }}
                style={{ fontSize: 13, border: `1px solid ${C.border}`, background: '#fff', borderRadius: 8, padding: '4px 12px', cursor: 'pointer', opacity: page >= lastPage ? 0.4 : 1 }}>Next →</button>
            </span>
          </div>
          {!loading && fits.length === 0 && (
            <div style={{ color: C.muted, fontSize: 14, padding: 20, textAlign: 'center' }}>{fitSent ? 'Nothing sent to repair yet.' : 'Nothing held — every fitness flag has been judged.'}</div>
          )}
          {fits.map((it) => {
            const busy = fitBusy === it.path;
            const chip = severityChip(it);
            const btn = {
              fontSize: 13, fontWeight: 600, border: `1px solid ${C.border}`, background: '#fff',
              color: '#111', borderRadius: 8, padding: '6px 12px', cursor: busy ? 'default' : 'pointer',
              opacity: busy ? 0.5 : 1,
            } as const;
            return (
              <div key={it.path} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 10, marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', fontSize: 13.5, marginBottom: 6 }}>
                  <strong>
                    {it.level ?? '?'} · {it.school ?? '?'} {it.year ?? ''}
                    {it.paper ? ` P${it.paper}` : ''}{it.qnum ? ` Q${it.qnum}` : ''}
                  </strong>
                  <span style={{ fontSize: 11.5, color: chip.colour, background: chip.bg, border: `1px solid ${chip.colour}`, borderRadius: 999, padding: '1px 9px' }}>{chip.text}</span>
                  {it.verdict && <span style={{ color: '#0369a1', fontSize: 12.5 }}>{it.verdict}</span>}
                  <a href={`/admin/questions?id=${it.qid}`} target="_blank" rel="noreferrer"
                    style={{ marginLeft: 'auto', fontSize: 12.5, border: `1px solid ${C.border}`, borderRadius: 8, padding: '3px 10px', textDecoration: 'none', color: '#111' }}>Open question ↗</a>
                </div>
                <figure style={{ margin: '0 0 8px' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <a href={it.figureUrl} target="_blank" rel="noreferrer" title="open full size"><img src={it.figureUrl} alt="" loading="lazy"
                    style={{ width: '100%', maxHeight: 340, objectFit: 'contain', background: '#fff', border: '1px solid #94a3b8', borderRadius: 6 }} /></a>
                </figure>
                {it.stem && (
                  <div style={{ fontSize: 12.5, color: '#374151', background: '#f8fafc', border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 9px', marginBottom: 8, maxHeight: 92, overflow: 'auto' }}>
                    {it.stem}
                  </div>
                )}
                {it.note && (
                  <div style={{ fontSize: 12, color: C.muted, marginBottom: 8, maxHeight: 60, overflow: 'auto' }}>{it.note}</div>
                )}
                {fitErr[it.path] && (
                  <div style={{ fontSize: 12.5, color: '#b91c1c', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '5px 9px', marginBottom: 8 }}>
                    {fitErr[it.path]}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button disabled={busy}
                    onClick={() => { if (window.confirm('This withdraws the whole question from practice and the kiosk until the figure is repaired. Continue?')) fitAct(it, 'hide'); }}
                    title="Withdraws this question from the kiosk, portal practice and print until the figure is repaired."
                    style={{ ...btn, color: '#fff', background: C.flag, border: 'none' }}>🙈 Hide from students</button>
                  <button disabled={busy} onClick={() => fitAct(it, 'accept')}
                    style={{ ...btn, color: '#fff', background: '#15803d', border: 'none' }}>✓ Figure is fine</button>
                  <button disabled={busy} onClick={() => fitAct(it, 'repair')} style={btn}>🛠 Send to repair</button>
                </div>
              </div>
            );
          })}
        </>
      )}

      <div style={{ display: tab === 'all' ? 'grid' : 'none', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
        {items.map((it) => (
          <div key={it.path}
            style={{ background: C.card, border: `2px solid ${it.flagged ? C.flag : C.border}`, borderRadius: 10, overflow: 'hidden', position: 'relative' }}>
            <button onClick={() => toggle(it)}
              style={{ display: 'block', width: '100%', border: 'none', background: it.flagged ? C.flagBg : '#fff', padding: 0, cursor: 'pointer' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={it.thumb} alt="" loading="lazy"
                onError={(e) => { const im = e.currentTarget; if (im.src !== it.url) im.src = it.url; }}
                style={{ width: '100%', height: 120, objectFit: 'contain', background: '#fff' }} />
            </button>
            <div style={{ position: 'absolute', top: 4, right: 4, fontSize: 16 }}>{it.flagged ? '🚩' : ''}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 6px', fontSize: 11, color: C.muted }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {it.school ?? '?'} {it.year ?? ''}{it.level ? ` · ${it.level}` : ''}{it.qnum ? ` · Q${it.qnum}` : ''}
              </span>
              <a href={`/admin/questions?id=${it.qid}`} target="_blank" rel="noreferrer"
                style={{ marginLeft: 'auto', textDecoration: 'none' }}>↗</a>
            </div>
          </div>
        ))}
      </div>

      {tab === 'all' && !loading && items.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 14 }}>
          <button disabled={page === 0} onClick={() => { setPage((p) => Math.max(0, p - 1)); window.scrollTo({ top: 0 }); }}
            style={{ fontSize: 14, border: `1px solid ${C.border}`, background: '#fff', borderRadius: 8, padding: '8px 18px', cursor: 'pointer', opacity: page === 0 ? 0.4 : 1 }}>← Prev</button>
          <button disabled={page >= lastPage} onClick={() => { setPage((p) => p + 1); window.scrollTo({ top: 0 }); }}
            style={{ fontSize: 14, fontWeight: 600, color: '#fff', background: C.navy, border: 'none', borderRadius: 8, padding: '8px 18px', cursor: 'pointer', opacity: page >= lastPage ? 0.4 : 1 }}>Next page →</button>
        </div>
      )}
    </main>
  );
}
