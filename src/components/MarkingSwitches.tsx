'use client';
// ⚙ The marking switches in one place (17 Sep 2026, SPEC-STUDENT-FIRST §5):
// 🖥 Mac plan only · 🧪 Science tab for students · ⏻ the Mac slots by account.
// Self-contained: reads /api/admin/marking-settings and /api/admin/slot-accounts
// with the admin session cookie, flips them through the same POSTs the
// /admin/mark-paper cards use. Rendered in the desk's Settings drawer.
import { useEffect, useState } from 'react';

type Switch = { on: boolean; by?: string | null; at?: string | null };
type Slot = { email: string; label: string; key: string; on: boolean; at?: string | null; by?: string | null };

export default function MarkingSwitches() {
  const [macOnly, setMacOnly] = useState<Switch | null>(null);
  const [science, setScience] = useState<Switch | null>(null);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    try {
      const [a, b] = await Promise.all([fetch('/api/admin/marking-settings').then(r => r.json()), fetch('/api/admin/slot-accounts').then(r => r.json())]);
      setMacOnly(a?.macOnly ?? null); setScience(a?.scienceOpen ?? null); setSlots(Array.isArray(b?.accounts) ? b.accounts : []);
    } catch { setErr('Could not read the switches.'); }
  }
  useEffect(() => { load(); }, []);

  async function post(url: string, body: Record<string, unknown>, key: string) {
    setBusy(key); setErr(null);
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(d.error || 'Could not flip the switch.'); return; }
      await load();
    } catch { setErr('Network error.'); }
    finally { setBusy(null); }
  }

  const row = (label: string, sub: string, on: boolean | null, key: string, flip: () => void) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{label}{on ? ' — ON' : ''}</div>
        <div style={{ fontSize: 12, color: '#64748b' }}>{sub}</div>
      </div>
      <button type="button" role="switch" aria-checked={!!on} disabled={on === null || busy === key} onClick={flip}
        style={{ width: 46, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer', background: on ? '#16a34a' : '#cbd5e1', position: 'relative', opacity: busy === key ? 0.6 : 1 }}>
        <span style={{ position: 'absolute', top: 3, left: on ? 23 : 3, width: 20, height: 20, borderRadius: 10, background: '#fff', transition: 'left .15s' }} />
      </button>
    </div>
  );

  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '4px 14px 8px' }} data-marking-switches>
      {row('🖥 Mac plan only', 'ON: every paper waits for a Mac slot; nothing goes to the API.', macOnly?.on ?? null, 'mac', () => post('/api/admin/marking-settings', { macOnly: !macOnly?.on }, 'mac'))}
      {row('🧪 Science tab for students', 'ON: every student sees the Science tab and free science marking.', science?.on ?? null, 'sci', () => post('/api/admin/marking-settings', { scienceOpen: !science?.on }, 'sci'))}
      {(slots ?? []).map(s => row(`⏻ ${s.label}`, s.email, s.on, s.key, () => post('/api/admin/slot-accounts', { email: s.email, on: !s.on }, s.key)))}
      {slots && slots.length === 0 && <div style={{ fontSize: 12, color: '#94a3b8', padding: '8px 0' }}>No slot accounts recorded.</div>}
      {err && <div style={{ fontSize: 12, color: '#b91c1c', paddingTop: 6 }}>{err}</div>}
    </div>
  );
}
