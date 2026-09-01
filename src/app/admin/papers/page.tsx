'use client';

// /admin/papers — every marked script, in one place, filterable by student.
//
// Two jobs, and they feed each other:
//   1. Lesson-time review — pull up a student's scripts on the iPad and go
//      through them. Each row leads straight to the annotated copy, and carries
//      the topics that actually bled marks so the conversation starts somewhere.
//   2. Tagging the backlog — a run only reaches a student's profile, and only
//      counts as evidence in a parent report, once it carries a student_id.
//      Most historical runs never got one, so every row has an inline picker.
//
// Filtering by student with nothing tagged would show an empty page and read as
// broken, so the default view is everything, with the untagged count up front.

import { useState, useEffect, useCallback } from 'react';
import { ensureAdminSession, loginAdminSession } from '@/lib/admin-client';
import StudentPicker from '@/components/StudentPicker';

type Topic = { topic: string; awarded: number; max: number; lost: number; pct: number; questions: number };
type LostQ = { questionNumber: string; awarded: number; max: number; topic: string | null };

type Run = {
  id: string;
  date: string;
  paperName: string;
  studentId: string | null;
  studentName: string | null;
  awarded: number;
  max: number;
  pct: number | null;
  questions: number;
  pending: number;
  released: boolean;
  superseded: boolean;
  checked: boolean;
  annotatedPdfUrl: string | null;
  photosPdfUrl: string | null;
  pdfUrl: string | null;
  topics: Topic[];
  lostQuestions: LostQ[];
};

const C = {
  border: '#e5e7eb',
  muted: '#6b7280',
  faint: '#9ca3af',
  ink: '#111827',
  link: '#2563eb',
  pen: '#7c3aed',
  danger: '#b91c1c',
};

/** Topics shown before the row offers the rest. Three fits one line on a phone. */
const TOPICS_SHOWN_INLINE = 3;

function scoreColour(pct: number | null) {
  if (pct === null) return C.muted;
  if (pct >= 80) return '#15803d';
  if (pct >= 60) return '#a16207';
  return '#b91c1c';
}

function fmtDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: '2-digit' });
}

export default function PapersPage() {
  const [password, setPassword] = useState('');
  const [authed, setAuthed] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  const [runs, setRuns] = useState<Run[]>([]);
  const [stats, setStats] = useState<{ total: number; untagged: number; unchecked: number; students: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [filterStudent, setFilterStudent] = useState('');
  const [untaggedOnly, setUntaggedOnly] = useState(false);
  const [uncheckedOnly, setUncheckedOnly] = useState(false);
  const [tagging, setTagging] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // Two-tap guards: the run armed for deletion, and whether the bulk ✓ is
  // armed. The client confirm IS the delete guard — the API asks no questions.
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [bulkArmed, setBulkArmed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/admin/papers');
      const d = await r.json();
      if (!r.ok || d.error) { setError(d.error || 'Failed to load'); return; }
      setRuns(d.runs || []);
      setStats(d.stats || null);
      setError('');
    } catch { setError('Connection error'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { ensureAdminSession().then(ok => { if (ok) setAuthed(true); }); }, []);
  useEffect(() => { if (authed) load(); }, [authed, load]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 2600);
    return () => clearTimeout(t);
  }, [toast]);
  // A stray first tap must not leave a live "delete for good?" button around.
  useEffect(() => {
    if (!confirmingDelete && !bulkArmed) return;
    const t = setTimeout(() => { setConfirmingDelete(null); setBulkArmed(false); }, 4000);
    return () => clearTimeout(t);
  }, [confirmingDelete, bulkArmed]);

  async function verify(pw: string) {
    setAuthLoading(true);
    try {
      if (await loginAdminSession(pw)) setAuthed(true);
      else setAuthError('Incorrect password');
    } catch { setAuthError('Connection error'); }
    finally { setAuthLoading(false); }
  }

  async function tag(runId: string, studentId: string, name: string) {
    const before = runs.find(r => r.id === runId);
    setRuns(prev => prev.map(r => (r.id === runId ? { ...r, studentId: studentId || null, studentName: studentId ? name : null } : r)));
    setTagging(null);
    try {
      const r = await fetch('/api/admin/papers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId, studentId: studentId || null }),
      });
      const d = await r.json();
      if (!r.ok || d.error) {
        // Put the old tag back — a row that silently reverts on the next reload
        // is worse than one that never appeared to change.
        setRuns(prev => prev.map(x => (x.id === runId && before ? before : x)));
        setToast(d.error || 'Could not tag');
        return;
      }
      setRuns(prev => prev.map(x => (x.id === runId ? { ...x, studentName: d.studentName } : x)));
      setStats(s => (s ? { ...s, untagged: Math.max(0, s.untagged + (studentId ? -1 : 1)) } : s));
      setToast(studentId ? `Tagged to ${d.studentName}` : 'Tag removed');
    } catch {
      setRuns(prev => prev.map(x => (x.id === runId && before ? before : x)));
      setToast('Connection error');
    }
  }

  // ✓ Checked — "I've been through this one." Set automatically when a paper is
  // annotated or sent; this toggle covers the papers Adrian reviewed and had
  // nothing to change on, which no other action would ever record.
  async function setCheckedState(runId: string, checked: boolean) {
    const before = runs.find(r => r.id === runId);
    setRuns(prev => prev.map(r => (r.id === runId ? { ...r, checked } : r)));
    setStats(st => (st ? { ...st, unchecked: Math.max(0, st.unchecked + (checked ? -1 : 1)) } : st));
    try {
      const r = await fetch('/api/admin/papers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId, checked }),
      });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || 'Could not update');
      setToast(checked ? '✓ Marked as checked' : 'Moved back to not checked');
    } catch (e) {
      setRuns(prev => prev.map(x => (x.id === runId && before ? before : x)));
      setStats(st => (st ? { ...st, unchecked: Math.max(0, st.unchecked + (checked ? 1 : -1)) } : st));
      setToast((e as Error).message || 'Connection error');
    }
  }

  const visible = runs.filter(r => {
    if (untaggedOnly && r.studentId) return false;
    if (uncheckedOnly && r.checked) return false;
    if (filterStudent && r.studentId !== filterStudent) return false;
    return true;
  });
  const visibleUnchecked = visible.filter(r => !r.checked);

  // Bulk ✓ — clears the whole backlog in one go. Scoped to what the current
  // filters show, so "all" means exactly the papers on screen.
  async function checkAllVisible() {
    const ids = visibleUnchecked.map(r => r.id);
    setBulkArmed(false);
    if (!ids.length) return;
    const idSet = new Set(ids);
    const beforeRuns = runs, beforeStats = stats;
    setRuns(prev => prev.map(r => (idSet.has(r.id) ? { ...r, checked: true } : r)));
    setStats(st => (st ? { ...st, unchecked: Math.max(0, st.unchecked - ids.length) } : st));
    try {
      const r = await fetch('/api/admin/papers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runIds: ids, checked: true }),
      });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || 'Could not update');
      setToast(`✓ ${ids.length} paper${ids.length === 1 ? '' : 's'} marked as checked`);
    } catch (e) {
      setRuns(beforeRuns);
      setStats(beforeStats);
      setToast((e as Error).message || 'Connection error');
    }
  }

  // 🧺 Shelve a lost-marks question for a later teaching round (IDEAS.md
  // "wave 2 waiting"): the shelf API grabs the prompt, part scores and the
  // annotated page from the run's own result_json — one tap, no re-diagnosis
  // when wave 2 gets picked. Only tagged runs: the shelf is per-student.
  const [shelveOpen, setShelveOpen] = useState<Set<string>>(new Set());
  const [shelvedQs, setShelvedQs] = useState<Set<string>>(new Set());
  const [shelving, setShelving] = useState('');
  async function shelveQuestion(run: Run, q: LostQ) {
    const key = `${run.id}:${q.questionNumber}`;
    setShelving(key);
    try {
      const r = await fetch('/api/admin/shelf', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromRun: { runId: run.id, questionNumber: q.questionNumber },
          ...(q.topic ? { topic: q.topic } : {}),
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.status === 409) {
        setShelvedQs(prev => new Set(prev).add(key));
        setToast(`Q${q.questionNumber} is already on the shelf`);
      } else if (!r.ok) {
        setToast(d.error || 'Could not shelve it');
      } else {
        setShelvedQs(prev => new Set(prev).add(key));
        setToast(`🧺 On the shelf — Q${q.questionNumber}${q.topic ? ` · ${q.topic}` : ''}`);
      }
    } catch { setToast('Connection error'); }
    finally { setShelving(''); }
  }

  async function deleteRun(runId: string) {
    setConfirmingDelete(null);
    const run = runs.find(r => r.id === runId);
    const beforeRuns = runs, beforeStats = stats;
    setRuns(prev => prev.filter(r => r.id !== runId));
    setStats(st => (st && run
      ? {
          ...st,
          total: Math.max(0, st.total - 1),
          untagged: Math.max(0, st.untagged - (run.studentId ? 0 : 1)),
          unchecked: Math.max(0, st.unchecked - (run.checked ? 0 : 1)),
        }
      : st));
    try {
      const r = await fetch(`/api/admin/papers?id=${encodeURIComponent(runId)}`, { method: 'DELETE' });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || 'Could not delete');
      setToast('Run deleted');
    } catch (e) {
      // Put the row back — a deletion that silently failed must not look done.
      setRuns(beforeRuns);
      setStats(beforeStats);
      setToast((e as Error).message || 'Connection error');
    }
  }

  // ── Auth gate ───────────────────────────────────────────────────────────────
  if (!authed) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        <form
          onSubmit={e => { e.preventDefault(); verify(password); }}
          style={{ width: '100%', maxWidth: 320, display: 'flex', flexDirection: 'column', gap: 10 }}
        >
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>📚 Marked papers</h1>
          <input
            type="password" value={password} onChange={e => setPassword(e.target.value)}
            placeholder="Admin password" autoFocus
            style={{ padding: '12px 14px', fontSize: 16, border: `1px solid ${C.border}`, borderRadius: 10 }}
          />
          {authError && <div style={{ color: C.danger, fontSize: 13 }}>{authError}</div>}
          <button type="submit" disabled={authLoading} style={{ padding: '12px 14px', fontSize: 16, fontWeight: 600, borderRadius: 10, border: 'none', background: C.ink, color: '#fff' }}>
            {authLoading ? '…' : 'Enter'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif', maxWidth: 860, margin: '0 auto', padding: '16px 14px 80px', color: C.ink }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>📚 Marked papers</h1>
        <a href="/admin" style={{ fontSize: 13, color: C.link, textDecoration: 'none' }}>← Admin</a>
      </div>
      <p style={{ fontSize: 13, color: C.muted, margin: '4px 0 14px' }}>
        {loading ? 'Loading…' : stats
          ? <>
              {/* Runs tagged, then how many distinct students they belong to —
                  "1 student tagged" next to "41 untagged" reads as 42 scripts. */}
              {stats.total} script{stats.total === 1 ? '' : 's'} · {stats.total - stats.untagged} tagged
              {stats.students > 0 && <> to {stats.students} student{stats.students === 1 ? '' : 's'}</>}
              {stats.untagged > 0 && (
                <> · <b style={{ color: '#a16207' }}>{stats.untagged} untagged</b> — a script with no name never reaches the
                student&rsquo;s profile or their parent report</>
              )}
              {stats.unchecked > 0 && (
                <> · <b style={{ color: C.pen }}>{stats.unchecked} not checked yet</b></>
              )}
            </>
          : ''}
      </p>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <StudentPicker
          value={filterStudent}
          onChange={id => { setFilterStudent(id); if (id) setUntaggedOnly(false); }}
          placeholder="All students"
          style={{ padding: '9px 12px', fontSize: 15, borderRadius: 10, border: `1px solid ${C.border}`, background: '#fff', minWidth: 190 }}
        />
        <button
          onClick={() => { setUntaggedOnly(v => !v); if (!untaggedOnly) setFilterStudent(''); }}
          style={{
            padding: '9px 13px', fontSize: 14, fontWeight: 600, borderRadius: 999, cursor: 'pointer',
            border: `1px solid ${untaggedOnly ? C.ink : C.border}`,
            background: untaggedOnly ? C.ink : '#fff', color: untaggedOnly ? '#fff' : '#374151',
          }}
        >
          Needs tagging
        </button>
        <button
          onClick={() => setUncheckedOnly(v => !v)}
          style={{
            padding: '9px 13px', fontSize: 14, fontWeight: 600, borderRadius: 999, cursor: 'pointer',
            border: `1px solid ${uncheckedOnly ? C.pen : C.border}`,
            background: uncheckedOnly ? C.pen : '#fff', color: uncheckedOnly ? '#fff' : '#374151',
          }}
        >
          Not checked yet
        </button>
        {visibleUnchecked.length > 0 && (
          <button
            onClick={() => (bulkArmed ? checkAllVisible() : setBulkArmed(true))}
            title="Mark every paper currently shown as checked"
            style={{
              padding: '9px 13px', fontSize: 14, fontWeight: 600, borderRadius: 999, cursor: 'pointer',
              border: '1px solid #bbf7d0',
              background: bulkArmed ? '#15803d' : '#f0fdf4', color: bulkArmed ? '#fff' : '#15803d',
            }}
          >
            {bulkArmed
              ? `Tap again — mark ${visibleUnchecked.length} checked`
              : `✓ Mark all ${visibleUnchecked.length} as checked`}
          </button>
        )}
        {(filterStudent || untaggedOnly || uncheckedOnly) && (
          <button
            onClick={() => { setFilterStudent(''); setUntaggedOnly(false); setUncheckedOnly(false); }}
            style={{ padding: '9px 4px', fontSize: 13, border: 'none', background: 'none', color: C.muted, cursor: 'pointer' }}
          >
            Clear
          </button>
        )}
      </div>

      {error && (
        <div style={{ padding: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, color: C.danger, fontSize: 14, marginBottom: 14 }}>
          {error}
        </div>
      )}

      {visible.map(run => {
        const open = expanded.has(run.id);
        return (
          <div key={run.id} style={{ border: `1px solid ${C.border}`, borderRadius: 14, padding: 14, marginBottom: 10, background: '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 700, wordBreak: 'break-word' }}>{run.paperName}</div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                  {fmtDate(run.date)} · {run.questions} question{run.questions === 1 ? '' : 's'}
                  {run.pending > 0 && <span style={{ color: '#a16207', fontWeight: 700 }}> · ⏳ {run.pending} to check</span>}
                  {run.released && <span style={{ color: '#15803d' }}> · sent</span>}
                  {run.superseded && (
                    <span style={{ color: C.faint }} title="A later re-mark of this paper replaced it — the student sees the newer one">
                      {' '}· replaced by a re-mark
                    </span>
                  )}
                  {run.checked && (
                    <button
                      onClick={() => setCheckedState(run.id, false)}
                      title="Tap to move back to not-checked"
                      style={{ border: 'none', background: 'none', padding: 0, marginLeft: 4, fontSize: 12, fontWeight: 700, color: '#15803d', cursor: 'pointer' }}
                    >
                      · ✓ checked
                    </button>
                  )}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 19, fontWeight: 800, color: scoreColour(run.pct), lineHeight: 1.1 }}>
                  {run.max > 0 ? `${run.awarded}/${run.max}` : '—'}
                </div>
                {run.pct !== null && <div style={{ fontSize: 12, color: C.faint }}>{run.pct}%</div>}
              </div>
            </div>

            {/* Who it belongs to — the one field that makes everything else work */}
            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {tagging === run.id ? (
                <>
                  <StudentPicker
                    value={run.studentId || ''}
                    onChange={(id, s) => tag(run.id, id, s?.name || '')}
                    placeholder="Pick student…"
                    autoFocus
                    style={{ padding: '7px 11px', fontSize: 15, borderRadius: 9, border: `1px solid ${C.border}`, background: '#fff' }}
                  />
                  <button onClick={() => setTagging(null)} style={{ padding: '7px 10px', fontSize: 13, border: 'none', background: 'none', color: C.muted, cursor: 'pointer' }}>
                    Cancel
                  </button>
                </>
              ) : run.studentId ? (
                <>
                  <a href={`/admin/students/${run.studentId}`} style={{ fontSize: 14, fontWeight: 600, color: C.link, textDecoration: 'none' }}>
                    👤 {run.studentName || 'Student'}
                  </a>
                  <button onClick={() => setTagging(run.id)} style={{ padding: '4px 8px', fontSize: 12, borderRadius: 999, border: `1px solid ${C.border}`, background: '#fff', color: C.muted, cursor: 'pointer' }}>
                    change
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setTagging(run.id)}
                  style={{ padding: '7px 12px', fontSize: 13, fontWeight: 700, borderRadius: 999, border: '1px solid #fcd34d', background: '#fffbeb', color: '#a16207', cursor: 'pointer' }}
                >
                  + Tag a student
                </button>
              )}
            </div>

            {/* Where the marks went — what you actually talk about. Weakest
                first (the API sorts them), so the top three ARE the lesson. */}
            {run.topics.length > 0 && (
              <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {(open ? run.topics : run.topics.slice(0, TOPICS_SHOWN_INLINE)).map(t => {
                  const chipStyle: React.CSSProperties = {
                    padding: '4px 10px', fontSize: 12, fontWeight: 600, borderRadius: 999,
                    background: t.pct >= 80 ? '#f0fdf4' : t.pct >= 60 ? '#fefce8' : '#fef2f2',
                    color: scoreColour(t.pct),
                    border: `1px solid ${t.pct >= 80 ? '#bbf7d0' : t.pct >= 60 ? '#fde68a' : '#fecaca'}`,
                    textDecoration: 'none',
                  };
                  const title = `${t.awarded}/${t.max} across ${t.questions} question${t.questions === 1 ? '' : 's'}`;
                  // Tagged run → the chip is a 📬 Send follow-up door (SPEC-ASSIGN.md):
                  // lands on the student profile with this topic pre-filled.
                  return run.studentId ? (
                    <a key={t.topic} href={`/admin/students/${run.studentId}?send=${encodeURIComponent(t.topic)}`} title={`${title} — 📬 send a follow-up question`} style={chipStyle}>
                      {t.topic} {t.awarded}/{t.max} <span aria-hidden>📬</span>
                    </a>
                  ) : (
                    <span key={t.topic} title={title} style={chipStyle}>
                      {t.topic} {t.awarded}/{t.max}
                    </span>
                  );
                })}
              </div>
            )}

            {/* The copies. Annotated first — once his pen is on it, that IS the paper. */}
            <div style={{ marginTop: 11, display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
              <a href={`/admin/mark-paper?run=${run.id}&annotate=1`} style={{ fontSize: 14, fontWeight: 700, color: C.pen, textDecoration: 'none' }}>
                ✍️ Annotate
              </a>
              {run.annotatedPdfUrl && (
                <a href={run.annotatedPdfUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 14, color: C.pen, textDecoration: 'none' }}>
                  ✍️ Annotated PDF ↗
                </a>
              )}
              {run.photosPdfUrl && (
                <a href={run.photosPdfUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 14, color: C.link, textDecoration: 'none' }}>
                  🖼 Images ↗
                </a>
              )}
              {run.pdfUrl && (
                <a href={run.pdfUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 14, color: C.link, textDecoration: 'none' }}>
                  📄 Full PDF ↗
                </a>
              )}
              {!run.checked && (
                <button
                  onClick={() => setCheckedState(run.id, true)}
                  title="I've been through this paper — nothing to change"
                  style={{ padding: '4px 10px', fontSize: 13, fontWeight: 700, borderRadius: 999, border: '1px solid #bbf7d0', background: '#f0fdf4', color: '#15803d', cursor: 'pointer' }}
                >
                  ✓ Checked
                </button>
              )}
              {run.topics.length > TOPICS_SHOWN_INLINE && (
                <button
                  onClick={() => setExpanded(s => { const n = new Set(s); n.has(run.id) ? n.delete(run.id) : n.add(run.id); return n; })}
                  style={{ padding: 0, border: 'none', background: 'none', color: C.muted, fontSize: 13, cursor: 'pointer' }}
                >
                  {open ? '− fewer topics' : '+ all topics'}
                </button>
              )}
              {run.studentId && run.lostQuestions.length > 0 && (
                <button
                  onClick={() => setShelveOpen(s => { const n = new Set(s); if (n.has(run.id)) n.delete(run.id); else n.add(run.id); return n; })}
                  title="Park a weakness for a later teaching round — its question, scores and marked page go with it"
                  style={{ padding: 0, border: 'none', background: 'none', color: '#6d28d9', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
                >
                  {shelveOpen.has(run.id) ? '🧺 close' : '🧺 Shelve…'}
                </button>
              )}
              {/* Far right, away from the everyday taps. Removes the run AND
                  its stored files — the armed state is the only guard. */}
              {confirmingDelete === run.id ? (
                <button
                  onClick={() => deleteRun(run.id)}
                  style={{ marginLeft: 'auto', padding: '4px 10px', fontSize: 13, fontWeight: 700, borderRadius: 999, border: '1px solid #fecaca', background: '#fef2f2', color: C.danger, cursor: 'pointer' }}
                >
                  Delete for good?
                </button>
              ) : (
                <button
                  onClick={() => setConfirmingDelete(run.id)}
                  title="Delete this run and every file it stored"
                  style={{ marginLeft: 'auto', padding: '4px 6px', fontSize: 14, border: 'none', background: 'none', color: C.faint, cursor: 'pointer' }}
                >
                  🗑
                </button>
              )}
            </div>

            {/* 🧺 The lost-marks questions, one tap each onto the student's
                shelf. Receipts stay visible so a double-tap can't stack. */}
            {shelveOpen.has(run.id) && run.studentId && (
              <div style={{ marginTop: 9, padding: '8px 10px', background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: 10 }}>
                <div style={{ fontSize: 12, color: '#6d28d9', fontWeight: 700, marginBottom: 6 }}>
                  Shelve for a later wave — evidence rides along
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {run.lostQuestions.map(q => {
                    const key = `${run.id}:${q.questionNumber}`;
                    const done = shelvedQs.has(key);
                    return (
                      <button
                        key={key}
                        disabled={done || shelving === key}
                        onClick={() => shelveQuestion(run, q)}
                        title={q.topic || undefined}
                        style={{
                          padding: '4px 10px', fontSize: 12.5, fontWeight: 600, borderRadius: 999, cursor: done ? 'default' : 'pointer',
                          border: `1px solid ${done ? '#ddd6fe' : '#c4b5fd'}`,
                          background: done ? '#f5f3ff' : '#fff', color: '#5b21b6', opacity: shelving === key ? 0.6 : 1,
                        }}
                      >
                        {done ? '✓' : '🧺'} Q{q.questionNumber} {q.awarded}/{q.max}{q.topic ? ` · ${q.topic}` : ''}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {!loading && visible.length === 0 && !error && (
        <div style={{ padding: '40px 16px', textAlign: 'center', color: C.faint, fontSize: 15 }}>
          {runs.length === 0 ? 'No marked papers yet.' : 'Nothing matches that filter.'}
        </div>
      )}

      {toast && (
        <div style={{ position: 'fixed', left: 14, right: 14, bottom: 18, margin: '0 auto', maxWidth: 420, padding: '11px 14px', background: C.ink, color: '#fff', borderRadius: 12, fontSize: 14, textAlign: 'center' }}>
          {toast}
        </div>
      )}
    </div>
  );
}
