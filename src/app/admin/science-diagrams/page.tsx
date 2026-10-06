'use client';

import { useState, useEffect, useCallback } from 'react';
import { ensureAdminSession, loginAdminSession } from '@/lib/admin-client';

// 🔬 Science pictures — the review page for the curated picture library.
//
// The bot can send one of these pictures after a science answer (a cell, a
// distillation set-up, a circuit). Students only get a picture approved here;
// drawn graphs need no approval. One tap per picture: ✓ for students / ✕ hide.
// Nothing is deleted — a hidden picture stays available to you.

type Diagram = {
  id: string; name: string; subject: string; topic: string | null; kind: string;
  keywords: string | null; image_url: string; source: string | null;
  is_published: boolean; student_ok: boolean; reviewed_at: string | null;
};

const SUBJECTS = ['all', 'biology', 'chemistry', 'physics'];

export default function ScienceDiagramsPage() {
  const [password, setPassword] = useState('');
  const [authed, setAuthed] = useState(false);
  const [authError, setAuthError] = useState('');
  const [rows, setRows] = useState<Diagram[]>([]);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState('');
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [subject, setSubject] = useState('all');
  const [view, setView] = useState<'to-review' | 'approved' | 'all'>('to-review');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/admin/science-diagrams');
      const d = await r.json();
      setRows(d.rows || []);
      setApiError(d.error || '');
    } catch { setApiError('Connection error'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { ensureAdminSession().then(ok => { if (ok) setAuthed(true); }); }, []);
  useEffect(() => { if (authed) load(); }, [authed, load]);

  async function decide(ids: string[], studentOk: boolean) {
    setBusy(prev => new Set([...prev, ...ids]));
    setRows(rs => rs.map(r => ids.includes(r.id) ? { ...r, student_ok: studentOk, reviewed_at: new Date().toISOString() } : r));
    try {
      const r = await fetch('/api/admin/science-diagrams', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, studentOk }),
      });
      if (!r.ok) { const d = await r.json().catch(() => ({})); setApiError(d.error || 'Update failed'); await load(); }
    } catch { setApiError('Connection error'); await load(); }
    finally { setBusy(prev => { const n = new Set(prev); ids.forEach(i => n.delete(i)); return n; }); }
  }

  async function doLogin(e: React.FormEvent) {
    e.preventDefault();
    const ok = await loginAdminSession(password);
    if (ok) setAuthed(true); else setAuthError('Wrong password');
  }

  if (!authed) {
    return (
      <main style={{ maxWidth: 340, margin: '18vh auto', padding: 20, fontFamily: 'system-ui, sans-serif' }}>
        <h1 style={{ fontSize: 20, marginBottom: 14 }}>🔬 Science pictures</h1>
        <form onSubmit={doLogin}>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Admin password" autoFocus
            style={{ width: '100%', padding: 10, fontSize: 16, border: '1px solid #d1d5db', borderRadius: 8 }} />
          <button type="submit" style={{ width: '100%', marginTop: 10, padding: 10, fontSize: 16, borderRadius: 8, border: 0, background: '#111827', color: '#fff' }}>Enter</button>
          {authError && <p style={{ color: '#b91c1c', marginTop: 8 }}>{authError}</p>}
        </form>
      </main>
    );
  }

  const usable = rows.filter(r => r.is_published);
  const shown = usable
    .filter(r => subject === 'all' || r.subject === subject)
    .filter(r => view === 'all' || (view === 'approved' ? r.student_ok : !r.reviewed_at));
  const approved = usable.filter(r => r.student_ok).length;
  const toReview = usable.filter(r => !r.reviewed_at).length;
  const chip = (active: boolean) => ({
    padding: '5px 11px', borderRadius: 999, fontSize: 13, cursor: 'pointer',
    border: `1px solid ${active ? '#111827' : '#d1d5db'}`, background: active ? '#111827' : '#fff', color: active ? '#fff' : '#374151',
  });

  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: '18px 16px 80px', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 21, margin: '0 0 4px' }}>🔬 Science pictures</h1>
      <p style={{ color: '#6b7280', fontSize: 13.5, margin: '0 0 12px', lineHeight: 1.5 }}>
        After a science answer, the bot can send one of these pictures. Students only get the ones you approve.
        Check the labels are the O-Level words. {approved} of {usable.length} approved · {toReview} to review.
      </p>
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 8 }}>
        {(['to-review', 'approved', 'all'] as const).map(v => (
          <button key={v} onClick={() => setView(v)} style={chip(view === v)}>{v.replace('-', ' ')}</button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 16 }}>
        {SUBJECTS.map(s => <button key={s} onClick={() => setSubject(s)} style={chip(subject === s)}>{s}</button>)}
      </div>
      {apiError && <p style={{ color: '#b91c1c' }}>{apiError}</p>}
      {loading && <p style={{ color: '#6b7280' }}>Loading…</p>}
      {!loading && shown.length === 0 && <p style={{ color: '#6b7280', padding: '28px 0' }}>Nothing here — that list is clear.</p>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
        {shown.map(d => {
          const isBusy = busy.has(d.id);
          return (
            <article key={d.id} style={{ border: `1px solid ${d.student_ok ? '#059669' : '#e5e7eb'}`, borderRadius: 11, padding: 10, background: '#fff', opacity: isBusy ? 0.5 : 1, display: 'flex', flexDirection: 'column' }}>
              <a href={d.image_url} target="_blank" rel="noreferrer" style={{ display: 'block', background: '#f9fafb', borderRadius: 8, marginBottom: 8 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={d.image_url} alt={d.name} style={{ width: '100%', height: 200, objectFit: 'contain' }} />
              </a>
              <p style={{ margin: '0 0 3px', fontSize: 14, fontWeight: 600, lineHeight: 1.35 }}>{d.name}</p>
              <p style={{ margin: '0 0 8px', fontSize: 12, color: '#6b7280' }}>{d.subject}{d.topic ? ` · ${d.topic}` : ''}</p>
              <span style={{ flex: 1 }} />
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {d.student_ok
                  ? <span style={{ fontSize: 13, color: '#059669', fontWeight: 600 }}>✓ For students</span>
                  : d.reviewed_at ? <span style={{ fontSize: 13, color: '#6b7280' }}>Hidden</span> : null}
                <span style={{ flex: 1 }} />
                {!d.student_ok && (
                  <button onClick={() => decide([d.id], true)} disabled={isBusy}
                    style={{ padding: '6px 13px', borderRadius: 8, border: 0, background: '#059669', color: '#fff', fontSize: 14, cursor: 'pointer' }}>✓ Approve</button>
                )}
                {(d.student_ok || !d.reviewed_at) && (
                  <button onClick={() => decide([d.id], false)} disabled={isBusy}
                    style={{ padding: '6px 13px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', color: '#b91c1c', fontSize: 14, cursor: 'pointer' }}>✕ Hide</button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </main>
  );
}
