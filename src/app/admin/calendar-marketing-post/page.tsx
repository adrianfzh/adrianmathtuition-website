'use client';

import { useState, useEffect } from 'react';
import { MARKETING_CALENDAR, type Pillar, type MarketingPost } from '@/data/marketing-calendar';
import { ensureAdminSession, loginAdminSession } from '@/lib/admin-client';

const PILLAR_COLORS: Record<Pillar, { bg: string; fg: string }> = {
  'Teach':         { bg: '#e6f0e6', fg: '#2f6b3a' },
  'Exam-strategy': { bg: '#e7effa', fg: '#2f6cab' },
  'Reassure':      { bg: '#faf1e3', fg: '#a9772a' },
  'Proof':         { bg: '#f0e9f7', fg: '#6b47a3' },
};

function PostCard({ p }: { p: MarketingPost }) {
  const c = PILLAR_COLORS[p.pillar];
  return (
    <div style={{
      border: '1px solid #e4e4df', borderRadius: 12, padding: '14px 16px', background: '#fff',
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ background: c.bg, color: c.fg, fontWeight: 600, fontSize: 12, padding: '2px 9px', borderRadius: 999 }}>{p.pillar}</span>
        <span style={{ background: '#f2f2ef', color: '#555', fontSize: 12, padding: '2px 9px', borderRadius: 999 }}>{p.format}</span>
        <span style={{ color: '#888', fontSize: 12 }}>{p.channel}</span>
        <span style={{ marginLeft: 'auto', color: '#aaa', fontSize: 12 }}>{p.day}</span>
      </div>
      <div style={{ fontWeight: 600, fontSize: 15, color: '#16241a', lineHeight: 1.35 }}>{p.title}</div>
      <div style={{ fontSize: 13.5, color: '#444', lineHeight: 1.5 }}>{p.outline}</div>
      {p.sourceAsset && (
        <div style={{ fontSize: 12, color: '#777' }}>📎 <em>{p.sourceAsset}</em></div>
      )}
      <div style={{ fontSize: 12.5, color: '#2f6b3a', fontWeight: 500 }}>→ {p.cta}</div>
    </div>
  );
}

export default function MarketingCalendarPage() {
  const [password, setPassword] = useState('');
  const [authed, setAuthed] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  useEffect(() => {
    ensureAdminSession().then(ok => { if (ok) setAuthed(true); });
  }, []);

  async function verify(pw: string) {
    setAuthLoading(true);
    try {
      const ok = await loginAdminSession(pw);
      if (ok) setAuthed(true);
      else setAuthError('Incorrect password');
    } catch { setAuthError('Connection error'); }
    finally { setAuthLoading(false); }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setAuthError('');
    await verify(password);
  }

  if (!authed) {
    return (
      <div style={{ maxWidth: 360, margin: '80px auto', padding: 24, fontFamily: 'system-ui' }}>
        <h1 style={{ fontSize: 20, marginBottom: 16 }}>📣 Marketing Calendar</h1>
        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Admin password"
            style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #ccc', fontSize: 15 }} autoFocus />
          <button type="submit" disabled={authLoading}
            style={{ padding: '10px 12px', borderRadius: 8, border: 'none', background: '#16241a', color: '#fff', fontSize: 15, fontWeight: 600 }}>
            {authLoading ? 'Checking…' : 'Enter'}
          </button>
          {authError && <div style={{ color: '#c0392b', fontSize: 13 }}>{authError}</div>}
        </form>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '24px 16px 64px', fontFamily: 'system-ui' }}>
      {MARKETING_CALENDAR.map(month => {
        const weeks = [...new Set(month.posts.map(p => p.week))].sort((a, b) => a - b);
        return (
          <div key={month.month}>
            <h1 style={{ fontSize: 24, color: '#16241a', marginBottom: 4 }}>📣 {month.month}</h1>
            <p style={{ fontSize: 13, color: '#777', marginTop: 0, marginBottom: 8, lineHeight: 1.5 }}>{month.seasonNote}</p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12, color: '#888', marginBottom: 20 }}>
              {(Object.keys(PILLAR_COLORS) as Pillar[]).map(k => (
                <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: PILLAR_COLORS[k].fg, display: 'inline-block' }} />
                  {k}
                </span>
              ))}
            </div>
            {weeks.map(w => (
              <div key={w} style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
                  Week {w}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {month.posts.filter(p => p.week === w).map(p => <PostCard key={p.id} p={p} />)}
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
