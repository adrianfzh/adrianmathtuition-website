'use client';

import { useState, useEffect } from 'react';
import { ensureAdminSession, loginAdminSession } from '@/lib/admin-client';

type Status = {
  todos: { open: number; items: string[] };
  myTodos?: { open: number; overdue: number };
  invoices: { unpaid: number; owed: number };
  students: number;
  bot: { weekQuestions: number };
};

export default function StatusPage() {
  const [password, setPassword] = useState('');
  const [authed, setAuthed] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [s, setS] = useState<Status | null>(null);

  useEffect(() => {
    if (!authed) return;
    fetch('/api/admin/status')
      .then((r) => r.json()).then(setS).catch(() => {});
  }, [authed]);
  useEffect(() => { ensureAdminSession().then((ok) => { if (ok) setAuthed(true); }); }, []);

  async function verify(pw: string) {
    setAuthLoading(true);
    try {
      const ok = await loginAdminSession(pw);
      if (ok) setAuthed(true); else setAuthError('Incorrect password');
    } catch { setAuthError('Connection error'); } finally { setAuthLoading(false); }
  }

  if (!authed) {
    return (
      <div style={{ minHeight: '100vh', background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <div style={{ width: '100%', maxWidth: 360, background: '#fff', borderRadius: 20, border: '1px solid #e5e7eb', padding: '32px 28px', textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📊</div>
          <h1 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px', color: '#111' }}>Status</h1>
          <p style={{ fontSize: 13, color: '#9ca3af', margin: '0 0 24px' }}>Admin password required</p>
          <form onSubmit={(e) => { e.preventDefault(); setAuthError(''); verify(password); }}>
            <input type="password" value={password} onChange={(e) => { setPassword(e.target.value); setAuthError(''); }} placeholder="Admin password" autoFocus
              style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 10, padding: '12px 16px', fontSize: 15, boxSizing: 'border-box', marginBottom: 10 }} />
            {authError && <p style={{ fontSize: 13, color: '#ef4444', marginBottom: 10 }}>{authError}</p>}
            <button type="submit" disabled={authLoading || !password} style={{ width: '100%', background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: 10, padding: '13px 0', fontSize: 15, fontWeight: 600, cursor: 'pointer', opacity: authLoading || !password ? 0.45 : 1 }}>{authLoading ? 'Checking…' : 'Enter'}</button>
          </form>
        </div>
      </div>
    );
  }

  const card = (label: string, value: React.ReactNode, sub?: string, href?: string) => {
    const inner = (
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: 18, height: '100%' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#8a93a0', textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
        <div style={{ fontSize: 30, fontWeight: 800, color: '#13203a', margin: '6px 0 2px' }}>{value}</div>
        {sub && <div style={{ fontSize: 13, color: '#6b7280' }}>{sub}</div>}
      </div>
    );
    return href ? <a href={href} style={{ textDecoration: 'none' }}>{inner}</a> : inner;
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f3f4f6', padding: '24px 16px' }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <a href="/admin" style={{ textDecoration: 'none', color: '#6b7280', fontSize: 14, fontWeight: 600 }}>‹ Admin</a>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: '#111' }}>📊 At a glance</h1>
        </div>

        {!s ? <p style={{ color: '#9ca3af', fontSize: 14 }}>Loading…</p> : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
              {card('My to-dos', s.myTodos?.open ?? 0, s.myTodos?.overdue ? `${s.myTodos.overdue} overdue` : 'personal list', '/admin/my-todos')}
              {card('Loop tasks', s.todos.open, 'build-test-fix loop', '/admin/todo')}
              {card('Unpaid invoices', s.invoices.unpaid, `$${s.invoices.owed} outstanding`, '/admin/invoices')}
              {card('Students', s.students, 'active profiles', '/admin/students')}
              {card('Bot questions', s.bot.weekQuestions, 'last 7 days', '/admin/bot')}
            </div>

            {s.todos.items.length > 0 && (
              <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: 18 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#8a93a0', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>Next up</div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, color: '#374151', lineHeight: 1.7 }}>
                  {s.todos.items.map((t, i) => <li key={i}>{t}</li>)}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
