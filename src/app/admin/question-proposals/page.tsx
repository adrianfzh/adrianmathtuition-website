'use client';

import { useCallback, useEffect, useState } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { ensureAdminSession, loginAdminSession } from '@/lib/admin-client';

// Questions the self-study sheets WROTE, waiting to be vetted before they can
// join the bank.
//
// Every practice question on every sheet used to be invented, used once inside one
// student's DOCX, and lost — so the bank never grew and the next sheet on the same
// skill invented it again. The sheet now searches the bank first and authors only
// on a genuine miss; this is where those misses wait.
//
// The FAILED SEARCH is shown as prominently as the question, on purpose. It is the
// difference between "the bank genuinely lacks this" and "it didn't look properly",
// and it is the only way to judge whether authoring was justified. It also reads,
// over time, as a list of what the bank is missing.
//
// Approving does NOT publish. `questions` feeds the kiosk, worksheets and the
// portal; moving a row in is a separate deliberate step, so the queue can never
// drain itself into student-facing material.

type Proposal = {
  id: number;
  run_id: string | null;
  student_name: string | null;
  paper_name: string | null;
  level: string;
  topics: string[] | null;
  question_text: string;
  answer: string | null;
  solution: string | null;
  marks: number | null;
  skill: string | null;
  search_query: string | null;
  search_hits: unknown[] | null;
  status: string;
  created_at: string;
  notes: string | null;
};

// Questions arrive as prose with `$…$` maths, the same way they are stored in the
// bank — so the page has to typeset them. Printing the source instead turns a
// question into "$y = 2x^3 - 3x^2 + px - 1$", which is exactly the leak this
// pipeline keeps producing elsewhere: the content was right, the surface could
// not draw it. A vetting page above all others has to show what Adrian is ruling
// on, not its markup.
//
// throwOnError false on purpose: a malformed segment renders as red source and
// the rest of the question still reads, which is the useful failure — an
// exception here would blank the card and hide the very thing being vetted.
function renderMath(src: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const out: string[] = [];
  let i = 0;
  while (i < src.length) {
    const start = src.indexOf('$', i);
    if (start < 0) { out.push(esc(src.slice(i))); break; }
    const end = src.indexOf('$', start + 1);
    if (end < 0) { out.push(esc(src.slice(i))); break; }
    out.push(esc(src.slice(i, start)));
    const tex = src.slice(start + 1, end);
    try {
      out.push(katex.renderToString(tex, { displayMode: false, throwOnError: false, output: 'html' }));
    } catch {
      out.push(esc(`$${tex}$`));
    }
    i = end + 1;
  }
  return out.join('');
}

/** Prose-with-maths, typeset. Named Tex, not Math: a component called `Math`
 *  shadows the global object, and the first casualty was Math.floor two lines
 *  below it. */
function Tex({ children, style }: { children: string; style?: React.CSSProperties }) {
  return <span style={style} dangerouslySetInnerHTML={{ __html: renderMath(children) }} />;
}

function ageLabel(iso: string): string {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function QuestionProposalsPage() {
  const [password, setPassword] = useState('');
  const [authed, setAuthed] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  const [rows, setRows] = useState<Proposal[]>([]);
  const [tab, setTab] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState('');
  const [busy, setBusy] = useState<number | null>(null);
  const [noteFor, setNoteFor] = useState<number | null>(null);
  const [note, setNote] = useState('');

  const load = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    try {
      const r = await fetch(`/api/admin/question-proposals?status=${tab}`);
      const d = await r.json();
      setRows(d.proposals || []);
      setApiError(d.error || '');
    } catch { setApiError('Connection error'); }
    finally { setLoading(false); }
  }, [tab]);

  useEffect(() => { if (authed) load(); }, [authed, load]);
  useEffect(() => { ensureAdminSession().then(ok => { if (ok) setAuthed(true); }); }, []);

  async function verify(pw: string) {
    setAuthLoading(true);
    try {
      const ok = await loginAdminSession(pw);
      if (ok) setAuthed(true); else setAuthError('Incorrect password');
    } catch { setAuthError('Connection error'); }
    finally { setAuthLoading(false); }
  }

  async function decide(p: Proposal, action: 'approve' | 'reject') {
    if (busy) return;
    setBusy(p.id);
    try {
      const r = await fetch('/api/admin/question-proposals', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: p.id, action, notes: note.trim() || undefined }),
      });
      const d = await r.json();
      if (!r.ok) { setApiError(d.error || `failed (${r.status})`); return; }
      // The row leaves this tab, so drop it rather than refetching the world.
      setRows(prev => prev.filter(x => x.id !== p.id));
      setNoteFor(null); setNote('');
    } catch { setApiError('Connection error'); }
    finally { setBusy(null); }
  }

  if (!authed) {
    return (
      <div style={{ minHeight: '100vh', background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <div style={{ width: '100%', maxWidth: 360, background: '#fff', borderRadius: 20, border: '1px solid #e5e7eb', padding: '32px 28px', textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📥</div>
          <h1 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px', color: '#111' }}>Question proposals</h1>
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

  const tabBtn = (key: typeof tab, label: string) => (
    <button key={key} onClick={() => setTab(key)}
      style={{ border: '1px solid ' + (tab === key ? '#1e3a5f' : '#e5e7eb'), background: tab === key ? '#1e3a5f' : '#fff',
        color: tab === key ? '#fff' : '#374151', borderRadius: 999, padding: '6px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
      {label}
    </button>
  );

  return (
    <div style={{ minHeight: '100vh', background: '#f3f4f6', padding: '20px 14px 60px' }}>
      <div style={{ maxWidth: 860, margin: '0 auto' }}>
        <h1 style={{ fontSize: 21, fontWeight: 700, color: '#111', margin: '0 0 4px' }}>📥 Question proposals</h1>
        <p style={{ fontSize: 13.5, color: '#6b7280', margin: '0 0 16px', lineHeight: 1.5 }}>
          Questions a self-study sheet wrote because the bank had nothing that drilled the method.
          Approving marks one fit to publish — it does <strong>not</strong> put it in the bank; that stays a separate step.
        </p>

        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          {tabBtn('pending', 'Pending')}
          {tabBtn('approved', 'Approved')}
          {tabBtn('rejected', 'Rejected')}
          <button onClick={() => load()} disabled={loading}
            style={{ marginLeft: 'auto', border: '1px solid #e5e7eb', background: '#fff', color: '#374151', borderRadius: 999, padding: '6px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            {loading ? '…' : '↻'}
          </button>
        </div>

        {apiError && <p style={{ fontSize: 13.5, color: '#b91c1c', marginBottom: 12 }}>{apiError}</p>}

        {!loading && !rows.length && (
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '36px 24px', textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>
            {tab === 'pending'
              ? 'Nothing waiting. A sheet only files here when it searched the bank and found nothing that drilled the method.'
              : `No ${tab} proposals.`}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {rows.map(p => (
            <div key={p.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#1e3a5f', background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 999, padding: '2px 9px' }}>{p.level}</span>
                {(p.topics || []).map(t => (
                  <span key={t} style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 999, padding: '2px 8px' }}>{t}</span>
                ))}
                {p.marks != null && <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 600 }}>[{p.marks}]</span>}
                <span style={{ fontSize: 12, color: '#9ca3af', marginLeft: 'auto' }}>
                  {p.student_name ? `${p.student_name} · ` : ''}{ageLabel(p.created_at)}
                </span>
              </div>

              {p.skill && (
                <Tex style={{ fontSize: 13, color: '#5b4636', margin: '0 0 8px', display: 'block', fontStyle: 'italic' }}>{`Drills: ${p.skill}`}</Tex>
              )}

              <Tex style={{ fontSize: 15, color: '#111', margin: '0 0 8px', display: 'block', lineHeight: 1.7 }}>{p.question_text}</Tex>

              {p.answer && (
                <p style={{ fontSize: 13.5, color: '#b45309', margin: '8px 0' }}>
                  [Ans: <Tex>{p.answer}</Tex>]
                </p>
              )}

              {/* The justification for writing it at all — shown, not buried. */}
              <div style={{ background: '#FDFBF6', border: '1px solid #EADFC0', borderRadius: 10, padding: '9px 12px', marginBottom: 10 }}>
                <p style={{ fontSize: 12.5, color: '#5b4636', margin: 0, lineHeight: 1.5 }}>
                  <strong>Searched the bank for:</strong> “{p.search_query || '—'}”
                  {' · '}
                  {Array.isArray(p.search_hits) && p.search_hits.length
                    ? `${p.search_hits.length} hit${p.search_hits.length === 1 ? '' : 's'}, none drilled the method`
                    : 'nothing came back'}
                </p>
              </div>

              {p.solution && (
                <details style={{ marginBottom: 10 }}>
                  <summary style={{ fontSize: 13, color: '#1e3a5f', fontWeight: 600, cursor: 'pointer' }}>Worked solution</summary>
                  <Tex style={{ fontSize: 13.5, color: '#374151', margin: '8px 0 0', display: 'block', lineHeight: 1.7 }}>{p.solution}</Tex>
                </details>
              )}

              {p.notes && (
                <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 8px', fontStyle: 'italic' }}>“{p.notes}”</p>
              )}

              {p.status === 'pending' && (
                <>
                  {noteFor === p.id && (
                    <input value={note} onChange={e => setNote(e.target.value)} autoFocus
                      placeholder="Note to yourself (optional) — why you ruled this way"
                      style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: 8, padding: '9px 12px', fontSize: 14, outline: 'none', boxSizing: 'border-box', marginBottom: 8 }} />
                  )}
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
                    {noteFor !== p.id && (
                      <button onClick={() => { setNoteFor(p.id); setNote(''); }}
                        style={{ border: 'none', background: 'none', color: '#6b7280', fontSize: 13, cursor: 'pointer', marginRight: 'auto' }}>＋ note</button>
                    )}
                    <button onClick={() => decide(p, 'reject')} disabled={busy === p.id}
                      style={{ border: '1px solid #fca5a5', background: '#fff', color: '#b91c1c', borderRadius: 8, padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: busy === p.id ? 0.45 : 1 }}>
                      ✕ Reject
                    </button>
                    <button onClick={() => decide(p, 'approve')} disabled={busy === p.id}
                      style={{ border: 'none', background: '#047857', color: '#fff', borderRadius: 8, padding: '7px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: busy === p.id ? 0.45 : 1 }}>
                      {busy === p.id ? 'Saving…' : '✓ Approve'}
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
