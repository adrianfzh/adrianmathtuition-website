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
import { bandForRegion, isPartialBand } from '@/lib/region-crop';

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
  pdfStale?: boolean;
  annotatedPhotos?: { photoIndex: number; url: string }[];
  pdfUrl: string | null;
  flagged: TriageQuestion[];
  confident: TriageQuestion[];
  releasable: boolean;
  /** The bot's auto-release accuracy gates, re-derived server-side — why this
      hand-in did not go out by itself. Explanatory; manual release ignores it. */
  autoHold?: { hold: boolean; reasons: string[] };
};

type Stats = { scripts: number; questions: number; confident: number; flagged: number; readyToRelease: number;
  /** How often Adrian has had to correct the marker, split by who the error cost. */
  corrections?: { against: number; forStudent: number; reviewed: number } };

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
  // 📘 Sheet riding the release (step 7 of SPEC-TEACHING-CYCLE) — optional.
  const [sheetFile, setSheetFile] = useState<File | null>(null);
  const [sheetTitle, setSheetTitle] = useState('');
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

  // ✍️ Upload the copy Adrian wrote on. Overriding a mark corrects the number
  // in the portal but not the ink already baked into the PDF, so a paper can
  // otherwise reach a student showing two different totals. This is the fix he
  // was already doing by hand — edit the marked PDF in Preview, put it back —
  // and it clears the stale flag that blocks release.
  const [amendBusy, setAmendBusy] = useState('');
  async function uploadAmended(runId: string, file: File) {
    setAmendBusy(runId);
    try {
      const t = await fetch(`/api/admin/assignments/upload-token?filename=${encodeURIComponent(file.name)}`);
      if (!t.ok) throw new Error('could not start the upload');
      const { token, pathname } = await t.json();
      const { put } = await import('@vercel/blob');
      const blob = await put(pathname, file, {
        access: 'public', token, contentType: 'application/pdf',
        multipart: file.size > 5 * 1024 * 1024,
      });
      const d = await post({ action: 'attach-amended', runId, url: blob.url });
      if (d.error) throw new Error(d.error);
      setToast('Your amended copy is now the one the student gets.');
      load();
    } catch (e) {
      setToast(`Upload failed — ${(e as Error).message}`);
    } finally { setAmendBusy(''); }
  }

  // 📘 Release WITH the sheet (SPEC-TEACHING-CYCLE step 7): marks and the
  // practice that goes with them reach the student in ONE delivery. Optional —
  // with no sheet picked this is exactly the release it always was.
  async function release(withSheet = false) {
    const ids = [...selected];
    if (!ids.length) return;
    if (withSheet && !sheetFile) return;
    setBusy('release');
    let sheet: { pdfUrl: string; title: string } | undefined;
    if (withSheet && sheetFile) {
      try {
        const t = await fetch(`/api/admin/assignments/upload-token?filename=${encodeURIComponent(sheetFile.name)}`);
        if (!t.ok) throw new Error('could not start the upload');
        const { token, pathname } = await t.json();
        // Same client-token → Blob path as the Send-work card (the 4.5MB
        // platform body cap never applies).
        const { put } = await import('@vercel/blob');
        const blob = await put(pathname, sheetFile, {
          access: 'public', token, contentType: 'application/pdf',
          multipart: sheetFile.size > 5 * 1024 * 1024,
        });
        sheet = { pdfUrl: blob.url, title: sheetTitle.trim() || sheetFile.name.replace(/\.pdf$/i, '') };
      } catch (e) {
        setBusy(''); setToast(`Sheet upload failed — nothing released. ${(e as Error).message}`);
        return;
      }
    }
    const d = await post({ action: 'release', runIds: ids, ...(sheet ? { sheet } : {}) });
    setBusy('');
    if (d.error) { setToast(d.error); return; }
    const manual = (d.results || []).filter((r: { released: boolean; via: string }) => r.released && r.via === 'none').length;
    setToast(
      `Released ${d.released} script${d.released === 1 ? '' : 's'}` +
      (d.notified ? `, ${d.notified} notified` : '') +
      (manual ? ` — ${manual} need${manual === 1 ? 's' : ''} a manual hand-back` : '')
    );
    setSelected(new Set());
    setSheetFile(null); setSheetTitle('');
    load(false);
  }

  // "Seen" = handled outside the system (marked physically, handed back in
  // class): leaves triage/hub/reminder WITHOUT releasing — the student's portal
  // never shows it and nobody is notified (Adrian, 2026-08-29).
  async function markSeen(runId: string) {
    setBusy(`seen:${runId}`);
    const d = await post({ action: 'archive', runId });
    setBusy('');
    if (d.error) { setToast(d.error); return; }
    setRuns(prev => prev.filter(r => r.id !== runId));
    setSelected(prev => { const next = new Set(prev); next.delete(runId); return next; });
    load(false);
  }

  async function markAllSeen() {
    if (!window.confirm(`Mark all ${runs.length} scripts as seen (not released)? Held student hand-ins are kept.`)) return;
    setBusy('seen-all');
    const d = await post({ action: 'archive-all' });
    setBusy('');
    if (d.error) { setToast(d.error); return; }
    setToast(
      `${d.archived} marked as seen` +
      (d.skippedStudent ? ` — ${d.skippedStudent} student hand-in${d.skippedStudent === 1 ? '' : 's'} kept` : '')
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
        <div style={{ display: 'flex', gap: 8 }}>
          {runs.length > 0 && (
            <button onClick={markAllSeen} disabled={busy === 'seen-all'}
              title="Handled outside the system — clear the queue without releasing anything"
              style={{ border: `1px solid ${C.border}`, background: '#fff', borderRadius: 8, padding: '6px 10px', fontSize: 13 }}>
              {busy === 'seen-all' ? '…' : '👁 All seen'}
            </button>
          )}
          <button onClick={() => load()} style={{ border: `1px solid ${C.border}`, background: '#fff', borderRadius: 8, padding: '6px 10px', fontSize: 13 }}>
            ↻ Refresh
          </button>
        </div>
      </header>

      {stats && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16, fontSize: 13 }}>
          <Chip label={`${stats.scripts} scripts`} />
          <Chip label={`${stats.questions} questions`} />
          <Chip label={`${stats.confident} confident — skipped`} bg={C.okBg} color={C.ok} />
          <Chip label={`${stats.flagged} to check`} bg={C.flagBg} color={C.flag} />
          {stats.readyToRelease > 0 && <Chip label={`${stats.readyToRelease} ready to release`} bg="#eff6ff" color="#1d4ed8" />}
          {/* The accuracy number, and deliberately only one of the two: marks
              Adrian had to ADD are marks a student earned and did not get. Marks
              he removed never reached her. Averaging them would hide the one
              that decides whether this can ever release unsupervised. */}
          {stats.corrections && stats.corrections.reviewed > 0 && (
            <Chip
              label={`${stats.corrections.against} withheld wrongly / ${stats.corrections.reviewed} checked`}
              bg={stats.corrections.against > 0 ? '#fef2f2' : '#f0fdf4'}
              color={stats.corrections.against > 0 ? '#b91c1c' : '#047857'}
            />
          )}
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
              <button
                onClick={() => markSeen(run.id)} disabled={busy === `seen:${run.id}`}
                title="Handled outside — remove from triage without releasing"
                style={{ border: 'none', background: 'none', color: C.muted, fontSize: 12, padding: '4px 0 0', cursor: 'pointer' }}
              >
                {busy === `seen:${run.id}` ? '…' : '👁 Seen'}
              </button>
            </div>
          </div>

          {run.autoHold?.hold && (
            <div style={{ padding: '8px 12px', fontSize: 13, color: C.flag, background: C.flagBg, borderBottom: `1px solid ${C.flagBorder}` }}>
              ⚠ Held from auto-release: {run.autoHold.reasons.join(' · ')}
            </div>
          )}

          {run.flagged.length === 0 ? (
            <div style={{ padding: '10px 12px', fontSize: 13, color: C.muted }}>
              All {run.totalQuestions} questions marked confidently.
              {run.annotatedPdfUrl && <> · <a href={run.annotatedPdfUrl} target="_blank" rel="noreferrer">📄 View</a></>}
              {/* Every topic this script dropped marks on, in one link. The
                  per-question 📬 sends one; a paper rarely fails on one thing,
                  and three follow-ups used to mean three trips back here. */}
              {run.studentId && (() => {
                const topics = [...new Set(run.flagged.map(q => q.topic).filter(Boolean) as string[])];
                if (topics.length < 2) return null;
                return (
                  <> · <a href={`/admin/students/${run.studentId}?send=${encodeURIComponent(topics.join('|'))}`}
                    style={{ fontWeight: 600 }} title={`Send follow-ups on all ${topics.length} weak topics`}>
                    📬 Follow up on all {topics.length}
                  </a></>
                );
              })()}
              {run.pdfStale && (
                <> · <span style={{ color: '#b45309', fontWeight: 600 }} title="A mark was changed after this paper was marked, so the PDF still prints the old total. Release is blocked until you attach the copy you corrected.">
                  ⚠ PDF shows the old total
                </span></>
              )}
              {/* Always offered, not only when a mark was overridden (31 Aug
                  2026): Adrian edits the marked PDF as a matter of course — a
                  clearer comment, a correction he made by hand — and gating the
                  upload behind the stale flag hid it for exactly the paper he
                  was editing. The warning above is a separate state. */}
              {' · '}
              <label style={{ color: '#1d4ed8', fontWeight: 600, cursor: 'pointer' }}
                title="Upload the marked PDF after you have written on it — that copy becomes the one the student opens">
                {amendBusy === run.id ? 'Uploading…' : '✍️ Upload amended'}
                <input type="file" accept="application/pdf" hidden disabled={!!amendBusy}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadAmended(run.id, f); e.target.value = ''; }} />
              </label>
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
                    // Crop to the band the marker said the question sat in, and
                    // show it WITHOUT a click. Reading the marker's account of
                    // the working is not the same as seeing it — two wrong marks
                    // on Kayla's paper were found in the PDF, not here. The full
                    // page stays one expander away.
                    const band = bandForRegion(q.region);
                    return (
                      <>
                      {isPartialBand(band) && (
                        <div style={{ marginBottom: 6 }}>
                          <div style={{ position: 'relative', width: '100%', overflow: 'hidden',
                            borderRadius: 8, border: `1px solid ${C.border}`, aspectRatio: `1 / ${band.height * 1.414}` }}>
                            <img src={pagePhoto.url} alt={`Q${q.questionNumber} working`} loading="lazy"
                              style={{ position: 'absolute', left: 0, width: '100%',
                                top: `${-(band.top / band.height) * 100}%`, height: `${(1 / band.height) * 100}%`,
                                objectFit: 'cover', objectPosition: 'top' }} />
                          </div>
                          <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{q.region}</div>
                        </div>
                      )}
                      <details style={{ marginBottom: 6 }}>
                        <summary style={{ fontSize: 12, fontWeight: 600, color: '#1d4ed8', cursor: 'pointer' }}>
                          📷 {isPartialBand(band) ? 'Show the whole page' : `Show page ${q.photoIndex! + 1}`}
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
                      </>
                    );
                  })()}

                  {q.reviewReasons.map((reason, i) => {
                    // An answer-key disagreement is a comparison, and a
                    // comparison buried in a sentence has to be re-read to be
                    // understood. Kayla's Q6 said "key: (14y+7)/(...); marking
                    // accepted: (14y-3)/(...)" mid-prose — the one flag type
                    // where Adrian decides by looking at two expressions side
                    // by side, so show them that way and keep the rest of the
                    // sentence underneath.
                    const m = /key:\s*(.+?);\s*marking accepted:\s*(.+?)(?:\.|$)/i.exec(reason);
                    return (
                      <div key={i} style={{ background: C.flagBg, border: `1px solid ${C.flagBorder}`, color: C.flag, borderRadius: 6, padding: '6px 8px', fontSize: 13, marginBottom: 6 }}>
                        {m ? (
                          <>
                            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 10px', marginBottom: 4, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 13 }}>
                              <span style={{ fontWeight: 700 }}>key</span><span>{m[1]}</span>
                              <span style={{ fontWeight: 700 }}>marked</span><span>{m[2]}</span>
                            </div>
                            <div style={{ fontSize: 12.5, opacity: 0.85 }}>⚠ {reason.replace(m[0], '').replace(/^\s*[—–-]\s*/, '').trim() || 'Answer key disagrees.'}</div>
                          </>
                        ) : <>⚠ {reason}</>}
                      </div>
                    );
                  })}
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

          {/* Everything the marker was SURE about. Folded away, because it is
              usually right and this list is long — but reachable, because its
              confidence does not track its correctness: two of twenty questions
              on Kayla's paper were marked wrong against her and neither was
              flagged, so Adrian found them by reading the PDF instead.
              Correcting one here is also the only way the error rate gets a
              real denominator. */}
          {run.confident?.length > 0 && (
            <details style={{ marginTop: 10, borderTop: `1px solid ${C.border}`, paddingTop: 8 }}>
              <summary style={{ fontSize: 12.5, fontWeight: 600, color: C.muted, cursor: 'pointer' }}>
                ✓ {run.confident.length} the marker was sure about — check any of them
              </summary>
              <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {run.confident.map(q => {
                  const key = `${run.id}:${q.index}`;
                  const full = q.awarded >= q.max;
                  if (editing === key) {
                    return (
                      <div key={key} style={{ width: '100%', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', padding: 8, background: C.flagBg, borderRadius: 8 }}>
                        <strong style={{ fontSize: 14 }}>Q{q.questionNumber}</strong>
                        <input type="number" inputMode="numeric" min={0} max={q.max} value={editAwarded}
                          onChange={e => setEditAwarded(e.target.value)} autoFocus
                          style={{ width: 68, padding: 8, fontSize: 16, border: `1px solid ${C.border}`, borderRadius: 6 }} />
                        <span style={{ color: C.muted }}>/ {q.max}</span>
                        <input value={editNote} onChange={e => setEditNote(e.target.value)} placeholder="Why (optional)"
                          style={{ flex: 1, minWidth: 140, padding: 8, fontSize: 15, border: `1px solid ${C.border}`, borderRadius: 6 }} />
                        <button onClick={() => override(run.id, q.index)} disabled={busy === key || editAwarded === ''} style={btn('#111827', '#fff')}>
                          {busy === key ? '…' : 'Save'}
                        </button>
                        <button onClick={() => setEditing(null)} style={btn('#fff', '#374151', C.border)}>Cancel</button>
                      </div>
                    );
                  }
                  return (
                    <button key={key} type="button"
                      title={`Q${q.questionNumber} — ${q.awarded}/${q.max}. Click to correct.`}
                      onClick={() => { setEditing(key); setEditAwarded(String(q.awarded)); setEditNote(''); }}
                      style={{ fontSize: 12.5, padding: '3px 9px', borderRadius: 999, cursor: 'pointer',
                        border: `1px solid ${full ? '#d1d5db' : '#fbbf24'}`,
                        background: full ? '#fff' : '#fffbeb', color: full ? '#374151' : '#92400e' }}>
                      Q{q.questionNumber} {q.awarded}/{q.max}
                    </button>
                  );
                })}
              </div>
            </details>
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
          <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* 📘 Optional sheet — one selected script only. Attaching it makes
                the release ONE delivery: marks + the practice that goes with
                them (SPEC-TEACHING-CYCLE step 7). Releasing the paper alone
                stays exactly as it was. */}
            {selected.size === 1 && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <label style={{ ...btn('#fff', '#374151', C.border), cursor: 'pointer', margin: 0 }}>
                  {sheetFile ? '📘 Change sheet' : '📘 Attach a sheet (PDF)'}
                  <input
                    type="file" accept="application/pdf,.pdf" style={{ display: 'none' }}
                    onChange={(e) => {
                      const f = e.target.files?.[0] || null;
                      if (f && f.type && f.type !== 'application/pdf' && !/\.pdf$/i.test(f.name)) { setToast('The sheet must be a PDF.'); return; }
                      setSheetFile(f);
                      if (f && !sheetTitle) setSheetTitle(f.name.replace(/\.pdf$/i, '').replace(/[-_]+/g, ' ').trim());
                    }}
                  />
                </label>
                {sheetFile && (
                  <>
                    <input
                      value={sheetTitle} onChange={(e) => setSheetTitle(e.target.value)}
                      placeholder="Sheet title the student sees"
                      style={{ flex: 1, minWidth: 180, padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 14 }}
                    />
                    <button onClick={() => { setSheetFile(null); setSheetTitle(''); }} style={btn('#fff', '#b91c1c', C.border)}>✕</button>
                  </>
                )}
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <button onClick={() => setSelected(new Set())} style={btn('#fff', '#374151', C.border)}>Clear</button>
              <button onClick={() => release(false)} disabled={!!busy}
                style={{ ...btn(sheetFile ? '#fff' : '#111827', sheetFile ? '#374151' : '#fff', sheetFile ? C.border : undefined), flex: 1, padding: '12px 16px', fontSize: 16 }}>
                {busy === 'release' && !sheetFile ? 'Releasing…' : `Release ${selected.size} paper${selected.size === 1 ? '' : 's'} only`}
              </button>
              {sheetFile && (
                <button onClick={() => release(true)} disabled={!!busy}
                  style={{ ...btn('#111827', '#fff'), flex: 1.4, padding: '12px 16px', fontSize: 16 }}>
                  {busy === 'release' ? 'Releasing…' : '📘 Release paper + sheet'}
                </button>
              )}
            </div>
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
