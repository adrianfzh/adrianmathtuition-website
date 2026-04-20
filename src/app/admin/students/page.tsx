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

      <div style={{ maxWidth: 620, margin: '0 auto', padding: '32px 16px', textAlign: 'center' }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>🎓</div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#111', margin: '0 0 12px' }}>Coming soon</h2>
        <p style={{ fontSize: 14, color: '#6b7280', maxWidth: 380, margin: '0 auto 32px', lineHeight: 1.6 }}>
          Student records, enrollment management, and bulk actions will live here.
          For now, edit students directly in Airtable.
        </p>
        <a href={AIRTABLE_URL} target="_blank" rel="noopener noreferrer"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#1e3a5f', color: '#fff', textDecoration: 'none', borderRadius: 12, padding: '14px 24px', fontSize: 15, fontWeight: 600 }}>
          Open Airtable Students table ↗
        </a>
      </div>
    </div>
  );
}
