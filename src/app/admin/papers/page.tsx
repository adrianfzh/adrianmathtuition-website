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
  checked: boolean;
  annotatedPdfUrl: string | null;
  photosPdfUrl: string | null;
  pdfUrl: string | null;
  topics: Topic[];
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

  const visible = runs.filter(r => {
    if (untaggedOnly && r.studentId) return false;
    if (uncheckedOnly && r.checked) return false;
    if (filterStudent && r.studentId !== filterStudent) return false;
    return true;
  });

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
                {(open ? run.topics : run.topics.slice(0, TOPICS_SHOWN_INLINE)).map(t => (
                  <span
                    key={t.topic}
                    title={`${t.awarded}/${t.max} across ${t.questions} question${t.questions === 1 ? '' : 's'}`}
                    style={{
                      padding: '4px 10px', fontSize: 12, fontWeight: 600, borderRadius: 999,
                      background: t.pct >= 80 ? '#f0fdf4' : t.pct >= 60 ? '#fefce8' : '#fef2f2',
                      color: scoreColour(t.pct),
                      border: `1px solid ${t.pct >= 80 ? '#bbf7d0' : t.pct >= 60 ? '#fde68a' : '#fecaca'}`,
                    }}
                  >
                    {t.topic} {t.awarded}/{t.max}
                  </span>
                ))}
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
            </div>
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
