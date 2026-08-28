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
  const [level, setLevel] = useState('');
  const [tab, setTab] = useState<'all' | 'flagged'>('all');
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
        ? 'flagged=1'
        : `page=${page}&pageSize=${pageSize}${level ? `&level=${level}` : ''}`;
      const r = await fetch(`/api/admin/figures-bank?${qs}`);
      const d = await r.json();
      if (d.error) return;
      setItems(d.items ?? []);
      if (tab === 'all') {
        setTotalQuestions(d.totalQuestions ?? 0);
        setFlaggedCount(d.flaggedCount ?? 0);
        localStorage.setItem(lsKey(level), String(page));
      }
    } finally { setLoading(false); }
  }, [tab, page, pageSize, level]);
  useEffect(() => { if (authed) load(); }, [authed, load]);

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

  const lastPage = Math.max(0, Math.ceil(totalQuestions / pageSize) - 1);
  return (
    <main style={{ minHeight: '100vh', background: C.bg, padding: '14px 12px 80px', maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700 }}>🖼 Figure Review</h1>
        <span style={{ color: C.muted, fontSize: 13 }}>tap a figure to flag it for rectification</span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button onClick={() => setTab('all')}
            style={{ fontSize: 13, fontWeight: tab === 'all' ? 700 : 400, border: `1px solid ${C.border}`, background: tab === 'all' ? '#fff' : 'transparent', borderRadius: 8, padding: '4px 10px', cursor: 'pointer' }}>
            All
          </button>
          <button onClick={() => setTab('flagged')}
            style={{ fontSize: 13, fontWeight: tab === 'flagged' ? 700 : 400, color: C.flag, border: `1px solid ${tab === 'flagged' ? C.flag : C.border}`, background: tab === 'flagged' ? C.flagBg : 'transparent', borderRadius: 8, padding: '4px 10px', cursor: 'pointer' }}>
            🚩 Flagged{flaggedCount ? ` (${flaggedCount})` : ''}
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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
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
