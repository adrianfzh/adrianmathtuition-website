'use client';

import { useCallback, useEffect, useState } from 'react';
import { ensureAdminSession, loginAdminSession } from '@/lib/admin-client';
import { kindLabel } from '@/lib/requests';

// Student resource requests — the admin side of the "Request" tab (v1
// human-in-the-loop). Students file on /app/requests (2/day cap) and Adrian's
// Telegram rings; this queue is where he clears them: ✅ Mark done pastes the
// result link the student's "Get it" button opens, ❌ Reject requires the note
// the student will read. Queued oldest-first, decided history below.

type Req = {
  id: string;
  studentId: string;
  studentName: string;
  kind: string;
  detail: string;
  status: string;
  adminNote: string | null;
  resultUrl: string | null;
  draftUrl: string | null;
  createdAt: string;
  decidedAt: string | null;
};

function ageLabel(iso: string): string {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function AdminRequestsPage() {
  const [password, setPassword] = useState('');
  const [authed, setAuthed] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  const [queued, setQueued] = useState<Req[]>([]);
  const [decided, setDecided] = useState<Req[]>([]);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState('');

  // Per-row action panel: which row is open and in which mode.
  const [actId, setActId] = useState<string | null>(null);
  const [actMode, setActMode] = useState<'done' | 'reject'>('done');
  const [actUrl, setActUrl] = useState('');
  const [actNote, setActNote] = useState('');
  const [actBusy, setActBusy] = useState(false);
  const [actError, setActError] = useState('');

  const load = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    try {
      const r = await fetch('/api/admin/requests');
      const d = await r.json();
      setQueued(d.queued || []);
      setDecided(d.decided || []);
      setApiError(d.error || '');
    } catch { setApiError('Connection error'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (authed) load(); }, [authed, load]);
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

  function openAction(r: Req, mode: 'done' | 'reject') {
    setActId(r.id);
    setActMode(mode);
    // A vetted draft is one tap from approval: the URL box starts prefilled
    // with the auto-draft, so ✅ Mark done sends exactly the PDF he vetted.
    setActUrl(mode === 'done' && r.draftUrl ? r.draftUrl : '');
    setActNote('');
    setActError('');
  }

  async function submitAction() {
    if (!actId || actBusy) return;
    setActBusy(true);
    setActError('');
    try {
      const r = await fetch('/api/admin/requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          actMode === 'done'
            ? { id: actId, action: 'done', resultUrl: actUrl.trim(), note: actNote }
            : { id: actId, action: 'reject', note: actNote },
        ),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setActError(d.error || `HTTP ${r.status}`); return; }
      setActId(null);
      load(false);
    } catch { setActError('Connection error'); }
    finally { setActBusy(false); }
  }

  if (!authed) {
    return (
      <div style={{ minHeight: '100vh', background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <div style={{ width: '100%', maxWidth: 360, background: '#fff', borderRadius: 20, border: '1px solid #e5e7eb', padding: '32px 28px', textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🙋</div>
          <h1 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px', color: '#111' }}>Requests</h1>
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

  const actionPanel = () => (
    <div style={{ marginTop: 10, padding: '12px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10 }}>
      {actMode === 'done' ? (
        <>
          <input value={actUrl} onChange={e => { setActUrl(e.target.value); setActError(''); }} autoFocus
            placeholder="Result URL (Dropbox / Blob / anywhere the student can open)"
            style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: 8, padding: '9px 12px', fontSize: 14, outline: 'none', boxSizing: 'border-box', marginBottom: 8 }} />
          <input value={actNote} onChange={e => setActNote(e.target.value)}
            placeholder="Note to the student (optional)"
            style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: 8, padding: '9px 12px', fontSize: 14, outline: 'none', boxSizing: 'border-box', marginBottom: 8 }} />
        </>
      ) : (
        <input value={actNote} onChange={e => { setActNote(e.target.value); setActError(''); }} autoFocus
          placeholder="Why not? (required — the student sees this)"
          style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: 8, padding: '9px 12px', fontSize: 14, outline: 'none', boxSizing: 'border-box', marginBottom: 8 }} />
      )}
      {actError && <p style={{ fontSize: 13, color: '#ef4444', margin: '0 0 8px' }}>{actError}</p>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={() => setActId(null)} disabled={actBusy}
          style={{ border: '1px solid #e5e7eb', background: '#fff', color: '#374151', borderRadius: 8, padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
        <button onClick={submitAction}
          disabled={actBusy || (actMode === 'done' ? !actUrl.trim() : !actNote.trim())}
          style={{ border: 'none', background: actMode === 'done' ? '#047857' : '#b91c1c', color: '#fff', borderRadius: 8, padding: '7px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            opacity: (actBusy || (actMode === 'done' ? !actUrl.trim() : !actNote.trim())) ? 0.45 : 1 }}>
          {actBusy ? 'Saving…' : actMode === 'done' ? '✅ Mark done' : '❌ Reject'}
        </button>
      </div>
    </div>
  );

  const row = (r: Req, isQueued: boolean) => (
    <li key={r.id} style={{ padding: '12px 14px', borderBottom: '1px solid #f1f1f4' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: '#111' }}>{r.studentName}</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 999, padding: '2px 8px' }}>{kindLabel(r.kind)}</span>
        <span style={{ fontSize: 12, color: '#9ca3af' }}>{ageLabel(r.createdAt)}</span>
        {!isQueued && (
          <span style={{ fontSize: 12, fontWeight: 700, color: r.status === 'done' ? '#047857' : '#b91c1c' }}>
            {r.status === 'done' ? '✅ done' : '❌ rejected'}
          </span>
        )}
      </div>
      <p style={{ fontSize: 14, color: '#374151', margin: '6px 0 0', wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>{r.detail}</p>
      {!isQueued && r.adminNote && (
        <p style={{ fontSize: 13, color: '#6b7280', margin: '4px 0 0', fontStyle: 'italic' }}>“{r.adminNote}”</p>
      )}
      {!isQueued && r.resultUrl && (
        <a href={r.resultUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: '#1e3a5f', fontWeight: 600, display: 'inline-block', marginTop: 4, wordBreak: 'break-all' }}>
          🔗 {r.resultUrl}
        </a>
      )}
      {isQueued && r.draftUrl && (
        <a href={r.draftUrl} target="_blank" rel="noopener noreferrer"
          style={{ fontSize: 13, color: '#047857', fontWeight: 700, display: 'inline-block', marginTop: 6 }}>
          📝 Draft ready — vet the PDF
        </a>
      )}
      {isQueued && (actId === r.id ? actionPanel() : (
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button onClick={() => openAction(r, 'done')}
            style={{ border: '1px solid #a7f3d0', background: '#ecfdf5', color: '#047857', borderRadius: 8, padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            ✅ Mark done
          </button>
          <button onClick={() => openAction(r, 'reject')}
            style={{ border: '1px solid #fecaca', background: '#fef2f2', color: '#b91c1c', borderRadius: 8, padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            ❌ Reject
          </button>
        </div>
      ))}
    </li>
  );

  return (
    <div style={{ minHeight: '100vh', background: '#f3f4f6', padding: '24px 16px' }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <a href="/admin" style={{ textDecoration: 'none', color: '#6b7280', fontSize: 14, fontWeight: 600 }}>‹ Admin</a>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: '#111' }}>🙋 Requests</h1>
        </div>
        <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 16px' }}>
          What students asked for on /app/requests. ✅ pastes the link their “Get it” button opens; ❌ needs a note they’ll read.
        </p>

        {apiError && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 12, padding: '12px 14px', fontSize: 13, marginBottom: 16 }}>
            {apiError}
          </div>
        )}

        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.4, background: '#fffbeb' }}>
            Waiting · {queued.length}
          </div>
          {loading && queued.length === 0 ? <p style={{ padding: 16, color: '#9ca3af', fontSize: 14 }}>Loading…</p>
            : queued.length === 0 ? <p style={{ padding: 16, color: '#9ca3af', fontSize: 14 }}>Queue clear — nothing waiting.</p>
              : <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>{queued.map(r => row(r, true))}</ul>}
        </div>

        {decided.length > 0 && (
          <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb', overflow: 'hidden', marginTop: 16, opacity: 0.9 }}>
            <div style={{ padding: '10px 14px', fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.4, background: '#fafafa' }}>
              Decided · {decided.length}
            </div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>{decided.map(r => row(r, false))}</ul>
          </div>
        )}
      </div>
    </div>
  );
}
