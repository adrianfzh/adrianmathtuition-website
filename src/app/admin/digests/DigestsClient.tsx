'use client';
// /admin/digests — review + edit + copy parent digest drafts (monthly / term),
// plus "Generate now" buttons for all three digest periods.
// SENDING is manual in v1: the Copy button puts body_md on the clipboard;
// "Mark sent" just records that Adrian sent it himself (WhatsApp/email).

import { useCallback, useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { ensureAdminSession, loginAdminSession } from '@/lib/admin-client';
import PasswordInput from '@/components/PasswordInput';

interface Digest {
  id: string;
  airtable_student_id: string;
  student_name: string | null;
  period: 'month' | 'term';
  period_label: string;
  body_md: string;
  exam_json: {
    examType?: string; score?: number | null; total?: number | null;
    percent?: number | null; grade?: string | null;
  } | null;
  status: 'draft' | 'sent';
  created_at: string;
}

type Tab = 'month' | 'term';
const EXAM_TYPES = ['WA1', 'WA2', 'WA3', 'EOY'] as const;

export default function DigestsClient() {
  const [password, setPassword] = useState('');
  const [authed, setAuthed] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  const [tab, setTab] = useState<Tab>('month');
  const [digests, setDigests] = useState<Digest[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState<string | null>(null); // 'week'|'month'|'term'
  const [examType, setExamType] = useState<string>('WA3');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [toast, setToast] = useState<{ msg: string; kind: 'ok' | 'err' } | null>(null);

  const showToast = useCallback((msg: string, kind: 'ok' | 'err' = 'ok') => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/digests?period=all');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setDigests(data.digests || []);
    } catch (e: any) {
      showToast(`Load failed: ${e.message}`, 'err');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    ensureAdminSession().then(ok => { if (ok) setAuthed(true); });
  }, []);
  useEffect(() => { if (authed) load(); }, [authed, load]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);
    const ok = await loginAdminSession(password);
    setAuthLoading(false);
    if (ok) setAuthed(true);
    else setAuthError('Incorrect password');
  }

  async function generate(period: 'week' | 'month' | 'term') {
    setGenerating(period);
    try {
      const qs = period === 'term' ? `?period=term&examType=${examType}` : `?period=${period}`;
      const res = await fetch(`/api/progress-digest${qs}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      if (period === 'week') {
        showToast(`Weekly digest sent to Telegram (${data.studentsCovered} students, ${data.flaggedStudents} flagged)`);
      } else {
        showToast(`${data.drafted} draft${data.drafted === 1 ? '' : 's'} generated for ${data.periodLabel}${data.errors?.length ? ` (${data.errors.length} failed)` : ''}`);
        await load();
      }
    } catch (e: any) {
      showToast(`Generate failed: ${e.message}`, 'err');
    } finally {
      setGenerating(null);
    }
  }

  async function patchDigest(id: string, patch: { body_md?: string; status?: 'draft' | 'sent' }) {
    const res = await fetch('/api/admin/digests', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...patch }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    setDigests(ds => ds.map(d => (d.id === id ? { ...d, ...data.digest } : d)));
  }

  async function handleSaveEdit(id: string) {
    try {
      await patchDigest(id, { body_md: editText });
      setEditingId(null);
      showToast('Saved');
    } catch (e: any) {
      showToast(`Save failed: ${e.message}`, 'err');
    }
  }

  async function handleMarkSent(d: Digest) {
    try {
      await patchDigest(d.id, { status: d.status === 'sent' ? 'draft' : 'sent' });
      showToast(d.status === 'sent' ? 'Back to draft' : 'Marked sent');
    } catch (e: any) {
      showToast(`Update failed: ${e.message}`, 'err');
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this draft? This cannot be undone.')) return;
    try {
      const res = await fetch('/api/admin/digests', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error((await res.json()).error || `HTTP ${res.status}`);
      setDigests(ds => ds.filter(d => d.id !== id));
      showToast('Deleted');
    } catch (e: any) {
      showToast(`Delete failed: ${e.message}`, 'err');
    }
  }

  async function handleCopy(d: Digest) {
    try {
      await navigator.clipboard.writeText(d.body_md);
      showToast(`Copied ${d.student_name || 'digest'} to clipboard`);
    } catch {
      showToast('Copy failed — clipboard unavailable', 'err');
    }
  }

  if (!authed) {
    return (
      <>
        <style>{css}</style>
        <div className="dg-login-wrap">
          <div className="dg-login-card">
            <div style={{ fontSize: 40, marginBottom: 12 }}>📬</div>
            <h1>Parent Digests</h1>
            <p>Adrian&apos;s Math Tuition</p>
            <form onSubmit={handleLogin}>
              <PasswordInput
                className="dg-pw-input"
                placeholder="Admin password"
                value={password}
                onChange={v => { setPassword(v); setAuthError(''); }}
                autoFocus
                disabled={authLoading}
              />
              {authError && <div className="dg-pw-error">{authError}</div>}
              <button type="submit" className="dg-pw-btn" disabled={authLoading || !password}>
                {authLoading ? 'Checking…' : 'Enter'}
              </button>
            </form>
          </div>
        </div>
      </>
    );
  }

  const visible = digests.filter(d => d.period === tab);
  const byLabel = new Map<string, Digest[]>();
  for (const d of visible) {
    if (!byLabel.has(d.period_label)) byLabel.set(d.period_label, []);
    byLabel.get(d.period_label)!.push(d);
  }

  return (
    <>
      <style>{css}</style>
      <div className="dg-wrap">
        <div className="dg-header">
          <div className="dg-header-inner">
            <span className="dg-title">📬 Parent Digests</span>
          </div>
        </div>

        <div className="dg-body">
          {/* Generate now */}
          <div className="dg-gen-row">
            <button className="dg-gen-btn" disabled={!!generating} onClick={() => generate('week')}>
              {generating === 'week' ? 'Sending…' : '📊 Weekly → Telegram'}
            </button>
            <button className="dg-gen-btn" disabled={!!generating} onClick={() => generate('month')}>
              {generating === 'month' ? 'Generating…' : '🗓 Generate monthly drafts'}
            </button>
            <span className="dg-gen-term">
              <select value={examType} onChange={e => setExamType(e.target.value)} disabled={!!generating}>
                {EXAM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <button className="dg-gen-btn" disabled={!!generating} onClick={() => generate('term')}>
                {generating === 'term' ? 'Generating…' : '🎓 Generate term drafts'}
              </button>
            </span>
          </div>
          {generating && generating !== 'week' && (
            <div className="dg-gen-note">One AI call per student — this can take a minute or two…</div>
          )}
          <div className="dg-gen-note">Drafts are never auto-sent. Review, edit, then Copy to send manually.</div>

          {/* Tabs */}
          <div className="dg-tabs">
            <button className={tab === 'month' ? 'active' : ''} onClick={() => setTab('month')}>
              Monthly ({digests.filter(d => d.period === 'month').length})
            </button>
            <button className={tab === 'term' ? 'active' : ''} onClick={() => setTab('term')}>
              Term ({digests.filter(d => d.period === 'term').length})
            </button>
          </div>

          {loading && <div className="dg-empty">Loading…</div>}
          {!loading && visible.length === 0 && (
            <div className="dg-empty">No {tab === 'month' ? 'monthly' : 'term'} drafts yet — hit Generate above.</div>
          )}

          {[...byLabel.entries()].map(([label, list]) => (
            <div key={label} className="dg-group">
              <div className="dg-group-label">{label}</div>
              {list.map(d => {
                const expanded = expandedId === d.id;
                const editing = editingId === d.id;
                return (
                  <div key={d.id} className={`dg-card ${d.status === 'sent' ? 'sent' : ''}`}>
                    <button
                      className="dg-card-head"
                      onClick={() => { setExpandedId(expanded ? null : d.id); setEditingId(null); }}
                    >
                      <span className="dg-card-name">{d.student_name || d.airtable_student_id}</span>
                      {d.exam_json?.score != null && d.exam_json?.total != null && (
                        <span className="dg-exam-pill">
                          {d.exam_json.examType}: {d.exam_json.score}/{d.exam_json.total}
                          {d.exam_json.percent != null ? ` (${d.exam_json.percent}%)` : ''}
                          {d.exam_json.grade ? ` · ${d.exam_json.grade}` : ''}
                        </span>
                      )}
                      <span className={`dg-status ${d.status}`}>{d.status === 'sent' ? '✓ sent' : 'draft'}</span>
                      <span className="dg-chevron">{expanded ? '▾' : '▸'}</span>
                    </button>

                    {expanded && (
                      <div className="dg-card-body">
                        {editing ? (
                          <>
                            <textarea
                              className="dg-edit-area"
                              value={editText}
                              onChange={e => setEditText(e.target.value)}
                              rows={10}
                            />
                            <div className="dg-actions">
                              <button className="dg-btn primary" onClick={() => handleSaveEdit(d.id)}>Save</button>
                              <button className="dg-btn" onClick={() => setEditingId(null)}>Cancel</button>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="dg-md">
                              <ReactMarkdown>{d.body_md}</ReactMarkdown>
                            </div>
                            <div className="dg-actions">
                              <button className="dg-btn primary" onClick={() => handleCopy(d)}>📋 Copy</button>
                              <button className="dg-btn" onClick={() => { setEditingId(d.id); setEditText(d.body_md); }}>✏️ Edit</button>
                              <button className="dg-btn" onClick={() => handleMarkSent(d)}>
                                {d.status === 'sent' ? '↩ Back to draft' : '✓ Mark sent'}
                              </button>
                              <button className="dg-btn danger" onClick={() => handleDelete(d.id)}>🗑 Delete</button>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {toast && (
          <div className={`dg-toast ${toast.kind}`}>{toast.msg}</div>
        )}
      </div>
    </>
  );
}

const css = `
.dg-login-wrap { min-height: 100vh; background: #f3f4f6; display: flex; align-items: center; justify-content: center; padding: 16px; }
.dg-login-card { width: 100%; max-width: 360px; background: #fff; border-radius: 20px; border: 1px solid #e5e7eb; padding: 32px 28px; text-align: center; }
.dg-login-card h1 { font-size: 20px; font-weight: 700; color: #111827; margin: 0 0 4px; }
.dg-login-card p { font-size: 13px; color: #9ca3af; margin: 0 0 24px; }
.dg-pw-input { width: 100%; border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px 16px; font-size: 15px; outline: none; box-sizing: border-box; margin-bottom: 10px; color: #111; }
.dg-pw-input:focus { border-color: #1e3a5f; }
.dg-pw-error { font-size: 13px; color: #ef4444; margin-bottom: 10px; }
.dg-pw-btn { width: 100%; background: #1e3a5f; color: #fff; border: none; border-radius: 10px; padding: 13px 0; font-size: 15px; font-weight: 600; cursor: pointer; }
.dg-pw-btn:disabled { opacity: 0.45; cursor: default; }

.dg-wrap { min-height: 100vh; background: #f3f4f6; padding-bottom: 48px; }
.dg-header { position: sticky; top: 0; z-index: 10; background: #fff; border-bottom: 1px solid #e5e7eb; }
.dg-header-inner { max-width: 720px; margin: 0 auto; padding: 14px 16px; display: flex; align-items: center; }
.dg-title { font-size: 18px; font-weight: 700; color: #111827; margin-left: 72px; }
.dg-body { max-width: 720px; margin: 0 auto; padding: 16px; }

.dg-gen-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 6px; }
.dg-gen-btn { background: #1e3a5f; color: #fff; border: none; border-radius: 10px; padding: 9px 14px; font-size: 13px; font-weight: 600; cursor: pointer; }
.dg-gen-btn:disabled { opacity: 0.5; cursor: default; }
.dg-gen-term { display: inline-flex; gap: 6px; align-items: center; }
.dg-gen-term select { border: 1px solid #d1d5db; border-radius: 8px; padding: 8px; font-size: 13px; background: #fff; color: #111827; }
.dg-gen-note { font-size: 12px; color: #9ca3af; margin-bottom: 6px; }

.dg-tabs { display: flex; gap: 8px; margin: 14px 0; }
.dg-tabs button { background: #fff; border: 1px solid #e5e7eb; border-radius: 999px; padding: 7px 16px; font-size: 13px; font-weight: 600; color: #6b7280; cursor: pointer; }
.dg-tabs button.active { background: #1e3a5f; border-color: #1e3a5f; color: #fff; }

.dg-empty { text-align: center; color: #9ca3af; font-size: 14px; padding: 40px 0; }
.dg-group { margin-bottom: 18px; }
.dg-group-label { font-size: 12px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; margin: 12px 0 8px; }

.dg-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 14px; margin-bottom: 8px; overflow: hidden; }
.dg-card.sent { opacity: 0.75; }
.dg-card-head { display: flex; align-items: center; gap: 10px; width: 100%; background: none; border: none; padding: 13px 14px; cursor: pointer; text-align: left; }
.dg-card-name { font-size: 15px; font-weight: 600; color: #111827; flex: 1; }
.dg-exam-pill { font-size: 11px; font-weight: 600; color: #1e3a5f; background: #eef2f7; border-radius: 999px; padding: 3px 9px; white-space: nowrap; }
.dg-status { font-size: 11px; font-weight: 700; border-radius: 999px; padding: 3px 9px; }
.dg-status.draft { color: #92400e; background: #fef3c7; }
.dg-status.sent { color: #065f46; background: #d1fae5; }
.dg-chevron { color: #9ca3af; font-size: 13px; }

.dg-card-body { border-top: 1px solid #f3f4f6; padding: 14px; }
.dg-md { font-size: 14px; color: #1f2937; line-height: 1.6; }
.dg-md p { margin: 0 0 10px; }
.dg-md ul, .dg-md ol { margin: 0 0 10px; padding-left: 20px; }
.dg-md strong { color: #111827; }
.dg-edit-area { width: 100%; box-sizing: border-box; border: 1px solid #d1d5db; border-radius: 10px; padding: 10px 12px; font-size: 14px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; line-height: 1.5; color: #111827; resize: vertical; }

.dg-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.dg-btn { background: #fff; border: 1px solid #d1d5db; border-radius: 9px; padding: 7px 12px; font-size: 13px; font-weight: 600; color: #374151; cursor: pointer; }
.dg-btn.primary { background: #1e3a5f; border-color: #1e3a5f; color: #fff; }
.dg-btn.danger { color: #b91c1c; border-color: #fecaca; }

.dg-toast { position: fixed; bottom: 22px; left: 50%; transform: translateX(-50%); border-radius: 10px; padding: 11px 18px; font-size: 13px; font-weight: 600; color: #fff; z-index: 100; box-shadow: 0 4px 14px rgba(0,0,0,0.18); }
.dg-toast.ok { background: #059669; }
.dg-toast.err { background: #dc2626; }
`;
