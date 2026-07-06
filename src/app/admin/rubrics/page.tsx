'use client';

import { useState, useEffect } from 'react';
import { ensureAdminSession, loginAdminSession } from '@/lib/admin-client';

type Descriptor = { band: number; range: string; text: string };
type Criterion = { name: string; maxMarks: number; descriptors: Descriptor[] };
type Rubric = {
  id: string; level: string; subject: string; paper: string; essay_type: string | null;
  criteria: Criterion[]; grading_notes: string | null; out_of: number | null;
};

export default function RubricsPage() {
  const [password, setPassword] = useState('');
  const [authed, setAuthed] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  const [rubrics, setRubrics] = useState<Rubric[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [savedMsg, setSavedMsg] = useState<Record<string, string>>({});

  async function load() {
    const r = await fetch('/api/admin/rubrics');
    const d = await r.json();
    setRubrics(d.rubrics || []);
    setCanEdit(!!d.canEdit);
    setNotes(Object.fromEntries((d.rubrics || []).map((x: Rubric) => [x.id, x.grading_notes || ''])));
  }
  useEffect(() => { if (authed) load(); /* eslint-disable-next-line */ }, [authed]);
  useEffect(() => { ensureAdminSession().then((ok) => { if (ok) setAuthed(true); }); }, []);

  async function verify(pw: string) {
    setAuthLoading(true);
    try {
      const ok = await loginAdminSession(pw);
      if (ok) setAuthed(true); else setAuthError('Incorrect password');
    } catch { setAuthError('Connection error'); } finally { setAuthLoading(false); }
  }

  async function saveNotes(id: string) {
    setSavedMsg((m) => ({ ...m, [id]: 'Saving…' }));
    const r = await fetch('/api/admin/rubrics', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, grading_notes: notes[id] }),
    });
    const d = await r.json();
    setSavedMsg((m) => ({ ...m, [id]: r.ok ? 'Saved ✓' : (d.error || 'Failed') }));
  }

  if (!authed) {
    return (
      <div style={{ minHeight: '100vh', background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <div style={{ width: '100%', maxWidth: 360, background: '#fff', borderRadius: 20, border: '1px solid #e5e7eb', padding: '32px 28px', textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📏</div>
          <h1 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px', color: '#111' }}>Grading Rubrics</h1>
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

  return (
    <div style={{ minHeight: '100vh', background: '#f3f4f6', padding: '24px 16px' }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <a href="/admin" style={{ textDecoration: 'none', color: '#6b7280', fontSize: 14, fontWeight: 600 }}>‹ Admin</a>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: '#111' }}>📏 Grading Rubrics</h1>
        </div>
        <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 18px' }}>
          The standard the Solo grader marks against. Editing the band descriptors {canEdit ? 'is enabled.' : 'needs SUPABASE_SECRET_KEY — for now edit band text in the Supabase dashboard; you can still save examiner notes below once the key is set.'}
        </p>

        {rubrics.length === 0 && <p style={{ color: '#9ca3af', fontSize: 14 }}>No rubrics found.</p>}

        {rubrics.map((rb) => (
          <div key={rb.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: 18, marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#13203a' }}>{rb.level} {rb.subject} — {rb.paper}</h2>
              <span style={{ fontSize: 13, color: '#6b7280' }}>out of {rb.out_of ?? '—'}</span>
            </div>
            {rb.criteria?.map((c) => (
              <div key={c.name} style={{ marginBottom: 12 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#c0392b', marginBottom: 4 }}>{c.name} <span style={{ color: '#9ca3af', fontWeight: 400 }}>/ {c.maxMarks}</span></div>
                {c.descriptors?.map((d) => (
                  <div key={d.band} style={{ display: 'flex', gap: 10, fontSize: 13, color: '#374151', padding: '3px 0' }}>
                    <span style={{ flexShrink: 0, width: 64, color: '#8a93a0' }}>Band {d.band} ({d.range})</span>
                    <span>{d.text}</span>
                  </div>
                ))}
              </div>
            ))}
            <div style={{ marginTop: 12, borderTop: '1px solid #f0f2f5', paddingTop: 12 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Examiner notes (extra grading guidance)</label>
              <textarea value={notes[rb.id] ?? ''} onChange={(e) => setNotes((n) => ({ ...n, [rb.id]: e.target.value }))} rows={3}
                style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 10, padding: 10, fontSize: 13, marginTop: 6, boxSizing: 'border-box', resize: 'vertical' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
                <button onClick={() => saveNotes(rb.id)} style={{ background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 18px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Save notes</button>
                {savedMsg[rb.id] && <span style={{ fontSize: 13, color: savedMsg[rb.id].includes('✓') ? '#3a7a4a' : '#b91c1c' }}>{savedMsg[rb.id]}</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
