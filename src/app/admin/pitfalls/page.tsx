'use client';

import { useState, useEffect, useCallback } from 'react';
import { ensureAdminSession, loginAdminSession } from '@/lib/admin-client';

// Review queue for the curated traps in Supabase `pitfalls`.
//
// One tap per row: ✓ approves (it may then reach students through practice
// feedback and the note-writing skills), ✕ rejects. Nothing else in the system
// can set that flag, so this page IS the gate — everything that reads the table
// filters status='approved'.
//
// Rejecting keeps the row (status='rejected'), it never deletes: a trap that is
// wrong today is still evidence of what the miner got wrong.

type Pitfall = {
  id: string; subject: string; topic: string; context: string;
  wrongMove: string; whyWrong: string; cue: string | null;
  source: string; status: string; createdAt: string;
};

const SOURCE_NOTE: Record<string, string> = {
  marking: 'from your own marked papers',
  'jc-notes': 'from JC lecture notes',
  notes: 'from your notes',
  mined: 'mined from notes',
  inferred: 'inferred from your working',
};

export default function PitfallsReviewPage() {
  const [password, setPassword] = useState('');
  const [authed, setAuthed] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  const [rows, setRows] = useState<Pitfall[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [bySource, setBySource] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState('');
  const [busy, setBusy] = useState<Set<string>>(new Set());

  const [status, setStatus] = useState('pending');
  const [source, setSource] = useState('');

  const load = useCallback(async (spinner = true) => {
    if (spinner) setLoading(true);
    try {
      const qs = new URLSearchParams({ status });
      if (source) qs.set('source', source);
      const r = await fetch(`/api/admin/pitfalls?${qs}`);
      const d = await r.json();
      setRows(d.rows || []);
      setCounts(d.counts || {});
      setBySource(d.bySource || {});
      setApiError(d.error || '');
    } catch { setApiError('Connection error'); }
    finally { setLoading(false); }
  }, [status, source]);

  useEffect(() => { if (authed) load(); }, [authed, load]);
  useEffect(() => { ensureAdminSession().then(ok => { if (ok) setAuthed(true); }); }, []);

  async function decide(ids: string[], next: 'approved' | 'rejected') {
    setBusy(prev => new Set([...prev, ...ids]));
    // Optimistic: the row leaves the list it no longer belongs to.
    const keep = status !== 'all' && status !== next;
    if (keep) setRows(rs => rs.filter(r => !ids.includes(r.id)));
    try {
      const r = await fetch('/api/admin/pitfalls', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, status: next }),
      });
      const d = await r.json();
      if (!r.ok) { setApiError(d.error || 'Update failed'); await load(false); }
      else {
        setCounts(c => ({
          ...c,
          [status]: Math.max(0, (c[status] || 0) - ids.length),
          [next]: (c[next] || 0) + ids.length,
        }));
        if (!keep) await load(false);
      }
    } catch { setApiError('Connection error'); await load(false); }
    finally { setBusy(prev => { const n = new Set(prev); ids.forEach(i => n.delete(i)); return n; }); }
  }

  async function doLogin(e: React.FormEvent) {
    e.preventDefault();
    setAuthLoading(true); setAuthError('');
    const ok = await loginAdminSession(password);
    if (ok) setAuthed(true); else setAuthError('Wrong password');
    setAuthLoading(false);
  }

  if (!authed) {
    return (
      <main style={{ maxWidth: 340, margin: '18vh auto', padding: 20, fontFamily: 'system-ui, sans-serif' }}>
        <h1 style={{ fontSize: 20, marginBottom: 14 }}>🎯 Trap review</h1>
        <form onSubmit={doLogin}>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)}
            placeholder="Admin password" autoFocus
            style={{ width: '100%', padding: 10, fontSize: 16, border: '1px solid #d1d5db', borderRadius: 8 }} />
          <button type="submit" disabled={authLoading}
            style={{ width: '100%', marginTop: 10, padding: 10, fontSize: 16, borderRadius: 8, border: 0, background: '#111827', color: '#fff' }}>
            {authLoading ? '…' : 'Enter'}
          </button>
          {authError && <p style={{ color: '#b91c1c', marginTop: 8 }}>{authError}</p>}
        </form>
      </main>
    );
  }

  // Group by topic so a run of related traps reads together.
  const groups: { key: string; subject: string; topic: string; items: Pitfall[] }[] = [];
  for (const r of rows) {
    const key = `${r.subject}||${r.topic}`;
    const g = groups.find(x => x.key === key);
    if (g) g.items.push(r);
    else groups.push({ key, subject: r.subject, topic: r.topic, items: [r] });
  }

  const chip = (active: boolean) => ({
    padding: '5px 11px', borderRadius: 999, fontSize: 13, cursor: 'pointer',
    border: `1px solid ${active ? '#111827' : '#d1d5db'}`,
    background: active ? '#111827' : '#fff', color: active ? '#fff' : '#374151',
  });

  return (
    <main style={{ maxWidth: 820, margin: '0 auto', padding: '18px 16px 80px', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 21, margin: '0 0 4px' }}>🎯 Trap review</h1>
      <p style={{ color: '#6b7280', fontSize: 13.5, margin: '0 0 14px', lineHeight: 1.5 }}>
        Approved traps go into portal practice feedback and can appear in notes and self-study sheets,
        in your words. Nothing else can set this — an unapproved trap never reaches a student.
      </p>

      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 10 }}>
        {['pending', 'approved', 'rejected', 'all'].map(s => (
          <button key={s} onClick={() => setStatus(s)} style={chip(status === s)}>
            {s}{counts[s] != null ? ` · ${counts[s]}` : ''}
          </button>
        ))}
      </div>

      {status === 'pending' && Object.keys(bySource).length > 0 && (
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 16 }}>
          <button onClick={() => setSource('')} style={chip(source === '')}>all sources</button>
          {Object.entries(bySource).sort((a, b) => b[1] - a[1]).map(([s, n]) => (
            <button key={s} onClick={() => setSource(s)} style={chip(source === s)}>{s} · {n}</button>
          ))}
        </div>
      )}

      {apiError && <p style={{ color: '#b91c1c' }}>{apiError}</p>}
      {loading && <p style={{ color: '#6b7280' }}>Loading…</p>}
      {!loading && rows.length === 0 && (
        <p style={{ color: '#6b7280', padding: '28px 0' }}>Nothing here — that queue is clear.</p>
      )}

      {groups.map(g => (
        <section key={g.key} style={{ marginBottom: 22 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, marginBottom: 7, flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: 15, margin: 0 }}>
              <span style={{ color: '#6b7280', fontWeight: 500 }}>{g.subject}</span>{' · '}{g.topic}
            </h2>
            {status === 'pending' && g.items.length > 1 && (
              <button
                onClick={() => decide(g.items.map(i => i.id), 'approved')}
                style={{ fontSize: 12, padding: '3px 9px', borderRadius: 7, border: '1px solid #059669', background: '#fff', color: '#059669', cursor: 'pointer' }}>
                ✓ approve all {g.items.length}
              </button>
            )}
          </div>

          {g.items.map(p => {
            const isBusy = busy.has(p.id);
            return (
              <article key={p.id} style={{
                border: '1px solid #e5e7eb', borderRadius: 11, padding: '11px 13px',
                marginBottom: 8, opacity: isBusy ? 0.45 : 1, background: '#fff',
              }}>
                <p style={{ margin: '0 0 5px', fontSize: 14.5, fontWeight: 600, lineHeight: 1.45 }}>{p.wrongMove}</p>
                {p.context && <p style={{ margin: '0 0 5px', fontSize: 12.5, color: '#6b7280' }}>When: {p.context}</p>}
                <p style={{ margin: '0 0 5px', fontSize: 13.5, color: '#374151', lineHeight: 1.5 }}>{p.whyWrong}</p>
                {p.cue && (
                  <p style={{ margin: '0 0 8px', fontSize: 13.5, lineHeight: 1.5, color: '#065f46', background: '#ecfdf5', borderRadius: 7, padding: '6px 9px' }}>
                    Say instead: {p.cue}
                  </p>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11.5, color: '#9ca3af' }}>
                    {SOURCE_NOTE[p.source] || p.source}
                    {status === 'all' ? ` · ${p.status}` : ''}
                  </span>
                  <span style={{ flex: 1 }} />
                  {p.status !== 'approved' && (
                    <button onClick={() => decide([p.id], 'approved')} disabled={isBusy}
                      style={{ padding: '6px 15px', borderRadius: 8, border: 0, background: '#059669', color: '#fff', fontSize: 14, cursor: 'pointer' }}>
                      ✓ Approve
                    </button>
                  )}
                  {p.status !== 'rejected' && (
                    <button onClick={() => decide([p.id], 'rejected')} disabled={isBusy}
                      style={{ padding: '6px 15px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', color: '#b91c1c', fontSize: 14, cursor: 'pointer' }}>
                      ✕ Reject
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </section>
      ))}
    </main>
  );
}
