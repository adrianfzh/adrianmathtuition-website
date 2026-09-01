'use client';
// /admin/figures-bank — eyeball EVERY bank figure and flag the ones needing work.
// A paginated thumbnail grid (pre-built 320px thumbs, full image as fallback);
// tapping a figure toggles its 🚩 flag (Supabase figure_flags via
// /api/admin/figures-bank). The Flagged tab is the work queue — each card
// deep-links into /admin/questions?id= where the ♻️ Replace button lives.
// Progress resumes: last page is remembered per level filter (localStorage).

import { useState, useEffect, useCallback } from 'react';
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
};

const LEVELS = ['', 'AM', 'EM', 'EM_NA', 'S1', 'S2', 'S3_AM', 'S3_EM', 'S3_EM_NA', 'JC1', 'JC2'];
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
  const [tab, setTab] = useState<'all' | 'flagged'>('all');
  // ?flagged=1 opens the review directly — the tab buttons are easy to miss,
  // and a link is something that can be sent.
  useEffect(() => {
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('flagged') === '1') {
      setTab('flagged'); setPage(0);
    }
  }, []);
  const goTab = (t: 'all' | 'flagged') => {
    setTab(t); setPage(0);
    if (typeof window !== 'undefined') {
      const u = new URL(window.location.href);
      if (t === 'flagged') u.searchParams.set('flagged', '1'); else u.searchParams.delete('flagged');
      window.history.replaceState(null, '', u.toString());
    }
  };
  const [loading, setLoading] = useState(false);

  useEffect(() => { ensureAdminSession().then(setAuthed); }, []);
  useEffect(() => {
    const saved = Number(localStorage.getItem(lsKey(level)) ?? 0);
    setPage(Number.isFinite(saved) ? saved : 0);
  }, [level]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = tab === 'flagged'
        ? `flagged=1&page=${page}&pageSize=20`
        : `page=${page}&pageSize=${pageSize}${level ? `&level=${level}` : ''}`;
      const r = await fetch(`/api/admin/figures-bank?${qs}`);
      const d = await r.json();
      if (d.error) return;
      setItems(d.items ?? []);
      if (tab === 'all') {
        setTotalQuestions(d.totalQuestions ?? 0);
        setFlaggedCount(d.flaggedCount ?? 0);
        if (typeof d.withheld === 'number') setWithheld(d.withheld);
        localStorage.setItem(lsKey(level), String(page));
      }
    } finally { setLoading(false); }
  }, [tab, page, pageSize, level]);
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
  const isQuiet = (it: Item) => !!it.checks && chipsFor(it).length === 0;

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
  const lastPage = tab === 'flagged'
    ? Math.max(0, Math.ceil((withheld || flaggedCount) / FLAG_PAGE) - 1)
    : Math.max(0, Math.ceil(totalQuestions / pageSize) - 1);
  return (
    <main style={{ minHeight: '100vh', background: C.bg, padding: '14px 12px 80px', maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700 }}>🖼 Figure Review</h1>
        <span style={{ color: C.muted, fontSize: 13 }}>
          {tab === 'all' ? 'tap a figure to flag it for rectification' : 'each figure with its question and what the checks found'}
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
            return (
              <>
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

      <div style={{ display: tab === 'flagged' ? 'none' : 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
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
