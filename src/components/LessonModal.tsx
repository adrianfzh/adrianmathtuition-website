'use client';

// Shared lesson-progress modal — extracted verbatim from /admin/schedule so the
// student profile page can log progress in place. Brings its own CSS (lm-*).
import { useState, useEffect, useRef, useMemo } from 'react';
import { getTopicsForLevel, getExamTopicsForSubject, E_MATH_EXAM_TOPICS, A_MATH_EXAM_TOPICS, SEC12_EXAM_TOPICS, SECONDARY_FLAT, JC_FLAT } from '@/lib/canonical-topics';

export interface LessonModalLesson {
  id: string;
  studentId: string | null;
  studentName: string;
  date: string;
  slotId: string | null;
  type: string;
}

interface ExamRecord {
  examDate: string | null;
  examTopics: string | null;
  noExam: boolean;
  notes: string | null;
  score?: number | null;
  total?: number | null;
}

interface LessonContextData {
  current: {
    topicsCovered: string;
    homeworkAssigned: string;
    mastery: string;
    mood: string;
    lessonNotes: string;
    progressLogged: boolean;
  };
  prev: {
    id: string;
    date: string;
    topicsCovered: string;
    homeworkAssigned: string;
    homeworkReturned: string;
  } | null;
  studentLevel: string;
  studentSubjects: string[];
  examType: string | null;
  examsBySubject: Record<string, ExamRecord | null>;
  isEditable: boolean;
  isFuture: boolean;
}

function formatExamDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-SG', { day: 'numeric', month: 'short' });
}

const LM_CSS = `.lm-card {
  background: white;
  border-radius: 20px 20px 0 0;
  width: 100%; max-width: 520px;
  box-shadow: 0 -4px 32px rgba(0,0,0,0.18);
  display: flex; flex-direction: column;
  max-height: 92vh;
  overflow: hidden;
}
@media (min-width: 560px) {
  .lm-card { border-radius: 20px; max-height: 88vh; }
}
.lm-header {
  display: flex; align-items: flex-start;
  justify-content: space-between;
  padding: 18px 20px 14px;
  border-bottom: 1px solid #f1f5f9;
  flex-shrink: 0;
}
.lm-student-name { font-size: 18px; font-weight: 700; color: #0f172a; }
.lm-sub { font-size: 12px; color: #64748b; margin-top: 2px; }
.lm-body {
  flex: 1; overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 0 0 8px;
}
.lm-section {
  padding: 14px 20px;
  border-bottom: 1px solid #f1f5f9;
}
.lm-section:last-child { border-bottom: none; }
.lm-section-title {
  font-size: 11px; font-weight: 700;
  letter-spacing: 0.08em; text-transform: uppercase;
  color: #94a3b8; margin-bottom: 8px;
  display: flex; align-items: center; gap: 8px;
}
.lm-section-date {
  font-size: 11px; font-weight: 500; color: #cbd5e1;
  text-transform: none; letter-spacing: 0;
}
.lm-lock-banner {
  margin: 12px 20px; padding: 10px 14px;
  background: #fffbeb; border: 1px solid #fde68a;
  border-radius: 10px; font-size: 13px; color: #92400e;
  font-weight: 500;
}
.lm-exam-section {
  border: 2px solid #fbbf24 !important;
  border-radius: 12px;
  padding: 0 !important;
  overflow: hidden;
}
.lm-exam-toggle {
  display: flex; align-items: center; justify-content: space-between;
  width: 100%; padding: 10px 14px;
  background: #fffbeb; border: none; cursor: pointer;
  text-align: left;
}
.lm-exam-toggle:hover { background: #fef3c7; }
.lm-exam-season-header {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
}
.lm-exam-badge {
  display: inline-flex; align-items: center;
  background: #f59e0b; color: #fff;
  font-size: 12px; font-weight: 700; letter-spacing: 0.04em;
  padding: 3px 10px; border-radius: 20px;
  white-space: nowrap;
}
.lm-exam-season-label {
  font-size: 12px; color: #92400e; font-weight: 500;
}
.lm-exam-chevron {
  font-size: 11px; color: #d97706; flex-shrink: 0;
}
.lm-sub-meta {
  font-size: 12px; color: #64748b; margin-top: 2px;
}
.lm-recap-row {
  display: flex; gap: 10px; align-items: baseline;
  font-size: 13px; margin-bottom: 4px;
}
.lm-recap-label {
  font-size: 10px; font-weight: 700; letter-spacing: 0.07em;
  text-transform: uppercase; color: #94a3b8; min-width: 44px;
  flex-shrink: 0;
}
.lm-recap-val { color: #374151; line-height: 1.4; }
.lm-field-group { display: flex; flex-direction: column; gap: 5px; margin-bottom: 10px; }
.lm-field-group:last-child { margin-bottom: 0; }
.lm-field-label {
  font-size: 11px; font-weight: 700; letter-spacing: 0.07em;
  text-transform: uppercase; color: #94a3b8;
}
.lm-cat-label {
  font-size: 10px; font-weight: 600; color: #cbd5e1;
  text-transform: uppercase; letter-spacing: 0.05em;
  margin: 6px 0 3px;
}
.lm-topic-grid {
  display: flex; flex-wrap: wrap; gap: 5px;
  margin-bottom: 2px;
}
.lm-topic-chip {
  padding: 4px 10px; border-radius: 14px;
  border: 1.5px solid #e2e8f0; background: white;
  font-size: 12px; color: #475569; cursor: pointer;
  font-family: inherit; transition: background 0.12s, border-color 0.12s, color 0.12s;
  line-height: 1.4;
}
.lm-topic-chip:hover:not(:disabled) { background: #f1f5f9; border-color: #cbd5e1; }
.lm-topic-chip.selected { background: #1a365d; color: white; border-color: #1a365d; }
.lm-topic-chip:disabled { opacity: 0.45; cursor: default; }
.lm-radio-row { display: flex; gap: 6px; flex-wrap: wrap; }
.lm-radio-btn {
  padding: 6px 12px; border-radius: 20px;
  border: 1.5px solid #e2e8f0; background: white;
  font-size: 13px; color: #475569; cursor: pointer;
  font-family: inherit; transition: background 0.12s, border-color 0.12s;
  flex-shrink: 0;
}
.lm-radio-btn:hover:not(:disabled) { background: #f1f5f9; }
.lm-radio-btn.selected { background: #1a365d; color: white; border-color: #1a365d; }
.lm-radio-btn:disabled { opacity: 0.45; cursor: default; }
.lm-perf-btn { font-size: 13px; }
.lm-save-status { font-size: 11px; margin-top: 4px; font-weight: 600; }
.lm-check-row {
  display: flex; align-items: center; gap: 8px;
  font-size: 13px; color: #374151; cursor: pointer;
  margin-top: 2px;
}
.lm-check-row input[type="checkbox"] { width: 16px; height: 16px; accent-color: #1a365d; cursor: pointer; }
.lm-footer {
  display: flex; align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  border-top: 1px solid #f1f5f9;
  flex-shrink: 0;
  background: white;
}
.lm-autosave-status { font-size: 12px; font-weight: 600; min-height: 18px; }
.lm-full-link {
  font-size: 13px; font-weight: 600; color: #64748b;
  text-decoration: none; padding: 8px 12px;
  border-radius: 8px; border: 1px solid #e2e8f0;
  background: white; transition: background 0.12s;
}
.lm-full-link:hover { background: #f8fafc; }`;

export default function LessonModal({
  lesson,
  slots,
  onClose,
  onProgressLogged,
}: {
  lesson: LessonModalLesson;
  /** @deprecated Unused — auth is via the httpOnly admin session cookie. Kept optional until all callers stop passing it. */
  password?: string;
  slots: { id: string; time: string }[];
  onClose: () => void;
  onProgressLogged: (lessonId: string) => void;
}) {
  useEffect(() => {
    if (typeof document === 'undefined' || document.getElementById('lm-styles')) return;
    const el = document.createElement('style'); el.id = 'lm-styles'; el.textContent = LM_CSS;
    document.head.appendChild(el);
  }, []);

  const [ctx, setCtx] = useState<LessonContextData | null>(null);
  const [ctxLoading, setCtxLoading] = useState(true);
  const [ctxError, setCtxError] = useState('');

  // Editable fields for current lesson
  const [topicChips, setTopicChips] = useState<string[]>([]);
  const [topicFreeText, setTopicFreeText] = useState('');
  const [mastery, setMastery] = useState('');
  const [mood, setMood] = useState('');
  const [hwAssigned, setHwAssigned] = useState('');
  const [lessonNotes, setLessonNotes] = useState('');

  // Prev lesson homework returned
  const [prevHwReturned, setPrevHwReturned] = useState('');

  // Exam quick-add
  const [examExpanded, setExamExpanded] = useState(false);
  const [examSubject, setExamSubject] = useState('');        // '' | 'E Math' | 'A Math'
  const [examDate, setExamDate] = useState('');
  const [examTopicPills, setExamTopicPills] = useState<string[]>([]); // selected topic pills
  const [examNotes, setExamNotes] = useState('');
  const [examScore, setExamScore] = useState('');   // marks obtained
  const [examTotal, setExamTotal] = useState('');   // total marks
  const [noExam, setNoExam] = useState(false);
  const [examSaving, setExamSaving] = useState(false);
  const [examSaveMsg, setExamSaveMsg] = useState('');

  // Autosave current lesson
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fieldsRef = useRef<Record<string, string>>({});

  // Autosave prev lesson
  const [prevSaveStatus, setPrevSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const prevDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch context on mount
  useEffect(() => {
    setCtxLoading(true);
    fetch(`/api/admin-schedule/lesson-context?id=${lesson.id}`)
      .then(r => r.json())
      .then((data: LessonContextData) => {
        setCtx(data);
        const canonicalAll = [...SECONDARY_FLAT, ...JC_FLAT];
        // Separate saved lesson topics into canonical chips + free text
        const savedTopics = data.current.topicsCovered
          ? data.current.topicsCovered.split(',').map(t => t.trim()).filter(Boolean)
          : [];
        setTopicChips(savedTopics.filter(t => canonicalAll.includes(t)));
        setTopicFreeText(savedTopics.filter(t => !canonicalAll.includes(t)).join(', '));
        setMastery(data.current.mastery ?? '');
        setMood(data.current.mood ?? '');
        setHwAssigned(data.current.homeworkAssigned ?? '');
        setLessonNotes(data.current.lessonNotes ?? '');
        setPrevHwReturned(data.prev?.homeworkReturned ?? '');
        // Initialise fieldsRef FIRST so autosave always has something to send even if
        // the exam-parsing block below throws.
        fieldsRef.current = {
          topicsCovered: data.current.topicsCovered ?? '',
          mastery: data.current.mastery ?? '',
          mood: data.current.mood ?? '',
          homeworkAssigned: data.current.homeworkAssigned ?? '',
          lessonNotes: data.current.lessonNotes ?? '',
        };
        // Exam section setup (wrapped in try-catch so a shape mismatch never blocks saves)
        try {
          const isDualMath = (data.studentSubjects ?? []).includes('E Math') && (data.studentSubjects ?? []).includes('A Math');
          const rawSubjectKey = isDualMath ? 'E Math' : ((data.studentSubjects ?? [])[0] ?? '');
          // S1/S2 and any Sec student without Subjects set → default to 'E Math'
          // so topic pills show the E Math list rather than the combined [E]+[A] fallback.
          const isSecLevel = (data.studentLevel ?? '').toLowerCase().startsWith('sec');
          const subjectKey = rawSubjectKey || (isSecLevel ? 'E Math' : '');
          setExamSubject(subjectKey);
          const rec = (data.examsBySubject ?? {})[subjectKey] ?? (data.examsBySubject ?? {})[''] ?? null;
          setExamDate(rec?.examDate ?? '');
          setNoExam(rec?.noExam ?? false);
          const savedExamTopics = rec?.examTopics
            ? rec.examTopics.split(',').map((t: string) => t.trim()).filter(Boolean)
            : [];
          setExamTopicPills(savedExamTopics.filter((t: string) => canonicalAll.includes(t)));
          setExamNotes(rec?.notes ?? '');
          setExamScore(rec?.score != null ? String(rec.score) : '');
          setExamTotal(rec?.total != null ? String(rec.total) : '');
        } catch (e) {
          console.warn('[LessonModal] exam section init failed:', e);
        }
        setCtxLoading(false);
      })
      .catch(() => {
        setCtxError('Failed to load lesson context');
        setCtxLoading(false);
      });
    // lesson.id is the only meaningful dep — slots is a stable ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson.id]);

  // Clear pending timers when the modal closes to prevent post-unmount state updates.
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (prevDebounceRef.current) clearTimeout(prevDebounceRef.current);
    };
  }, []);

  async function doSave() {
    try {
      const res = await fetch('/api/admin-schedule/lesson-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lessonId: lesson.id, fields: fieldsRef.current }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        console.error('[LessonModal] save failed', res.status, json);
        setSaveStatus('error');
        setSaveError(json.error ?? `HTTP ${res.status}`);
        return;
      }
      setSaveStatus('saved');
      setSaveError('');
      onProgressLogged(lesson.id);
      setTimeout(() => setSaveStatus(s => s === 'saved' ? 'idle' : s), 2500);
    } catch (e) {
      console.error('[LessonModal] save network error', e);
      setSaveStatus('error');
      setSaveError('Network error');
    }
  }

  function scheduleAutosave(updates: Record<string, string>) {
    if (!ctx?.isEditable) return;
    fieldsRef.current = { ...fieldsRef.current, ...updates };
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSaveStatus('saving');
    debounceRef.current = setTimeout(doSave, 600);
  }

  function handleTopicToggle(topic: string) {
    if (!ctx?.isEditable) return;
    const next = topicChips.includes(topic)
      ? topicChips.filter(t => t !== topic)
      : [...topicChips, topic];
    setTopicChips(next);
    const combined = [...next, ...topicFreeText.split(',').map(t => t.trim()).filter(Boolean)].join(', ');
    scheduleAutosave({ topicsCovered: combined });
  }

  function handleFreeTextChange(val: string) {
    setTopicFreeText(val);
    const combined = [...topicChips, ...val.split(',').map(t => t.trim()).filter(Boolean)].join(', ');
    scheduleAutosave({ topicsCovered: combined });
  }

  function handleMasteryChange(val: string) {
    setMastery(val);
    scheduleAutosave({ mastery: val });
  }

  function handleMoodChange(val: string) {
    setMood(val);
    scheduleAutosave({ mood: val });
  }

  function handleHwAssignedChange(val: string) {
    setHwAssigned(val);
    scheduleAutosave({ homeworkAssigned: val });
  }

  function handleLessonNotesChange(val: string) {
    setLessonNotes(val);
    scheduleAutosave({ lessonNotes: val });
  }

  function handlePrevHwChange(val: string) {
    if (!ctx?.prev) return;
    setPrevHwReturned(val);
    if (prevDebounceRef.current) clearTimeout(prevDebounceRef.current);
    setPrevSaveStatus('saving');
    prevDebounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch('/api/admin-schedule/lesson-prev-update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lessonId: ctx.prev!.id, homeworkReturned: val }),
        });
        if (!res.ok) throw new Error();
        setPrevSaveStatus('saved');
        setTimeout(() => setPrevSaveStatus(s => s === 'saved' ? 'idle' : s), 2500);
      } catch {
        setPrevSaveStatus('error');
      }
    }, 500);
  }

  async function handleSaveExam() {
    if (!lesson.studentId || !ctx?.examType) return;
    setExamSaving(true);
    setExamSaveMsg('');
    try {
      const allTopics = examTopicPills.join(', ');
      const reqBody: Record<string, any> = {
        studentId: lesson.studentId,
        examType: ctx.examType,
        noExam,
        notes: examNotes,
      };
      if (examSubject) reqBody.subject = examSubject;
      if (!noExam) {
        reqBody.examDate = examDate || null;
        if (allTopics) reqBody.testedTopics = allTopics;
        const scoreNum = examScore !== '' ? parseFloat(examScore) : null;
        const totalNum = examTotal !== '' ? parseFloat(examTotal) : null;
        if (scoreNum !== null && !isNaN(scoreNum)) reqBody.score = scoreNum;
        if (totalNum !== null && !isNaN(totalNum)) reqBody.total = totalNum;
      }
      const res = await fetch('/api/admin-schedule/quick-add-exam', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqBody),
      });
      if (!res.ok) throw new Error();
      setExamSaveMsg('✓ Saved');
      setTimeout(() => setExamSaveMsg(''), 2500);
    } catch {
      setExamSaveMsg('⚠ Save failed');
    } finally {
      setExamSaving(false);
    }
  }

  // When subject changes, repopulate exam fields from the loaded context
  function handleExamSubjectChange(subj: string) {
    setExamSubject(subj);
    if (!ctx) return;
    const rec = ctx.examsBySubject[subj] ?? ctx.examsBySubject[''] ?? null;
    setExamDate(rec?.examDate ?? '');
    setNoExam(rec?.noExam ?? false);
    const savedTopics = rec?.examTopics
      ? rec.examTopics.split(',').map(t => t.trim()).filter(Boolean)
      : [];
    setExamTopicPills(savedTopics.filter(t => [...SECONDARY_FLAT, ...JC_FLAT].includes(t)));
    setExamNotes(rec?.notes ?? '');
    setExamScore(rec?.score != null ? String(rec.score) : '');
    setExamTotal(rec?.total != null ? String(rec.total) : '');
  }

  function handleExamTopicToggle(topic: string) {
    setExamTopicPills(prev =>
      prev.includes(topic) ? prev.filter(t => t !== topic) : [...prev, topic]
    );
  }

  const slotTime = lesson.slotId ? slots.find(s => s.id === lesson.slotId)?.time : '';
  const dateLabel = (() => {
    if (!lesson.date) return '';
    const d = new Date(lesson.date + 'T00:00:00');
    return d.toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short' });
  })();

  const topicCategories = useMemo(() => {
    if (!ctx) return [];
    const subjects = ctx.studentSubjects ?? [];
    const isSecLevel = ctx.studentLevel.toLowerCase().startsWith('sec');
    if (!isSecLevel) return getTopicsForLevel(ctx.studentLevel); // JC → JC_TOPICS
    const hasEM = subjects.includes('E Math');
    const hasAM = subjects.includes('A Math');
    // Sec 1/2 use lower secondary topic list regardless of subject setting
    const secNum = parseInt((ctx.studentLevel || '').replace(/[^0-9]/g, '')) || 0;
    const isLowerSec = ctx.studentLevel.toLowerCase().startsWith('sec') && secNum <= 2;
    if (isLowerSec) return SEC12_EXAM_TOPICS;
    if (hasEM && hasAM) {
      return [
        ...E_MATH_EXAM_TOPICS.map(c => ({ ...c, label: `[E] ${c.label}` })),
        ...A_MATH_EXAM_TOPICS.map(c => ({ ...c, label: `[A] ${c.label}` })),
      ];
    }
    if (hasAM) return A_MATH_EXAM_TOPICS;
    return E_MATH_EXAM_TOPICS;
  }, [ctx?.studentLevel, ctx?.studentSubjects]);

  // Exam topic pills — filtered by selected subject (E Math / A Math / H2 Math)
  const examTopicCategories = useMemo(
    () => (ctx ? getExamTopicsForSubject(ctx.studentLevel, examSubject) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ctx?.studentLevel, examSubject]
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="lm-card" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="lm-header">
          <div>
            <div className="lm-student-name">{lesson.studentName}</div>
            <div className="lm-sub">
              {lesson.type} · {dateLabel}{slotTime ? ` · ${slotTime}` : ''}
            </div>
            {ctx && ctx.studentLevel && (
              <div className="lm-sub lm-sub-meta">
                {ctx.studentLevel}{ctx.studentSubjects.length > 0 && (
                  <> · {ctx.studentSubjects.map(s =>
                    s === 'E Math' ? 'EM' : s === 'A Math' ? 'AM' : s === 'H2 Math' ? 'H2' : s
                  ).join(' & ')}</>
                )}
              </div>
            )}
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {/* Scrollable body */}
        <div className="lm-body">
          {ctxLoading && (
            <div style={{ textAlign: 'center', color: '#94a3b8', padding: '32px 0' }}>Loading…</div>
          )}
          {ctxError && <div className="modal-error">{ctxError}</div>}

          {ctx && (
            <>
              {/* Section A: Edit lock banner */}
              {!ctx.isEditable && (
                <div className="lm-lock-banner">
                  {ctx.isFuture
                    ? '🔮 Future lesson — progress log available after class'
                    : '🔒 Lesson is older than 14 days — read only'}
                </div>
              )}

              {/* Section B: Previous lesson recap */}
              {ctx.prev && (
                <div className="lm-section">
                  <div className="lm-section-title">
                    Last lesson
                    <span className="lm-section-date">{formatExamDate(ctx.prev.date)}</span>
                  </div>
                  {ctx.prev.topicsCovered && (
                    <div className="lm-recap-row">
                      <span className="lm-recap-label">Topics</span>
                      <span className="lm-recap-val">{ctx.prev.topicsCovered}</span>
                    </div>
                  )}
                  {ctx.prev.homeworkAssigned && (
                    <div className="lm-recap-row">
                      <span className="lm-recap-label">HW set</span>
                      <span className="lm-recap-val">{ctx.prev.homeworkAssigned}</span>
                    </div>
                  )}
                  <div style={{ marginTop: 8 }}>
                    <div className="lm-field-label">HW returned</div>
                    <div className="lm-radio-row" style={{ marginTop: 4 }}>
                      {['Yes', 'Partial', 'No'].map(v => (
                        <button
                          key={v}
                          className={`lm-radio-btn${prevHwReturned === v ? ' selected' : ''}`}
                          onClick={() => handlePrevHwChange(v)}
                        >{v}</button>
                      ))}
                    </div>
                    {prevSaveStatus !== 'idle' && (
                      <div className="lm-save-status" style={{ color: prevSaveStatus === 'saved' ? '#16a34a' : prevSaveStatus === 'error' ? '#dc2626' : '#94a3b8' }}>
                        {prevSaveStatus === 'saving' ? 'Saving…' : prevSaveStatus === 'saved' ? '✓ Saved' : '⚠ Failed'}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Section C: Exam season — only shown during active exam season */}
              {ctx.examType && lesson.studentId && (
                <div className="lm-section lm-exam-section">
                  {/* Collapsible header — amber even when collapsed so it's impossible to miss */}
                  <button
                    className="lm-exam-toggle"
                    onClick={() => setExamExpanded(v => !v)}
                  >
                    <div className="lm-exam-season-header">
                      <span className="lm-exam-badge">📝 {ctx.examType}</span>
                      <span className="lm-exam-season-label">Exam info — tap to {examExpanded ? 'hide' : 'fill in'}</span>
                    </div>
                    <span className="lm-exam-chevron">{examExpanded ? '▲' : '▼'}</span>
                  </button>

                  {examExpanded && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '0 14px 14px' }}>
                    {/* Subject selector — only for dual-math students */}
                    {ctx.studentSubjects.includes('E Math') && ctx.studentSubjects.includes('A Math') && (
                      <div>
                        <div className="lm-field-label">Subject</div>
                        <div className="lm-radio-row" style={{ marginTop: 4 }}>
                          {(['E Math', 'A Math'] as const).map(s => (
                            <button
                              key={s}
                              className={`lm-radio-btn${examSubject === s ? ' selected' : ''}`}
                              onClick={() => handleExamSubjectChange(s)}
                            >{s}</button>
                          ))}
                        </div>
                      </div>
                    )}

                    {!noExam && (
                      <>
                        <div className="lm-field-label">Exam date</div>
                        <input
                          type="date"
                          className="modal-input"
                          value={examDate}
                          onChange={e => setExamDate(e.target.value)}
                          style={{ fontSize: 13 }}
                        />

                        <div className="lm-field-label">Topics tested</div>
                        {examTopicCategories.map(cat => (
                          <div key={cat.label}>
                            <div className="lm-cat-label">{cat.label}</div>
                            <div className="lm-topic-grid">
                              {cat.topics.map(topic => (
                                <button
                                  key={topic}
                                  className={`lm-topic-chip${examTopicPills.includes(topic) ? ' selected' : ''}`}
                                  onClick={() => handleExamTopicToggle(topic)}
                                >{topic}</button>
                              ))}
                            </div>
                          </div>
                        ))}
                        <div className="lm-field-label" style={{ marginTop: 8 }}>Marks</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <input
                            type="number" min={0} step={0.5}
                            className="modal-input"
                            placeholder="Score"
                            value={examScore}
                            onChange={e => setExamScore(e.target.value)}
                            style={{ fontSize: 13, width: '90px', textAlign: 'center' }}
                          />
                          <span style={{ color: '#94a3b8', fontSize: 15, fontWeight: 600 }}>/</span>
                          <input
                            type="number" min={0} step={1}
                            className="modal-input"
                            placeholder="Total"
                            value={examTotal}
                            onChange={e => setExamTotal(e.target.value)}
                            style={{ fontSize: 13, width: '90px', textAlign: 'center' }}
                          />
                          {examScore && examTotal && parseFloat(examTotal) > 0 && (
                            <span style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>
                              {(parseFloat(examScore) / parseFloat(examTotal) * 100).toFixed(1)}%
                            </span>
                          )}
                        </div>

                        <div className="lm-field-label" style={{ marginTop: 8 }}>Notes</div>
                        <textarea
                          className="modal-input"
                          placeholder="e.g. focus areas, chapters excluded, special instructions…"
                          value={examNotes}
                          onChange={e => setExamNotes(e.target.value)}
                          rows={2}
                          style={{ fontSize: 13, resize: 'vertical', minHeight: 52 }}
                        />
                      </>
                    )}

                    <label className="lm-check-row">
                      <input type="checkbox" checked={noExam} onChange={e => setNoExam(e.target.checked)} />
                      No exam this season
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 2 }}>
                      <button
                        className="btn-primary"
                        style={{ fontSize: 13, padding: '7px 16px' }}
                        onClick={handleSaveExam}
                        disabled={examSaving}
                      >{examSaving ? 'Saving…' : 'Save exam info'}</button>
                      {examSaveMsg && (
                        <span style={{ fontSize: 13, color: examSaveMsg.startsWith('✓') ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
                          {examSaveMsg}
                        </span>
                      )}
                    </div>
                  </div>
                  )}
                </div>
              )}

              {/* Section D: This lesson input */}
              <div className="lm-section">
                <div className="lm-section-title">This lesson</div>

                {/* Topics multi-select */}
                <div className="lm-field-group">
                  <div className="lm-field-label">Topics covered</div>
                  {topicCategories.map(cat => (
                    <div key={cat.label}>
                      <div className="lm-cat-label">{cat.label}</div>
                      <div className="lm-topic-grid">
                        {cat.topics.map(topic => (
                          <button
                            key={topic}
                            className={`lm-topic-chip${topicChips.includes(topic) ? ' selected' : ''}`}
                            onClick={() => handleTopicToggle(topic)}
                            disabled={!ctx.isEditable}
                          >{topic}</button>
                        ))}
                      </div>
                    </div>
                  ))}
                  <input
                    type="text"
                    className="modal-input"
                    placeholder="Other topics (comma-separated)…"
                    value={topicFreeText}
                    onChange={e => handleFreeTextChange(e.target.value)}
                    disabled={!ctx.isEditable}
                    style={{ marginTop: 6, fontSize: 13 }}
                  />
                </div>

                {/* Mastery */}
                <div className="lm-field-group">
                  <div className="lm-field-label">Mastery</div>
                  <div className="lm-radio-row">
                    {(['Strong', 'OK', 'Slow'] as const).map(v => {
                      const label = v === 'Strong' ? '🟢 Strong' : v === 'OK' ? '🟡 OK' : '🔴 Slow';
                      const selStyle = v === 'Strong' ? { background: '#dcfce7', color: '#166534', borderColor: '#86efac' }
                        : v === 'OK' ? { background: '#fef9c3', color: '#854d0e', borderColor: '#fde047' }
                        : { background: '#fee2e2', color: '#991b1b', borderColor: '#fca5a5' };
                      return (
                        <button
                          key={v}
                          className={`lm-radio-btn lm-perf-btn${mastery === v ? ' selected' : ''}`}
                          onClick={() => { if (ctx.isEditable) handleMasteryChange(mastery === v ? '' : v); }}
                          disabled={!ctx.isEditable}
                          style={mastery === v ? selStyle : {}}
                        >{label}</button>
                      );
                    })}
                  </div>
                </div>

                {/* Mood — values must exactly match Airtable single-select option names (emoji included) */}
                <div className="lm-field-group">
                  <div className="lm-field-label">Mood</div>
                  <div className="lm-radio-row" style={{ flexWrap: 'wrap', gap: 6 }}>
                    {(['😄 Engaged', '🙂 Fine', '😟 Distracted', '😴 Tired', '😤 Frustrated'] as const).map(v => {
                      const selStyle = v === '😄 Engaged' ? { background: '#dcfce7', color: '#166534', borderColor: '#86efac' }
                        : v === '🙂 Fine' ? { background: '#e0f2fe', color: '#075985', borderColor: '#7dd3fc' }
                        : v === '😟 Distracted' ? { background: '#f1f5f9', color: '#475569', borderColor: '#cbd5e1' }
                        : v === '😴 Tired' ? { background: '#fef9c3', color: '#854d0e', borderColor: '#fde047' }
                        : { background: '#fee2e2', color: '#991b1b', borderColor: '#fca5a5' };
                      return (
                        <button
                          key={v}
                          className={`lm-radio-btn${mood === v ? ' selected' : ''}`}
                          onClick={() => { if (ctx.isEditable) handleMoodChange(mood === v ? '' : v); }}
                          disabled={!ctx.isEditable}
                          style={mood === v ? selStyle : {}}
                        >{v}</button>
                      );
                    })}
                  </div>
                </div>

                {/* Homework assigned */}
                <div className="lm-field-group">
                  <div className="lm-field-label">Homework set</div>
                  <input
                    type="text"
                    className="modal-input"
                    placeholder="e.g. P5 Ex 3A Q1–10"
                    value={hwAssigned}
                    onChange={e => { if (ctx.isEditable) handleHwAssignedChange(e.target.value); }}
                    disabled={!ctx.isEditable}
                    style={{ fontSize: 13 }}
                  />
                </div>

                {/* Lesson notes */}
                <div className="lm-field-group">
                  <div className="lm-field-label">Lesson notes</div>
                  <textarea
                    className="modal-textarea"
                    rows={3}
                    placeholder="Observations, areas to review…"
                    value={lessonNotes}
                    onChange={e => { if (ctx.isEditable) handleLessonNotesChange(e.target.value); }}
                    disabled={!ctx.isEditable}
                    style={{ fontSize: 13 }}
                  />
                </div>
              </div>
            </>
          )}
        </div>

        {/* Section E: Footer */}
        <div className="lm-footer">
          <div className="lm-autosave-status">
            {saveStatus === 'saving' && <span style={{ color: '#94a3b8' }}>Saving…</span>}
            {saveStatus === 'saved' && <span style={{ color: '#16a34a' }}>✓ Autosaved</span>}
            {saveStatus === 'error' && <span style={{ color: '#dc2626' }}>⚠ Save failed{saveError ? `: ${saveError}` : ''}</span>}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {lesson.studentId && (
              <a
                href={`/admin/students/${lesson.studentId}`}
                target="_blank"
                rel="noreferrer"
                className="lm-full-link"
              >👤 Full profile</a>
            )}
            <a
              href={`/admin/progress?date=${lesson.date}&lesson=${lesson.id}`}
              target="_blank"
              rel="noreferrer"
              className="lm-full-link"
            >Full view ↗</a>
            <button className="btn-primary" onClick={onClose} style={{ padding: '8px 20px', fontSize: 14 }}>Done</button>
          </div>
        </div>
      </div>
    </div>
  );
}
