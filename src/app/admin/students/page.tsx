'use client';

import { useState, useEffect, useRef } from 'react';

const AIRTABLE_URL = `https://airtable.com/appFJ43XdnrBL4LzA`;

function getCookie(name: string): string {
  if (typeof document === 'undefined') return '';
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : '';
}

function setCookie(name: string, value: string, days: number) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Strict`;
}

export default function StudentsPage() {
  const [password, setPassword]   = useState('');
  const [authed, setAuthed]       = useState(false);
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const savedPw = useRef('');
  const [students, setStudents] = useState<{ id: string; name: string; level: string; subjects: string[] }[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [levelFilter, setLevelFilter] = useState('All');

  useEffect(() => {
    if (!authed) return;
    setListLoading(true);
    fetch('/api/admin/progress/students', { headers: { Authorization: `Bearer ${savedPw.current}` } })
      .then(r => r.json())
      .then(d => setStudents(d.students || []))
      .catch(() => {})
      .finally(() => setListLoading(false));
  }, [authed]);

  useEffect(() => {
    const pw = getCookie('admin_pw') || getCookie('schedule_pw') || getCookie('progress_pw');
    if (pw) { savedPw.current = pw; verify(pw); }
  }, []);

  async function verify(pw: string) {
    setAuthLoading(true);
    try {
      const res = await fetch('/api/admin-invoices?auth=check', {
        headers: { Authorization: `Bearer ${pw}` },
      });
      if (res.ok) { savedPw.current = pw; setCookie('admin_pw', pw, 30); setAuthed(true); }
      else setAuthError('Incorrect password');
    } catch { setAuthError('Connection error'); }
    finally { setAuthLoading(false); }
  }

  if (!authed) {
    return (
      <div style={{ minHeight: '100vh', background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <div style={{ width: '100%', maxWidth: 360, background: '#fff', borderRadius: 20, border: '1px solid #e5e7eb', padding: '32px 28px', textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🎓</div>
          <h1 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px', color: '#111' }}>Students</h1>
          <p style={{ fontSize: 13, color: '#9ca3af', margin: '0 0 24px' }}>Admin password required</p>
          <form onSubmit={e => { e.preventDefault(); setAuthError(''); verify(password); }}>
            <input type="password" value={password} onChange={e => { setPassword(e.target.value); setAuthError(''); }}
              placeholder="Admin password" autoFocus disabled={authLoading}
              style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 10, padding: '12px 16px', fontSize: 15, outline: 'none', boxSizing: 'border-box', marginBottom: 10 }} />
            {authError && <p style={{ fontSize: 13, color: '#ef4444', marginBottom: 10 }}>{authError}</p>}
            <button type="submit" disabled={authLoading || !password}
              style={{ width: '100%', background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: 10, padding: '13px 0', fontSize: 15, fontWeight: 600, cursor: 'pointer', opacity: (authLoading || !password) ? 0.45 : 1 }}>
              {authLoading ? 'Checking…' : 'Enter'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f3f4f6' }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: '#fff', borderBottom: '1px solid #e5e7eb' }}>
        <div style={{ maxWidth: 620, margin: '0 auto', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <a href="/admin" style={{ color: '#9ca3af', textDecoration: 'none', fontSize: 22, lineHeight: 1, padding: 4 }}>‹</a>
          <span style={{ fontSize: 18, fontWeight: 700, color: '#111' }}>Students</span>
        </div>
      </div>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '16px' }}>
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search students…"
            style={{ flex: 1, minWidth: 180, border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 14px', fontSize: 15, outline: 'none' }} />
          <select value={levelFilter} onChange={e => setLevelFilter(e.target.value)}
            style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 12px', fontSize: 14, background: '#fff' }}>
            {['All', 'Sec 1', 'Sec 2', 'Sec 3', 'Sec 4', 'Sec 5', 'JC1', 'JC2'].map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>

        {listLoading && <div style={{ textAlign: 'center', color: '#9ca3af', padding: 40 }}>Loading…</div>}

        {!listLoading && (() => {
          const q = query.trim().toLowerCase();
          const filtered = students.filter(s =>
            (levelFilter === 'All' || s.level === levelFilter) &&
            (!q || s.name.toLowerCase().includes(q))
          );
          if (!filtered.length) return <div style={{ textAlign: 'center', color: '#9ca3af', padding: 40 }}>No students found.</div>;
          return (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
              {filtered.map(s => (
                <a key={s.id} href={`/admin/students/${s.id}`}
                  style={{ display: 'block', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '14px 16px', textDecoration: 'none', color: 'inherit' }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#111' }}>{s.name}</div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 3 }}>
                    {s.level}{Array.isArray(s.subjects) && s.subjects.length ? ` · ${s.subjects.join(', ')}` : ''}
                  </div>
                </a>
              ))}
            </div>
          );
        })()}

        <div style={{ textAlign: 'center', marginTop: 28 }}>
          <a href={AIRTABLE_URL} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 13, color: '#9ca3af', textDecoration: 'none' }}>
            Open Airtable Students table ↗
          </a>
        </div>
      </div>
    </div>
  );
}
