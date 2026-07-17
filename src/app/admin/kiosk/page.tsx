'use client';
// /admin/kiosk — master switch for the in-centre kiosk (/kiosk).
// Closed (default) / Open (force on) / Scheduled (auto by opening hours).
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ensureAdminSession, loginAdminSession } from '@/lib/admin-client';

type Mode = 'closed' | 'open' | 'scheduled';
type Status = { mode: Mode; open: boolean; nextOpen: string | null; hoursSummary: string };

const OPTIONS: { key: Mode; label: string; sub: string; emoji: string }[] = [
  { key: 'closed', label: 'Closed', sub: 'Kiosk off for students', emoji: '🔒' },
  { key: 'open', label: 'Open now', sub: 'On until you change it', emoji: '✅' },
  { key: 'scheduled', label: 'Scheduled', sub: 'Auto by opening hours', emoji: '🕒' },
];

export default function KioskAdminPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  // authed: null = checking, false = show password form, true = show controls.
  // The page previously skipped the login form entirely, so a device without an
  // admin session (e.g. the iPad) just saw "Unauthorized" on every tap.
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [pw, setPw] = useState('');
  const [pwErr, setPwErr] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/kiosk/status');
      if (!r.ok) throw new Error('Could not load status');
      setStatus(await r.json());
    } catch (e) { setErr(e instanceof Error ? e.message : 'Error'); }
  }, []);

  useEffect(() => {
    ensureAdminSession().then(ok => {
      setAuthed(ok);
      if (ok) load();
    });
  }, [load]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setPwErr('');
    const ok = await loginAdminSession(pw);
    if (ok) { setAuthed(true); setPw(''); load(); }
    else setPwErr('Incorrect password');
  }

  async function setMode(mode: Mode) {
    setBusy(true); setErr('');
    try {
      const r = await fetch('/api/kiosk/status', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Failed');
      await load();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Error'); }
    finally { setBusy(false); }
  }

  const mode = status?.mode;
  // What students see right now, given the mode + hours.
  const liveOpen = status
    ? (mode === 'open' ? true : mode === 'closed' ? false : status.open)
    : null;

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ color: '#1c3a5e', fontSize: 22, fontWeight: 800, margin: 0 }}>Kiosk control</h1>
        <Link href="/admin" style={{ color: '#8a97a8', fontSize: 14, textDecoration: 'none' }}>‹ Admin</Link>
      </div>

      {authed === false && (
        <form onSubmit={handleLogin} style={{ display: 'grid', gap: 10, maxWidth: 360 }}>
          <p style={{ color: '#5a6b7d', fontSize: 14, margin: 0 }}>Enter the admin password to control the kiosk on this device.</p>
          <input type="password" value={pw} onChange={e => { setPw(e.target.value); setPwErr(''); }}
            placeholder="Admin password" autoFocus
            style={{ borderRadius: 10, border: '1px solid #d9d2bf', padding: '12px 14px', fontSize: 16 }} />
          {pwErr && <div style={{ color: '#c0392b', fontSize: 13 }}>{pwErr}</div>}
          <button type="submit" disabled={!pw}
            style={{ borderRadius: 10, border: 'none', background: '#1c3a5e', color: '#fff', padding: '12px 14px', fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>
            Enter
          </button>
        </form>
      )}

      {authed !== true ? null : (
      <>
      {status && (
        <div style={{
          borderRadius: 14, padding: '14px 16px', marginBottom: 18, fontSize: 15, fontWeight: 600,
          background: liveOpen ? '#e9f7f0' : '#fdeef0', color: liveOpen ? '#186a4c' : '#8a2f3b',
          border: `1px solid ${liveOpen ? '#bfe6d4' : '#f3c2c9'}`,
        }}>
          {liveOpen ? '● Students can use the kiosk right now' : '○ Kiosk is closed to students right now'}
          {mode === 'scheduled' && status.nextOpen && !liveOpen && <> — opens {status.nextOpen}</>}
        </div>
      )}

      <div style={{ display: 'grid', gap: 10 }}>
        {OPTIONS.map(o => (
          <button key={o.key} onClick={() => setMode(o.key)} disabled={busy || mode === o.key}
            style={{
              display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', cursor: 'pointer',
              borderRadius: 14, padding: '14px 16px', fontSize: 16,
              border: `2px solid ${mode === o.key ? '#1c3a5e' : '#e3ddcc'}`,
              background: mode === o.key ? '#1c3a5e' : '#fff',
              color: mode === o.key ? '#fff' : '#1c3a5e',
            }}>
            <span style={{ fontSize: 24 }}>{o.emoji}</span>
            <span>
              <div style={{ fontWeight: 700 }}>{o.label}{mode === o.key ? ' ✓' : ''}</div>
              <div style={{ fontSize: 13, opacity: 0.8 }}>{o.sub}</div>
            </span>
          </button>
        ))}
      </div>

      {status && (
        <p style={{ color: '#8a97a8', fontSize: 13, marginTop: 16, lineHeight: 1.5 }}>
          Opening hours (Scheduled mode): {status.hoursSummary}.<br />
          You always have full access as admin, even when closed.
        </p>
      )}
      {err && <p style={{ color: '#c0392b', fontSize: 14 }}>{err}</p>}
      </>
      )}
    </div>
  );
}
