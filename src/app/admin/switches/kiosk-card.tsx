'use client';

// The kiosk switch on /admin/switches (5 Oct 2026 — was its own page, /admin/kiosk,
// which now redirects to /admin/switches#kiosk). Closed (default) / Open now (force
// on) / Scheduled (auto by opening hours). Same route as before: /api/kiosk/status.

import { useCallback, useEffect, useState } from 'react';

type Mode = 'closed' | 'open' | 'scheduled';
type Status = { mode: Mode; open: boolean; nextOpen: string | null; hoursSummary: string };

const OPTIONS: { key: Mode; label: string; sub: string }[] = [
  { key: 'closed', label: 'Closed', sub: 'Off for students' },
  { key: 'open', label: 'Open now', sub: 'On until you change it' },
  { key: 'scheduled', label: 'Scheduled', sub: 'By opening hours' },
];

export default function KioskCard() {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/kiosk/status', { cache: 'no-store' });
      if (!r.ok) throw new Error('Could not read the kiosk switch');
      setStatus(await r.json());
      setErr('');
    } catch (e) { setErr(e instanceof Error ? e.message : 'Error'); }
  }, []);

  useEffect(() => { load(); }, [load]);

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
  const liveOpen = status ? (mode === 'open' ? true : mode === 'closed' ? false : status.open) : null;

  return (
    <section id="kiosk" className="bg-white rounded-xl shadow-sm p-4 scroll-mt-4" data-section="kiosk">
      <h2 className="text-xs font-bold uppercase tracking-wide text-neutral-500">Kiosk</h2>
      {status ? (
        <>
          <div className="text-sm font-semibold mt-1" style={{ color: liveOpen ? '#166534' : '#991b1b' }} data-kiosk-open={liveOpen ? 'yes' : 'no'}>
            {liveOpen ? 'Students can use the kiosk now' : 'Closed to students now'}
            {mode === 'scheduled' && status.nextOpen && !liveOpen ? ` · opens ${status.nextOpen}` : ''}
          </div>
          <div className="grid grid-cols-3 gap-2 mt-3">
            {OPTIONS.map(o => (
              <button
                key={o.key} type="button" onClick={() => setMode(o.key)} disabled={busy || mode === o.key}
                className="rounded-lg px-2 py-2 text-left border"
                style={{
                  borderColor: mode === o.key ? '#1c3a5e' : '#e5e7eb',
                  background: mode === o.key ? '#1c3a5e' : '#fff',
                  color: mode === o.key ? '#fff' : '#1c3a5e',
                  opacity: busy && mode !== o.key ? 0.6 : 1,
                }}
              >
                <div className="text-sm font-semibold">{o.label}</div>
                <div className="text-xs" style={{ opacity: 0.8 }}>{o.sub}</div>
              </button>
            ))}
          </div>
          <p className="text-xs text-neutral-400 mt-2">Opening hours (Scheduled): {status.hoursSummary}. You always have full access as admin.</p>
        </>
      ) : !err && <div className="text-sm text-neutral-400 mt-2">Loading…</div>}
      {err && <div className="text-sm text-red-700 mt-2">{err}</div>}
    </section>
  );
}
