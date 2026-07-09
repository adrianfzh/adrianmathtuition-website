'use client';

// /admin/exams — the fast-entry cohort page for exam dates · topics · results.
// Replaces tapping each student pill on /admin/schedule. Inline autosave per cell.
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { ensureAdminSession, loginAdminSession } from '@/lib/admin-client';
import { resolveActiveExamType } from '@/lib/exam-season';
import { getExamTopicsForSubject } from '@/lib/canonical-topics';
import {
  EXAM_TYPES, examPercent, gradeFromScore, resultTone, RESULT_TONE_COLORS, examTypeLabel,
} from '@/lib/exam-grade';

const LEVELS = ['Sec 1', 'Sec 2', 'Sec 3', 'Sec 4', 'Sec 5', 'JC1', 'JC2'];

interface Student { id: string; name: string; level: string; subjects: string[]; subjectLevel: string; }
interface Exam {
  id: string; studentId: string | null; examType: string; customName: string; subject: string;
  examDate: string; testedTopics: string; resultScore: number | null; resultTotal: number | null;
  resultGrade: string; resultNotes: string; examNotes: string; noExam: boolean;
}

function primarySubject(s: Student): string {
  const subs = s.subjects || [];
  if (subs.includes('A Math')) return 'A Math';
  if (subs.includes('E Math')) return 'E Math';
  return subs[0] || '';
}
function topicTokens(str: string): string[] {
  return (str || '').split(',').map(t => t.trim()).filter(Boolean);
}
function fmtDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short' });
}

export default function ExamsPage() {
  const [password, setPassword] = useState('');
  const [authed, setAuthed] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Airtable keeps ONE live Exams record per (student, type) — no Year column —
  // so the year is a label for the current cycle, not a filter.
  const year = new Date().getFullYear();
  const [examType, setExamType] = useState<string>(() => resolveActiveExamType(null) || 'WA3');
  const [levelFilter, setLevelFilter] = useState<string>('All');
  const [resultsMode, setResultsMode] = useState(false);

  const [students, setStudents] = useState<Student[]>([]);
  const [examByStudent, setExamByStudent] = useState<Record<string, Exam>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);

  // Per-cell save flash, keyed `${studentId}:${field}`
  const [cellState, setCellState] = useState<Record<string, 'saving' | 'saved' | 'error'>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  // Topics popover: which student's topics are open
  const [topicsFor, setTopicsFor] = useState<string | null>(null);
  // Bulk apply draft
  const [bulk, setBulk] = useState<{ date: string; topics: string } | null>(null);

  function showToast(kind: 'ok' | 'err', msg: string) {
    setToast({ kind, msg });
    setTimeout(() => setToast(null), 3000);
  }

  const fetchData = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch(`/api/admin/exams?type=${encodeURIComponent(examType)}&year=${year}`);
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to load');
      const d = await res.json();
      setStudents(d.students || []);
      const map: Record<string, Exam> = {};
      for (const e of (d.exams || []) as Exam[]) {
        if (e.studentId && !map[e.studentId]) map[e.studentId] = e;
      }
      setExamByStudent(map);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Failed'); }
    finally { setLoading(false); }
  }, [examType, year]);

  useEffect(() => { ensureAdminSession().then(ok => { if (ok) setAuthed(true); }); }, []);
  useEffect(() => { if (authed) fetchData(); }, [authed, fetchData]);

  // Default to the effective active period incl. the manual Airtable override
  // (resolveActiveExamType(null) above only knows the date windows). Never
  // clobbers a type the user has already tapped.
  const userPickedType = useRef(false);
  useEffect(() => {
    if (!authed) return;
    (async () => {
      try {
        const r = await fetch('/api/admin/exam-season');
        if (!r.ok) return;
        const d = await r.json();
        if (d.active && !userPickedType.current) setExamType(d.active);
      } catch { /* non-fatal — date-based default stands */ }
    })();
  }, [authed]);

  async function verify(pw: string) {
    setAuthLoading(true);
    try {
      const ok = await loginAdminSession(pw);
      if (ok) setAuthed(true); else setAuthError('Incorrect password');
    } catch { setAuthError('Connection error'); }
    finally { setAuthLoading(false); }
  }

  // Save one field for one student (debounced), optimistic local update.
  function saveField(studentId: string, patch: Partial<Exam>, fieldKey: string) {
    // Optimistic local update (also recompute grade preview client-side)
    setExamByStudent(prev => {
      const cur = prev[studentId] || emptyExam(studentId, examType);
      const next = { ...cur, ...patch };
      if ('resultScore' in patch || 'resultTotal' in patch) {
        next.resultGrade = gradeFromScore(next.resultScore, next.resultTotal);
      }
      return { ...prev, [studentId]: next };
    });
    const key = `${studentId}:${fieldKey}`;
    if (timers.current[key]) clearTimeout(timers.current[key]);
    setCellState(s => ({ ...s, [key]: 'saving' }));
    timers.current[key] = setTimeout(async () => {
      try {
        const res = await fetch('/api/admin/exams', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ studentId, examType, ...patch }),
        });
        if (!res.ok) throw new Error();
        const saved: Exam = await res.json();
        setExamByStudent(prev => ({ ...prev, [studentId]: saved }));
        setCellState(s => ({ ...s, [key]: 'saved' }));
        setTimeout(() => setCellState(s => { const n = { ...s }; delete n[key]; return n; }), 1200);
      } catch {
        setCellState(s => ({ ...s, [key]: 'error' }));
      }
    }, 500);
  }

  useEffect(() => () => { Object.values(timers.current).forEach(clearTimeout); }, []);

  const visibleStudents = useMemo(
    () => students.filter(s => levelFilter === 'All' || s.level === levelFilter),
    [students, levelFilter],
  );
  const grouped = useMemo(() => {
    const g: { level: string; rows: Student[] }[] = [];
    for (const lvl of LEVELS) {
      const rows = visibleStudents.filter(s => s.level === lvl);
      if (rows.length) g.push({ level: lvl, rows });
    }
    const known = new Set(LEVELS);
    const other = visibleStudents.filter(s => !known.has(s.level));
    if (other.length) g.push({ level: 'Other', rows: other });
    return g;
  }, [visibleStudents]);

  function toggleSelect(id: string) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function selectAllLevel(level: string) {
    const ids = visibleStudents.filter(s => s.level === level).map(s => s.id);
    setSelected(prev => {
      const n = new Set(prev);
      const allIn = ids.every(i => n.has(i));
      ids.forEach(i => allIn ? n.delete(i) : n.add(i));
      return n;
    });
  }

  async function applyBulk() {
    if (!bulk || selected.size === 0) return;
    const body: any = { bulk: true, studentIds: [...selected], examType };
    if (bulk.date) body.examDate = bulk.date;
    if (bulk.topics.trim()) body.testedTopics = bulk.topics.trim();
    if (!body.examDate && !body.testedTopics) { showToast('err', 'Set a date or topics first'); return; }
    try {
      const res = await fetch('/api/admin/exams', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed');
      showToast('ok', `Updated ${d.updated} student${d.updated === 1 ? '' : 's'}`);
      setBulk(null); setSelected(new Set());
      fetchData();
    } catch (e: unknown) { showToast('err', e instanceof Error ? e.message : 'Bulk update failed'); }
  }

  // ── Auth gate ────────────────────────────────────────────────────────────
  if (!authed) {
    return (
      <div style={{ minHeight: '100vh', background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <div style={{ width: '100%', maxWidth: 360, background: '#fff', borderRadius: 20, border: '1px solid #e5e7eb', padding: '32px 28px', textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📊</div>
          <h1 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px', color: '#111' }}>Exams</h1>
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

  const flash = (key: string) => {
    const st = cellState[key];
    if (st === 'saving') return <span style={{ fontSize: 10, color: '#94a3b8' }}>saving…</span>;
    if (st === 'saved') return <span style={{ fontSize: 10, color: '#15803d' }}>✓</span>;
    if (st === 'error') return <span style={{ fontSize: 10, color: '#dc2626' }}>error</span>;
    return null;
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f3f4f6' }}>
      {/* Sticky header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 20, background: '#fff', borderBottom: '1px solid #e5e7eb' }}>
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: '12px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <a href="/admin" style={{ color: '#9ca3af', textDecoration: 'none', fontSize: 22, lineHeight: 1, padding: 4 }}>‹</a>
            <span style={{ fontSize: 18, fontWeight: 700, color: '#111' }}>📊 Exams</span>
            {/* Exam-type selector */}
            <div style={{ display: 'flex', gap: 4, background: '#f1f5f9', borderRadius: 10, padding: 3 }}>
              {EXAM_TYPES.map(t => (
                <button key={t} onClick={() => { userPickedType.current = true; setExamType(t); }}
                  style={{ padding: '6px 12px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', border: 'none',
                    background: examType === t ? '#1e3a5f' : 'transparent', color: examType === t ? '#fff' : '#64748b' }}>
                  {t === 'EOY' ? 'EOY / Prelims' : t}
                </button>
              ))}
            </div>
            {/* Current cycle */}
            <span style={{ fontSize: 13, fontWeight: 700, color: '#64748b' }}>{year}</span>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#475569', cursor: 'pointer' }}>
                <input type="checkbox" checked={resultsMode} onChange={e => setResultsMode(e.target.checked)} />
                Results mode
              </label>
            </div>
          </div>
          {/* Level filter */}
          <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
            {['All', ...LEVELS].map(l => (
              <button key={l} onClick={() => setLevelFilter(l)}
                style={{ padding: '4px 11px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  border: levelFilter === l ? '1px solid #1d4ed8' : '1px solid #e5e7eb',
                  background: levelFilter === l ? '#eff6ff' : '#fff', color: levelFilter === l ? '#1d4ed8' : '#64748b' }}>
                {l}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1080, margin: '0 auto', padding: 16 }}>
        {loading && <div style={{ textAlign: 'center', color: '#9ca3af', padding: 40 }}>Loading…</div>}
        {error && <div style={{ color: '#dc2626', padding: 16 }}>{error}</div>}

        {!loading && !error && grouped.length === 0 && (
          <div style={{ color: '#9ca3af', fontSize: 14, padding: 24, textAlign: 'center' }}>No active students{levelFilter !== 'All' ? ` in ${levelFilter}` : ''}.</div>
        )}

        {!loading && grouped.map(g => (
          <div key={g.level} style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '0 2px 8px' }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: '#1e3a5f' }}>{g.level}</span>
              {/* EOY reads as "Prelims" for Sec 4 / Sec 5 */}
              {examType === 'EOY' && examTypeLabel('EOY', g.level) !== 'EOY' && (
                <span style={{ fontSize: 10.5, fontWeight: 800, color: '#7c3aed', background: '#f3e8ff', borderRadius: 6, padding: '1px 7px' }}>Prelims</span>
              )}
              <span style={{ fontSize: 11.5, color: '#94a3b8' }}>{g.rows.length}</span>
              <button onClick={() => selectAllLevel(g.level)}
                style={{ fontSize: 11, fontWeight: 600, color: '#1d4ed8', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, padding: '2px 8px', cursor: 'pointer' }}>
                select all {g.level}
              </button>
            </div>
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
              {g.rows.map((s, i) => {
                const ex = examByStudent[s.id];
                const pct = examPercent(ex?.resultScore, ex?.resultTotal);
                const tone = resultTone(pct);
                const tc = tone ? RESULT_TONE_COLORS[tone] : null;
                const tokens = topicTokens(ex?.testedTopics || '');
                const isSel = selected.has(s.id);
                const row = (children: React.ReactNode) => (
                  <div key={s.id} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderTop: i === 0 ? 'none' : '1px solid #f1f5f9', background: isSel ? '#f5f9ff' : '#fff', flexWrap: 'wrap' }}>
                    {children}
                  </div>
                );
                const nameCell = (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: 170, flexShrink: 0 }}>
                    <input type="checkbox" checked={isSel} onChange={() => toggleSelect(s.id)} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
                      <div style={{ fontSize: 10.5, color: '#94a3b8' }}>{primarySubject(s) || s.subjectLevel}</div>
                    </div>
                  </div>
                );
                const scoreCell = (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <input type="number" inputMode="numeric" placeholder="—" value={ex?.resultScore ?? ''}
                      onChange={e => saveField(s.id, { resultScore: e.target.value === '' ? null : Number(e.target.value) }, 'score')}
                      style={{ ...numInput, width: 52 }} />
                    <span style={{ color: '#cbd5e1' }}>/</span>
                    <input type="number" inputMode="numeric" placeholder="—" value={ex?.resultTotal ?? ''}
                      onChange={e => saveField(s.id, { resultTotal: e.target.value === '' ? null : Number(e.target.value) }, 'total')}
                      style={{ ...numInput, width: 52 }} />
                    {flash(`${s.id}:score`) || flash(`${s.id}:total`)}
                  </div>
                );
                const gradeCell = (
                  <div style={{ width: 96, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {pct != null && tc ? (
                      <>
                        <span style={{ fontSize: 13, fontWeight: 700, color: tc.fg }}>{pct.toFixed(1)}%</span>
                        <span style={{ fontSize: 11, fontWeight: 800, color: tc.fg, background: tc.bg, padding: '1px 7px', borderRadius: 6 }}>{ex?.resultGrade || gradeFromScore(ex?.resultScore, ex?.resultTotal)}</span>
                      </>
                    ) : <span style={{ fontSize: 12, color: '#cbd5e1' }}>—</span>}
                  </div>
                );

                if (resultsMode) {
                  return row(<>
                    {nameCell}
                    {scoreCell}
                    {gradeCell}
                    <input placeholder="notes" value={ex?.resultNotes ?? ''}
                      onChange={e => saveField(s.id, { resultNotes: e.target.value }, 'rnotes')}
                      style={{ ...txtInput, flex: 1, minWidth: 120 }} />
                    {flash(`${s.id}:rnotes`)}
                  </>);
                }

                return row(<>
                  {nameCell}
                  {/* Date */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, width: 150, flexShrink: 0 }}>
                    <input type="date" value={ex?.examDate || ''} disabled={ex?.noExam}
                      onChange={e => saveField(s.id, { examDate: e.target.value }, 'date')}
                      style={{ ...txtInput, width: 128, opacity: ex?.noExam ? 0.4 : 1 }} />
                    {flash(`${s.id}:date`)}
                  </div>
                  {/* Topics */}
                  <button onClick={() => setTopicsFor(topicsFor === s.id ? null : s.id)}
                    style={{ ...chipBtn, opacity: ex?.noExam ? 0.4 : 1 }} disabled={ex?.noExam}>
                    {tokens.length ? `${tokens.length} topic${tokens.length === 1 ? '' : 's'}` : '＋ topics'}
                  </button>
                  {/* No exam */}
                  <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: '#64748b', width: 78, flexShrink: 0, cursor: 'pointer' }}>
                    <input type="checkbox" checked={!!ex?.noExam} onChange={e => saveField(s.id, { noExam: e.target.checked }, 'noexam')} />
                    no exam
                  </label>
                  {scoreCell}
                  {gradeCell}
                  <input placeholder="notes" value={ex?.resultNotes ?? ''}
                    onChange={e => saveField(s.id, { resultNotes: e.target.value }, 'rnotes')}
                    style={{ ...txtInput, flex: 1, minWidth: 90 }} />
                  {topicsFor === s.id && (
                    <TopicsPopover
                      student={s} value={ex?.testedTopics || ''}
                      onClose={() => setTopicsFor(null)}
                      onChange={val => saveField(s.id, { testedTopics: val }, 'topics')}
                    />
                  )}
                </>);
              })}
            </div>
          </div>
        ))}
        <div style={{ height: selected.size > 0 ? 120 : 20 }} />
      </div>

      {/* Bulk bar */}
      {selected.size > 0 && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#0f172a', color: '#fff', zIndex: 40, boxShadow: '0 -4px 16px rgba(0,0,0,0.2)' }}>
          <div style={{ maxWidth: 1080, margin: '0 auto', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>{selected.size} selected</span>
            <button onClick={() => setSelected(new Set())} style={{ fontSize: 12, color: '#cbd5e1', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>clear</button>
            {!bulk ? (
              <button onClick={() => setBulk({ date: '', topics: '' })} style={bulkPrimary}>Set date / topics…</button>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <label style={{ fontSize: 12, color: '#cbd5e1' }}>Date <input type="date" value={bulk.date} onChange={e => setBulk({ ...bulk, date: e.target.value })} style={{ ...txtInput, color: '#111' }} /></label>
                <label style={{ fontSize: 12, color: '#cbd5e1' }}>Topics <input placeholder="comma-separated" value={bulk.topics} onChange={e => setBulk({ ...bulk, topics: e.target.value })} style={{ ...txtInput, color: '#111', width: 200 }} /></label>
                <button onClick={applyBulk} style={bulkPrimary}>Apply to {selected.size}</button>
                <button onClick={() => setBulk(null)} style={{ fontSize: 12, color: '#cbd5e1', background: 'none', border: 'none', cursor: 'pointer' }}>cancel</button>
              </div>
            )}
          </div>
        </div>
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: selected.size > 0 ? 80 : 20, left: '50%', transform: 'translateX(-50%)', background: toast.kind === 'ok' ? '#15803d' : '#dc2626', color: '#fff', padding: '10px 18px', borderRadius: 10, fontSize: 14, fontWeight: 600, zIndex: 100, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

function emptyExam(studentId: string, examType: string): Exam {
  return { id: '', studentId, examType, customName: '', subject: '', examDate: '', testedTopics: '', resultScore: null, resultTotal: null, resultGrade: '', resultNotes: '', examNotes: '', noExam: false };
}

// ── Topics editor popover ─────────────────────────────────────────────────────
function TopicsPopover({ student, value, onClose, onChange }: {
  student: Student; value: string; onClose: () => void; onChange: (val: string) => void;
}) {
  const [tokens, setTokens] = useState<string[]>(topicTokens(value));
  const [free, setFree] = useState('');
  const cats = useMemo(() => getExamTopicsForSubject(student.level, primarySubject(student)), [student]);

  function commit(next: string[]) {
    setTokens(next);
    onChange(next.join(', '));
  }
  function toggle(t: string) {
    commit(tokens.includes(t) ? tokens.filter(x => x !== t) : [...tokens, t]);
  }
  function addFree() {
    const v = free.trim();
    if (v && !tokens.includes(v)) commit([...tokens, v]);
    setFree('');
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 45 }} />
      <div style={{ position: 'absolute', zIndex: 46, marginTop: 6, top: '100%', left: 12, width: 340, maxHeight: 360, overflowY: 'auto', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.14)', padding: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>Tested topics · {student.name}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 15 }}>✕</button>
        </div>
        {tokens.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid #f1f5f9' }}>
            {tokens.map(t => (
              <button key={t} onClick={() => toggle(t)}
                style={{ fontSize: 11.5, fontWeight: 600, color: '#1d4ed8', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 999, padding: '2px 9px', cursor: 'pointer' }}>
                {t} ✕
              </button>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <input placeholder="Add own topic…" value={free} onChange={e => setFree(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addFree(); } }}
            style={{ ...txtInput, flex: 1 }} />
          <button onClick={addFree} style={chipBtn}>Add</button>
        </div>
        {cats.map(c => (
          <div key={c.label} style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: 4 }}>{c.label}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {c.topics.map(t => {
                const on = tokens.includes(t);
                return (
                  <button key={t} onClick={() => toggle(t)}
                    style={{ fontSize: 11, fontWeight: 500, cursor: 'pointer', borderRadius: 999, padding: '2px 8px',
                      border: on ? '1px solid #1d4ed8' : '1px solid #e5e7eb',
                      background: on ? '#eff6ff' : '#fff', color: on ? '#1d4ed8' : '#64748b' }}>
                    {t}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

const numInput: React.CSSProperties = { border: '1px solid #e5e7eb', borderRadius: 7, padding: '6px 8px', fontSize: 13, outline: 'none', boxSizing: 'border-box', textAlign: 'center' };
const txtInput: React.CSSProperties = { border: '1px solid #e5e7eb', borderRadius: 7, padding: '6px 9px', fontSize: 13, outline: 'none', boxSizing: 'border-box', background: '#fff' };
const chipBtn: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#1e3a5f', background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', flexShrink: 0 };
const bulkPrimary: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: '#0f172a', background: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', cursor: 'pointer' };
