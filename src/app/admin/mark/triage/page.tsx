'use client';

// Batch triage — the flagged-only review pass over recent marking runs.
//
// The point of this page is what it does NOT show: the ~70% of questions the
// marker was confident about never appear. Adrian reviews the flags, then
// releases whole scripts. Release is the only outward action here and it is
// always his tap (HANDOFF-MARKING-LOOP.md, locked decision 2).
//
// Built mobile-first — he triages from his phone between lessons.

import { useState, useEffect, useCallback } from 'react';
import 'katex/dist/katex.min.css';
import { ensureAdminSession, loginAdminSession } from '@/lib/admin-client';
import { mathHtml } from '@/lib/math-inline';
import type { TriageQuestion } from '@/lib/mark-triage';

type Run = {
  id: string;
  createdAt: string;
  paperName: string;
  studentId: string | null;
  studentName: string | null;
  awarded: number;
  max: number;
  totalQuestions: number;
  unflaggedCount: number;
  annotatedPdfUrl: string | null;
  annotatedPhotos?: { photoIndex: number; url: string }[];
  pdfUrl: string | null;
  flagged: TriageQuestion[];
  releasable: boolean;
};

type Stats = { scripts: number; questions: number; confident: number; flagged: number; readyToRelease: number };

const C = {
  border: '#e5e7eb',
  muted: '#6b7280',
  flag: '#b45309',
  flagBg: '#fffbeb',
  flagBorder: '#fde68a',
  ok: '#15803d',
  okBg: '#f0fdf4',
  danger: '#b91c1c',
};

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-SG', { day: 'numeric', month: 'short' });
}

function Math({ text }: { text: string }) {
  return <span dangerouslySetInnerHTML={{ __html: mathHtml(text) }} />;
}

export default function TriagePage() {
  const [password, setPassword] = useState('');
  const [authed, setAuthed] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  const [runs, setRuns] = useState<Run[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState('');
  const [busy, setBusy] = useState<string>(''); // `${runId}:${idx}` or 'release'
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null); // `${runId}:${idx}`
  const [editAwarded, setEditAwarded] = useState('');
  const [editNote, setEditNote] = useState('');
  const [toast, setToast] = useState('');

  const load = useCallback(async (spinner = true) => {
    if (spinner) setLoading(true);
    try {
      const r = await fetch('/api/admin/mark-triage');
      const d = await r.json();
      if (d.error) { setApiError(d.error); return; }
      setRuns(d.runs || []);
      setStats(d.stats || null);
      setApiError('');
    } catch { setApiError('Connection error'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { ensureAdminSession().then(ok => { if (ok) setAuthed(true); }); }, []);
  useEffect(() => { if (authed) load(); }, [authed, load]);

  async function verify(pw: string) {
    setAuthLoading(true);
    try {
      if (await loginAdminSession(pw)) setAuthed(true);
      else setAuthError('Incorrect password');
    } catch { setAuthError('Connection error'); }
    finally { setAuthLoading(false); }
  }

  async function post(body: Record<string, unknown>) {
    const r = await fetch('/api/admin/mark-triage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return r.json();
  }

  // Optimistic: drop the reviewed question locally so the list shortens under
  // the thumb without a full reload on every tap.
  function resolveLocally(runId: string, idx: number, awarded?: number) {
    setRuns(prev => prev.map(run => {
      if (run.id !== runId) return run;
      const flagged = run.flagged.filter(q => q.index !== idx);
      const q = run.flagged.find(x => x.index === idx);
      const delta = awarded !== undefined && q ? awarded - q.awarded : 0;
      return { ...run, flagged, awarded: run.awarded + delta, releasable: flagged.length === 0 };
    }));
    setStats(s => (s ? { ...s, flagged: s.flagged - 1, confident: s.confident + 1 } : s));
  }

  async function agree(runId: string, idx: number) {
    setBusy(`${runId}:${idx}`);
    const d = await post({ action: 'agree', runId, questionIdx: idx });
    setBusy('');
    if (d.error) { setToast(d.error); return; }
    resolveLocally(runId, idx);
  }

  async function override(runId: string, idx: number) {
    setBusy(`${runId}:${idx}`);
    const d = await post({
      action: 'override', runId, questionIdx: idx,
      awarded: Number(editAwarded), note: editNote,
    });
    setBusy('');
    if (d.error) { setToast(d.error); return; }
    resolveLocally(runId, idx, Number(editAwarded));
    setEditing(null); setEditAwarded(''); setEditNote('');
  }

  async function release() {
    const ids = [...selected];
    if (!ids.length) return;
    setBusy('release');
    const d = await post({ action: 'release', runIds: ids });
    setBusy('');
    if (d.error) { setToast(d.error); return; }
    const manual = (d.results || []).filter((r: { released: boolean; via: string }) => r.released && r.via === 'none').length;
    setToast(
      `Released ${d.released} script${d.released === 1 ? '' : 's'}` +
      (d.notified ? `, ${d.notified} notified` : '') +
      (manual ? ` — ${manual} need${manual === 1 ? 's' : ''} a manual hand-back` : '')
    );
    setSelected(new Set());
    load(false);
  }

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // ── auth gate ─────────────────────────────────────────────────────────────
  if (!authed) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
        <form onSubmit={e => { e.preventDefault(); verify(password); }} style={{ width: '100%', maxWidth: 320 }}>
          <h1 style={{ fontSize: 20, marginBottom: 16 }}>⏳ Marking triage</h1>
          <input
            type="password" value={password} onChange={e => setPassword(e.target.value)}
            placeholder="Admin password" autoFocus
            style={{ width: '100%', padding: 12, fontSize: 16, border: `1px solid ${C.border}`, borderRadius: 8 }}
          />
          {authError && <p style={{ color: C.danger, fontSize: 14, marginTop: 8 }}>{authError}</p>}
          <button type="submit" disabled={authLoading}
            style={{ width: '100%', marginTop: 12, padding: 12, fontSize: 16, borderRadius: 8, border: 'none', background: '#111827', color: '#fff' }}>
            {authLoading ? '…' : 'Enter'}
          </button>
        </form>
      </div>
    );
  }

  const totalFlagged = runs.reduce((n, r) => n + r.flagged.length, 0);

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 760, margin: '0 auto', padding: '16px 12px 96px' }}>
      <header style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>⏳ Marking triage</h1>
        <button onClick={() => load()} style={{ border: `1px solid ${C.border}`, background: '#fff', borderRadius: 8, padding: '6px 10px', fontSize: 13 }}>
          ↻ Refresh
        </button>
      </header>

      {stats && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16, fontSize: 13 }}>
          <Chip label={`${stats.scripts} scripts`} />
          <Chip label={`${stats.questions} questions`} />
          <Chip label={`${stats.confident} confident — skipped`} bg={C.okBg} color={C.ok} />
          <Chip label={`${stats.flagged} to check`} bg={C.flagBg} color={C.flag} />
          {stats.readyToRelease > 0 && <Chip label={`${stats.readyToRelease} ready to release`} bg="#eff6ff" color="#1d4ed8" />}
        </div>
      )}

      {apiError && <p style={{ color: C.danger }}>{apiError}</p>}
      {loading && <p style={{ color: C.muted }}>Loading…</p>}

      {!loading && runs.length === 0 && (
        <p style={{ color: C.muted, padding: '32px 0', textAlign: 'center' }}>
          Nothing waiting — every recent script has been released. 🎉
        </p>
      )}

      {!loading && runs.length > 0 && totalFlagged === 0 && (
        <p style={{ background: C.okBg, border: `1px solid #bbf7d0`, color: C.ok, padding: 12, borderRadius: 8, fontSize: 14 }}>
          No flags to check. Tick the scripts below and release them.
        </p>
      )}

      {runs.map(run => (
        <section key={run.id} style={{ border: `1px solid ${C.border}`, borderRadius: 12, marginBottom: 14, overflow: 'hidden', background: '#fff' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: 12, background: '#fafafa', borderBottom: `1px solid ${C.border}` }}>
            <input
              type="checkbox" checked={selected.has(run.id)} onChange={() => toggle(run.id)}
              disabled={!run.releasable}
              title={run.releasable ? 'Select for release' : 'Check the flagged questions first'}
              style={{ width: 20, height: 20, marginTop: 2, flexShrink: 0 }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 15 }}>
                {run.studentName || <span style={{ color: C.danger }}>⚠ No student linked</span>}
              </div>
              <div style={{ color: C.muted, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {run.paperName} · {fmtDate(run.createdAt)}
              </div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{run.awarded}/{run.max}</div>
              <div style={{ fontSize: 12, color: run.flagged.length ? C.flag : C.ok }}>
                {run.flagged.length ? `${run.flagged.length} to check` : 'ready'}
              </div>
            </div>
          </div>

          {run.flagged.length === 0 ? (
            <div style={{ padding: '10px 12px', fontSize: 13, color: C.muted }}>
              All {run.totalQuestions} questions marked confidently.
              {run.annotatedPdfUrl && <> · <a href={run.annotatedPdfUrl} target="_blank" rel="noreferrer">📄 View</a></>}
            </div>
          ) : (
            run.flagged.map(q => {
              const key = `${run.id}:${q.index}`;
              const isEditing = editing === key;
              return (
                <div key={key} style={{ padding: 12, borderTop: `1px solid ${C.border}` }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
                    <strong style={{ fontSize: 15 }}>Q{q.questionNumber}</strong>
                    <span style={{ fontWeight: 700 }}>{q.awarded}/{q.max}</span>
                    {q.topic && <span style={{ fontSize: 12, color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.topic}</span>}
                    {/* 📬 From Adrian (SPEC-ASSIGN.md): a flagged weak topic → an
                        assigned question, pre-filled on the student profile. */}
                    {q.topic && run.studentId && (
                      <a
                        href={`/admin/students/${run.studentId}?send=${encodeURIComponent(q.topic)}`}
                        style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 600, color: '#1d4ed8', textDecoration: 'none', whiteSpace: 'nowrap' }}
                        title="Send a follow-up question on this topic"
                      >
                        📬 Send follow-up
                      </a>
                    )}
                  </div>

                  {(() => {
                    // The marked page image, so the AI's call can be checked
                    // against the student's actual working without leaving triage.
                    const pagePhoto = q.photoIndex != null
                      ? (run.annotatedPhotos || []).find(p => p.photoIndex === q.photoIndex)
                      : undefined;
                    if (!pagePhoto) return null;
                    return (
                      <details style={{ marginBottom: 6 }}>
                        <summary style={{ fontSize: 12, fontWeight: 600, color: '#1d4ed8', cursor: 'pointer' }}>
                          📷 Show page {q.photoIndex! + 1}
                        </summary>
                        <a href={pagePhoto.url} target="_blank" rel="noreferrer">
                          <img
                            src={pagePhoto.url}
                            alt={`Marked page ${q.photoIndex! + 1}`}
                            loading="lazy"
                            style={{ width: '100%', marginTop: 6, borderRadius: 8, border: `1px solid ${C.border}` }}
                          />
                        </a>
                      </details>
                    );
                  })()}

                  {q.reviewReasons.map((reason, i) => (
                    <div key={i} style={{ background: C.flagBg, border: `1px solid ${C.flagBorder}`, color: C.flag, borderRadius: 6, padding: '6px 8px', fontSize: 13, marginBottom: 6 }}>
                      ⚠ {reason}
                    </div>
                  ))}
                  {!q.questionFound && (
                    <div style={{ fontSize: 12, color: C.muted, marginBottom: 6 }}>
                      Max marks here are the marker&apos;s own allocation, not the paper&apos;s.
                    </div>
                  )}

                  {q.parts.filter(p => p.errorSummary).map((p, i) => (
                    <div key={i} style={{ fontSize: 13, marginBottom: 4 }}>
                      <strong>{p.label} {p.awarded}/{p.max}</strong> — <Math text={p.errorSummary!} />
                    </div>
                  ))}
                  {q.parts.every(p => !p.errorSummary) && q.overallComment && (
                    <div style={{ fontSize: 13, marginBottom: 4, color: '#374151' }}><Math text={q.overallComment} /></div>
                  )}

                  {isEditing ? (
                    <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                      <input
                        type="number" inputMode="numeric" min={0} max={q.max}
                        value={editAwarded} onChange={e => setEditAwarded(e.target.value)} autoFocus
                        style={{ width: 68, padding: 8, fontSize: 16, border: `1px solid ${C.border}`, borderRadius: 6 }}
                      />
                      <span style={{ color: C.muted }}>/ {q.max}</span>
                      <input
                        value={editNote} onChange={e => setEditNote(e.target.value)} placeholder="Why (optional)"
                        style={{ flex: 1, minWidth: 140, padding: 8, fontSize: 15, border: `1px solid ${C.border}`, borderRadius: 6 }}
                      />
                      <button onClick={() => override(run.id, q.index)} disabled={busy === key || editAwarded === ''}
                        style={btn('#111827', '#fff')}>
                        {busy === key ? '…' : 'Save'}
                      </button>
                      <button onClick={() => setEditing(null)} style={btn('#fff', '#374151', C.border)}>Cancel</button>
                    </div>
                  ) : (
                    <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button onClick={() => agree(run.id, q.index)} disabled={busy === key} style={btn(C.okBg, C.ok, '#bbf7d0')}>
                        {busy === key ? '…' : '✓ Agree'}
                      </button>
                      <button
                        onClick={() => { setEditing(key); setEditAwarded(String(q.awarded)); setEditNote(''); }}
                        style={btn('#fff', '#374151', C.border)}
                      >
                        ✏️ Override
                      </button>
                      {run.annotatedPdfUrl && (
                        <a href={run.annotatedPdfUrl} target="_blank" rel="noreferrer" style={{ ...btn('#fff', '#374151', C.border), textDecoration: 'none', display: 'inline-block' }}>
                          🔁 View page
                        </a>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </section>
      ))}

      {/* An override corrects the record; the annotated PDF was rendered once at
          marking time and cannot be redrawn from here. Say so where it's acted on. */}
      {totalFlagged > 0 && (
        <p style={{ fontSize: 12, color: C.muted, marginTop: -4 }}>
          Overriding changes the recorded score. The annotated PDF still shows the original red pen — tell the student in class.
        </p>
      )}

      {selected.size > 0 && (
        <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, padding: 12, background: '#fff', borderTop: `1px solid ${C.border}`, boxShadow: '0 -2px 12px rgba(0,0,0,.06)' }}>
          <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', gap: 10, alignItems: 'center' }}>
            <button onClick={() => setSelected(new Set())} style={btn('#fff', '#374151', C.border)}>Clear</button>
            <button onClick={release} disabled={busy === 'release'}
              style={{ ...btn('#111827', '#fff'), flex: 1, padding: '12px 16px', fontSize: 16 }}>
              {busy === 'release' ? 'Releasing…' : `Release ${selected.size} script${selected.size === 1 ? '' : 's'}`}
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div onClick={() => setToast('')}
          style={{ position: 'fixed', left: 12, right: 12, bottom: selected.size ? 76 : 12, background: '#111827', color: '#fff', padding: '10px 14px', borderRadius: 10, fontSize: 14, maxWidth: 736, margin: '0 auto' }}>
          {toast}
        </div>
      )}
    </div>
  );
}

function Chip({ label, bg = '#f3f4f6', color = '#374151' }: { label: string; bg?: string; color?: string }) {
  return <span style={{ background: bg, color, borderRadius: 999, padding: '4px 10px' }}>{label}</span>;
}

function btn(bg: string, color: string, border?: string) {
  return {
    background: bg, color, border: `1px solid ${border || bg}`,
    borderRadius: 8, padding: '8px 12px', fontSize: 14, cursor: 'pointer',
  } as const;
}
