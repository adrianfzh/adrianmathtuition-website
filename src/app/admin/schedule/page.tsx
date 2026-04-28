'use client';

import React, { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo } from 'react';
import { getTopicsForLevel, getExamTopicsForSubject, SECONDARY_FLAT, JC_FLAT } from '@/lib/canonical-topics';
import {
  DndContext, DragOverlay,
  useSensor, useSensors,
  PointerSensor, TouchSensor,
  closestCenter,
  useDraggable, useDroppable,
} from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Slot {
  id: string;
  dayNum: number;
  dayName: string;
  time: string;
  level: string;
  capacity: number;
  enrolledCount: number;
}

interface Lesson {
  id: string;
  date: string;
  slotId: string | null;
  studentId: string | null;
  type: string;
  status: string;
  notes: string;
  rescheduledToDate?: string;
  progressLogged?: boolean;
}

interface Student {
  name: string;
}

interface StudentContact {
  name: string;
  parentName: string;
  parentEmail: string;
  parentContact?: string;
  studentContact?: string;
}

interface ScheduleData {
  weekStart: string;
  weekEnd: string;
  slots: Slot[];
  enrollmentsBySlot: Record<string, string[]>;
  lessons: Lesson[];
  students: Record<string, Student>;
  activeExamType?: string | null;
  examsByStudent?: Record<string, string | null>;
}

interface EnrichedLesson extends Lesson {
  studentName: string;
  examDate?: string | null;
}

// ─── Lesson modal types ────────────────────────────────────────────────────────

interface ExamRecord {
  examDate: string | null;
  examTopics: string | null;
  noExam: boolean;
  notes: string | null;
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
  /** Keyed by subject ('E Math', 'A Math', 'H2 Math', 'Math', or '' for unset) */
  examsBySubject: Record<string, ExamRecord | null>;
  isEditable: boolean;
  isFuture: boolean;
}
interface RescheduleState {
  lesson: EnrichedLesson;
  toDate: string;
  toSlotId: string;
  notes: string;
  notify: boolean;
  showPickers: boolean; // true = manual pick mode (from action sheet)
}
interface ActionSheetState {
  lesson: EnrichedLesson;
  date: string;
  slotId: string;
}
interface AddModalState {
  type: 'Makeup' | 'Rescheduled' | 'Additional' | 'Trial';
  date: string;
  slotId: string;
  studentId: string;
  studentSearch: string;
  trialStudentName: string;
  notes: string;
  notify: boolean;
  /** Makeup: the Absent lesson being made up. Rescheduled: the Scheduled lesson being moved. */
  linkedLessonId: string;
}
interface AbsentDeleteState {
  lesson: EnrichedLesson;
  notify: boolean;
  reason: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function getMondayOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

function formatWeekLabel(monday: Date): string {
  const sunday = addDays(monday, 6);
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
  const startStr = monday.toLocaleDateString('en-SG', opts);
  const endStr = sunday.toLocaleDateString('en-SG', { ...opts, year: 'numeric' });
  return `${startStr} – ${endStr}`;
}

function parseTimeMinutes(time: string): number {
  // "9-11am" → 9*60=540; "11am-1pm" → 660; "1-3pm" → 780
  const m = time.match(/^(\d+)(am|pm)?[-–]/i);
  if (!m) return 9999;
  let h = parseInt(m[1]);
  // If the time string ends in pm and start hour < 12 → afternoon
  if (!m[2]) {
    // No am/pm on first part – check if whole string has pm later
    if (/pm/i.test(time) && h < 12) h += 12;
  } else if (m[2].toLowerCase() === 'pm' && h < 12) {
    h += 12;
  }
  return h * 60;
}

function getTrialName(notes: string): string {
  const m = notes.match(/trial student[:\s]+(.+)/i);
  return m ? m[1].trim() : 'Trial Student';
}

const LEVEL_DISPLAY: Record<string, { label: string; cls: string }> = {
  secondary: { label: 'SEC', cls: 'level-sec' },
  jc:        { label: 'JC',  cls: 'level-jc'  },
  mixed:     { label: 'MIX', cls: 'level-mixed' },
};
function levelChip(level: string) {
  const key = level.toLowerCase();
  const d = LEVEL_DISPLAY[key] ?? { label: level.toUpperCase(), cls: `level-${key}` };
  return <span className={`slot-level ${d.cls}`}>{d.label}</span>;
}

const TYPE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  Regular:     { bg: '#f8fafc',  text: '#1e293b', border: '#e2e8f0' },
  Rescheduled: { bg: '#eff6ff',  text: '#1d4ed8', border: '#bfdbfe' },
  Trial:       { bg: '#f0fdf4',  text: '#15803d', border: '#bbf7d0' },
  Makeup:      { bg: '#fff7ed',  text: '#c2410c', border: '#fed7aa' },
  Additional:  { bg: '#faf5ff',  text: '#7c3aed', border: '#e9d5ff' },
  Absent:      { bg: '#f1f5f9',  text: '#94a3b8', border: '#e2e8f0' },
  Cancelled:   { bg: '#f1f5f9',  text: '#94a3b8', border: '#e2e8f0' },
};

function getTypeStyle(type: string, status: string) {
  // Lessons that have "happened but moved/missed" should look muted regardless of original type
  if (status === 'Absent' || status === 'Cancelled' || status === 'Rescheduled') return TYPE_COLORS.Absent;
  return TYPE_COLORS[type] || TYPE_COLORS.Regular;
}

// ─── Cookie helpers ────────────────────────────────────────────────────────────

function getCookie(name: string): string {
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : '';
}

function setCookie(name: string, value: string, days: number) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Strict`;
}

// ─── Lesson input modal ────────────────────────────────────────────────────────

function LessonModal({
  lesson,
  password,
  slots,
  onClose,
  onProgressLogged,
}: {
  lesson: EnrichedLesson;
  password: string;
  slots: { id: string; time: string }[];
  onClose: () => void;
  onProgressLogged: (lessonId: string) => void;
}) {
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
    fetch(`/api/admin-schedule/lesson-context?id=${lesson.id}`, {
      headers: { Authorization: `Bearer ${password}` },
    })
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
          setExamSubject(isDualMath ? 'E Math' : ((data.studentSubjects ?? [])[0] ?? ''));
          const rec = (data.examsBySubject ?? {})[isDualMath ? 'E Math' : ''] ?? (data.examsBySubject ?? {})[''] ?? null;
          setExamDate(rec?.examDate ?? '');
          setNoExam(rec?.noExam ?? false);
          const savedExamTopics = rec?.examTopics
            ? rec.examTopics.split(',').map((t: string) => t.trim()).filter(Boolean)
            : [];
          setExamTopicPills(savedExamTopics.filter((t: string) => canonicalAll.includes(t)));
          setExamNotes(rec?.notes ?? '');
        } catch (e) {
          console.warn('[LessonModal] exam section init failed:', e);
        }
        setCtxLoading(false);
      })
      .catch(() => {
        setCtxError('Failed to load lesson context');
        setCtxLoading(false);
      });
    // lesson.id is the only meaningful dep — password/slots are stable refs.
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
        headers: { Authorization: `Bearer ${password}`, 'Content-Type': 'application/json' },
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
          headers: { Authorization: `Bearer ${password}`, 'Content-Type': 'application/json' },
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
      }
      const res = await fetch('/api/admin-schedule/quick-add-exam', {
        method: 'POST',
        headers: { Authorization: `Bearer ${password}`, 'Content-Type': 'application/json' },
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

  const topicCategories = useMemo(
    () => (ctx ? getTopicsForLevel(ctx.studentLevel) : []),
    [ctx?.studentLevel]
  );

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

// ─── Module-level DnD components ──────────────────────────────────────────────

function formatExamDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-SG', { day: 'numeric', month: 'short' });
}

function DraggableLessonChip({ lesson, onTap, onExamDateClick, onStudentClick, onMarkPresent, onMarkAbsent, onUndo, activeExamType }: { lesson: EnrichedLesson; onTap: () => void; onExamDateClick?: (lesson: EnrichedLesson) => void; onStudentClick?: () => void; onMarkPresent?: () => void; onMarkAbsent?: () => void; onUndo?: () => void; activeExamType?: string | null }) {
  // Rescheduled-away chips (status=Rescheduled) are display-only — disable dragging
  const isRescheduledAway = lesson.status === 'Rescheduled';
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: lesson.id, disabled: isRescheduledAway });
  const style = getTypeStyle(lesson.type, lesson.status);
  const isFaded = lesson.status === 'Absent' || lesson.status === 'Cancelled' || isRescheduledAway;
  // True on touch/coarse-pointer devices (phones, tablets).
  const isTouch = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
  // Whether attendance controls are present (caller passes undefined when not applicable)
  const hasAttendance = !!(onMarkPresent || onMarkAbsent || onUndo);

  function handleClick() {
    onTap();
  }

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      // Desktop: listeners on the whole chip so click-drag works anywhere.
      // Mobile: listeners only on the grip handle (see below) so the chip body scrolls.
      {...(!isTouch && !isRescheduledAway ? listeners : {})}
      onClick={handleClick}
      className={`lesson-chip${isFaded ? ' absent' : ''}`}
      style={{
        background: style.bg, color: style.text, borderColor: style.border,
        opacity: isDragging ? 0.3 : 1,
        cursor: isRescheduledAway ? 'default' : (isTouch ? 'default' : 'grab'),
        display: 'flex', alignItems: 'center', gap: 4,
      }}
    >
      {/* Mobile-only drag handle — long press here to drag (hidden for rescheduled-away) */}
      {isTouch && !isRescheduledAway && (
        <span
          {...listeners}
          className="drag-handle"
          style={{ touchAction: 'none' }}
          aria-label="drag"
        >
          <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor">
            <circle cx="3" cy="3" r="1.5"/><circle cx="7" cy="3" r="1.5"/>
            <circle cx="3" cy="8" r="1.5"/><circle cx="7" cy="8" r="1.5"/>
            <circle cx="3" cy="13" r="1.5"/><circle cx="7" cy="13" r="1.5"/>
          </svg>
        </span>
      )}
      {/* Content: name + sub-lines — flex:1 with minWidth:0 allows ellipsis truncation */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {lesson.type === 'Trial' && <span className="trial-badge">🆕</span>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
          <span
            className={isFaded ? 'absent-name' : ''}
            role={onStudentClick ? 'button' : undefined}
            onClick={onStudentClick ? e => { e.stopPropagation(); onStudentClick(); } : undefined}
            style={{
              ...(onStudentClick ? { cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2 } : {}),
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0,
            }}
          >{lesson.studentName}</span>
          {/* Inline exam date badge — replaces the old progress ● dot */}
          {!isFaded && lesson.examDate && lesson.examDate !== 'NO_EXAM' && (
            <span
              title="Click to see exam details"
              role="button"
              onClick={e => { e.stopPropagation(); onExamDateClick?.(lesson); }}
              style={{ fontSize: 9, color: '#64748b', flexShrink: 0, whiteSpace: 'nowrap', cursor: 'pointer' }}
            >📅 {formatExamDate(lesson.examDate)}</span>
          )}
          {lesson.type !== 'Regular' && !isFaded && <span className="type-tag" style={{ flexShrink: 0 }}>{lesson.type}</span>}
        </div>
        {/* Faded status sub-lines */}
        {isRescheduledAway && (
          <span style={{ display: 'block', fontSize: 10, opacity: 0.55, marginTop: 2 }}>
            {lesson.rescheduledToDate ? `→ ${formatExamDate(lesson.rescheduledToDate)}` : 'rescheduled'}
          </span>
        )}
        {lesson.status === 'Absent' && (
          <span style={{ display: 'block', fontSize: 10, opacity: 0.55, marginTop: 2 }}>Absent</span>
        )}
        {!isFaded && lesson.examDate === 'NO_EXAM' && (
          <span style={{ display: 'block', fontSize: 10, opacity: 0.4, fontStyle: 'italic', marginTop: 1 }}>no upcoming exam</span>
        )}
        {lesson.type !== 'Trial' && lesson.notes && !isFaded && (
          <div className="text-[10px] italic text-amber-700 mt-0.5 leading-tight" title={lesson.notes}>↳ {lesson.notes}</div>
        )}
      </div>
      {/* Attendance controls — right-aligned, flex-shrink:0 so name truncates instead of wrapping */}
      {!isRescheduledAway && lesson.status !== 'Cancelled' && hasAttendance && (
        <div style={{ display: 'flex', gap: 4, flexShrink: 0, alignItems: 'center' }}>
          {lesson.status === 'Scheduled' && (
            <>
              {onMarkAbsent && (
                <button onClick={e => { e.stopPropagation(); onMarkAbsent(); }} title="Mark absent"
                  style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>✗</button>
              )}
              {onMarkPresent && (
                <button onClick={e => { e.stopPropagation(); onMarkPresent(); }} title="Mark present"
                  style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #bbf7d0', background: '#f0fdf4', color: '#16a34a', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>✓</button>
              )}
            </>
          )}
          {(lesson.status === 'Completed' || lesson.status === 'Absent') && (
            <>
              {onUndo && (
                <button onClick={e => { e.stopPropagation(); onUndo(); }} title="Undo"
                  style={{ fontSize: 11, fontWeight: 600, color: '#64748b', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 4, padding: '2px 6px', cursor: 'pointer', flexShrink: 0, height: 22, lineHeight: 1 }}>undo</button>
              )}
              <span style={{ fontSize: 11, fontWeight: 600, flexShrink: 0, color: lesson.status === 'Completed' ? '#16a34a' : '#ef4444' }}>
                {lesson.status}
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function DroppableLessonSlot({
  id, lessons, onChipTap, onAddClick, onExamDateClick, onStudentClick,
  onMarkPresent, onMarkAbsent, onUndo,
  ghostStudents, onGhostTap, savingStudents, activeExamType,
}: {
  id: string;
  lessons: EnrichedLesson[];
  onChipTap: (lesson: EnrichedLesson) => void;
  onAddClick: () => void;
  onExamDateClick?: (lesson: EnrichedLesson) => void;
  onStudentClick?: (lesson: EnrichedLesson) => void;
  onMarkPresent?: (lesson: EnrichedLesson) => void;
  onMarkAbsent?: (lesson: EnrichedLesson) => void;
  onUndo?: (lesson: EnrichedLesson) => void;
  ghostStudents?: { id: string; name: string }[];
  onGhostTap?: (studentId: string, studentName: string) => void;
  savingStudents?: Set<string>;
  activeExamType?: string | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const ghosts = ghostStudents ?? [];
  return (
    <div ref={setNodeRef} className={`lesson-drop-zone${isOver ? ' drop-over' : ''}`}>
      <div className="lesson-list">
        {lessons.map(l => (
          <DraggableLessonChip key={l.id} lesson={l} onTap={() => onChipTap(l)} onExamDateClick={onExamDateClick} onStudentClick={onStudentClick ? () => onStudentClick(l) : undefined} onMarkPresent={onMarkPresent ? () => onMarkPresent(l) : undefined} onMarkAbsent={onMarkAbsent ? () => onMarkAbsent(l) : undefined} onUndo={onUndo ? () => onUndo(l) : undefined} activeExamType={activeExamType} />
        ))}
        {ghosts.map(s => (
          <div
            key={s.id}
            className="lesson-chip"
            role="button"
            onClick={() => onGhostTap?.(s.id, s.name)}
            style={{ background: '#f8fafc', color: '#64748b', borderColor: '#e2e8f0', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
          >
            <div style={{ flex: 1, minWidth: 0, opacity: 0.7 }}>{s.name}</div>
            {savingStudents?.has(s.id)
              ? <span style={{ fontSize: 11, color: '#94a3b8', flexShrink: 0 }}>Saving…</span>
              : <span style={{ fontSize: 11, color: '#cbd5e1', flexShrink: 0 }}>tap to mark</span>
            }
          </div>
        ))}
        {lessons.length === 0 && ghosts.length === 0 && (
          <button className="add-hint" onClick={onAddClick}>No lessons — tap + to add</button>
        )}
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SchedulePage() {
  const [password, setPassword] = useState('');
  const [authed, setAuthed] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  const [activeDate, setActiveDate] = useState<Date>(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d;
  });
  const [data, setData] = useState<ScheduleData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // (no lazy-load state — strip uses a fixed ±26-week range)
  // Roster-only day selection (0=Mon…6=Sun) — independent of the date strip
  const [rosterDay, setRosterDay] = useState<number>(() => {
    const d = new Date().getDay();
    return d === 0 ? 6 : d - 1; // default to today's day-of-week
  });

  const [modal, setModal] = useState<{ student: StudentContact; lessonType: string } | null>(null);
  const [lessonModal, setLessonModal] = useState<EnrichedLesson | null>(null);
  const [contactCache, setContactCache] = useState<Record<string, StudentContact>>({});
  const [contactLoading, setContactLoading] = useState(false);
  const savedPw = useRef('');
  const stripRef = useRef<HTMLDivElement>(null);
  const desktopScrollRef = useRef<HTMLDivElement>(null);
  // Tracks what triggered the last activeDate change so the auto-scroll effect
  // knows whether to move the strip ('mount' | 'arrow') or leave it alone ('pill').
  const lastChangeSource = useRef<'mount' | 'arrow' | 'pill'>('mount');

  const [viewMode, setViewMode] = useState<'lessons' | 'roster'>(() => {
    if (typeof window === 'undefined') return 'lessons';
    return (localStorage.getItem('schedule_view_mode') as 'lessons' | 'roster') || 'lessons';
  });

  useEffect(() => {
    localStorage.setItem('schedule_view_mode', viewMode);
    // Clear stale active-date key that previously caused the strip to open at old dates
    localStorage.removeItem('schedule_active_date');
  }, [viewMode]);


  // Date strip: fixed ±26-week range (364 dates) — computed once on mount.
  // No lazy-load: the fixed range is wide enough for tuition scheduling use,
  // and lazy-load was causing catastrophic scroll-jump bugs when combined with month labels.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stripDates = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const dates: Date[] = [];
    for (let i = -26 * 7; i <= 26 * 7; i++) dates.push(addDays(today, i));
    return dates;
  }, []); // intentionally empty — recompute only on full page reload

  // DnD
  const [activeDragLesson, setActiveDragLesson] = useState<EnrichedLesson | null>(null);
  // Pull-to-refresh
  const [pullDistance, setPullDistance] = useState(0);
  const isPullingRef = useRef(false);
  const pullStartYRef = useRef(0);
  const contentRef = useRef<HTMLDivElement>(null);
  // Toast
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Modals
  const [rescheduleModal, setRescheduleModal] = useState<RescheduleState | null>(null);
  const [actionSheet, setActionSheet] = useState<ActionSheetState | null>(null);
  const [addModal, setAddModal] = useState<AddModalState | null>(null);
  const [absentModal, setAbsentModal] = useState<AbsentDeleteState | null>(null);
  const [deleteModal, setDeleteModal] = useState<AbsentDeleteState | null>(null);
  const [editNotesModal, setEditNotesModal] = useState<{ lesson: EnrichedLesson; notes: string } | null>(null);
  const [examDetailModal, setExamDetailModal] = useState<{ studentId: string; studentName: string; exams: any[] | null } | null>(null);
  const [examDetailLoading, setExamDetailLoading] = useState(false);
  const [ghostActionSheet, setGhostActionSheet] = useState<{ studentId: string; studentName: string; slotId: string; date: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState('');
  // Makeup flow — absent lessons for the selected student
  const [absentLessons, setAbsentLessons] = useState<{ id: string; date: string; slotId: string | null }[]>([]);
  const [absentLessonsLoading, setAbsentLessonsLoading] = useState(false);
  const [absentLessonsError, setAbsentLessonsError] = useState('');
  // Rescheduled flow — upcoming scheduled lessons for the selected student
  const [upcomingLessons, setUpcomingLessons] = useState<{ id: string; date: string; slotId: string | null }[]>([]);
  const [upcomingLessonsLoading, setUpcomingLessonsLoading] = useState(false);
  const [upcomingLessonsError, setUpcomingLessonsError] = useState('');
  const [savingAttendance, setSavingAttendance] = useState<Set<string>>(new Set());

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 0, tolerance: 3 } })
  );

  // Derive monday as a stable ISO string so the fetch effect only fires on week change,
  // not when the user taps a different day within the same week.
  const mondayISO = isoDate(getMondayOfWeek(activeDate));
  // Helper: map a Date to the full day name ("Monday"…"Sunday")
  function dayNameOf(d: Date): string {
    const idx = d.getDay() === 0 ? 6 : d.getDay() - 1; // Sun→6, Mon→0…
    return DAYS[idx];
  }

  const enrichedLessons = useMemo<EnrichedLesson[]>(() => {
    if (!data) return [];
    return data.lessons.map(lesson => {
      const student = lesson.studentId ? data.students[lesson.studentId] : null;
      const studentName = student?.name || (lesson.type === 'Trial' ? getTrialName(lesson.notes) : 'Unknown');
      const examDate = lesson.studentId ? (data.examsByStudent?.[lesson.studentId] ?? null) : null;
      return { ...lesson, studentName, examDate };
    });
  }, [data]);

  const enrichedLessonMap = useMemo<Record<string, EnrichedLesson[]>>(() => {
    const map: Record<string, EnrichedLesson[]> = {};
    for (const lesson of enrichedLessons) {
      if (!lesson.slotId) continue;
      const key = `${lesson.date}__${lesson.slotId}`;
      if (!map[key]) map[key] = [];
      map[key].push(lesson);
    }
    return map;
  }, [enrichedLessons]);

  // Absent students keyed by date — catches Absent records that have no Slot linked
  // (e.g. created by the Telegram bot), which would be missed by enrichedLessonMap.
  const absentStudentsByDate = useMemo<Record<string, Set<string>>>(() => {
    const map: Record<string, Set<string>> = {};
    for (const lesson of enrichedLessons) {
      if (lesson.status !== 'Absent' || !lesson.studentId) continue;
      if (!map[lesson.date]) map[lesson.date] = new Set();
      map[lesson.date].add(lesson.studentId);
    }
    return map;
  }, [enrichedLessons]);

  // Check cookie on mount
  useEffect(() => {
    const pw = getCookie('schedule_pw');
    if (pw) {
      savedPw.current = pw;
      verifyAndLogin(pw);
    }
  }, []);

  async function verifyAndLogin(pw: string) {
    setAuthLoading(true);
    try {
      const res = await fetch('/api/admin-invoices?auth=check', {
        headers: { Authorization: `Bearer ${pw}` },
      });
      if (res.ok) {
        savedPw.current = pw;
        setCookie('schedule_pw', pw, 30);
        setAuthed(true);
      } else {
        setAuthError('Incorrect password');
      }
    } catch {
      setAuthError('Connection error');
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setAuthError('');
    await verifyAndLogin(password);
  }

  const fetchSchedule = useCallback(async (mon: Date, pw: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/admin-schedule?week=${isoDate(mon)}`, {
        headers: { Authorization: `Bearer ${pw}` },
      });
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (err: any) {
      setError(err.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authed && savedPw.current) {
      fetchSchedule(new Date(mondayISO + 'T00:00:00'), savedPw.current);
    }
  }, [authed, mondayISO, fetchSchedule]);

  // Navigation helpers — track source so auto-scroll effect knows whether to move the strip
  function setActiveDateFromArrow(d: Date) { lastChangeSource.current = 'arrow'; setActiveDate(d); }
  function setActiveDateFromPill(d: Date)  { lastChangeSource.current = 'pill';  setActiveDate(d); }
  function prevWeek() { setActiveDateFromArrow(addDays(activeDate, -7)); }
  function nextWeek() { setActiveDateFromArrow(addDays(activeDate, 7)); }
  function thisWeek() { goToToday(); }

  // Initial scroll: snap to today's pill once the strip is in the DOM.
  // Must depend on `authed` because the strip only renders after cookie auth
  // resolves — running on mount alone ([] dep) fires before the strip exists.
  useEffect(() => {
    if (!authed) return;
    if (!stripRef.current) return;
    const strip = stripRef.current;
    // rAF ensures the strip has been laid out and its overflow is measurable.
    requestAnimationFrame(() => {
      const pill = strip.querySelector(`[data-iso="${isoDate(activeDate)}"]`) as HTMLElement | null;
      if (!pill) return;
      const containerWidth = strip.clientWidth;
      const pillLeft = pill.offsetLeft;
      const pillWidth = pill.offsetWidth;
      strip.scrollLeft = pillLeft - (containerWidth - pillWidth) / 2;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed]); // re-run only when auth state changes (false → true)

  // Arrow navigation: smooth-scroll the strip to bring the new active date into view.
  // Skips if the change came from the user tapping a pill (strip position unchanged).
  useEffect(() => {
    if (lastChangeSource.current !== 'arrow') return;
    if (!stripRef.current) return;
    const pill = stripRef.current.querySelector(`[data-iso="${isoDate(activeDate)}"]`) as HTMLElement | null;
    pill?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [activeDate]);

  // Desktop: scroll the grid so today's column is centred whenever the week or data changes.
  useEffect(() => {
    const container = desktopScrollRef.current;
    if (!container) return;
    const todayCol = container.querySelector('.grid-col-today') as HTMLElement | null;
    if (!todayCol) return;
    const containerRect = container.getBoundingClientRect();
    const colRect = todayCol.getBoundingClientRect();
    const targetScrollLeft =
      container.scrollLeft + (colRect.left - containerRect.left) - (containerRect.width - colRect.width) / 2;
    container.scrollLeft = Math.max(0, targetScrollLeft);
  }, [mondayISO, data]);

  // Jump to today: reset activeDate + snap strip (no smooth scroll — instant jump)
  function goToToday() {
    const t = new Date(); t.setHours(0, 0, 0, 0);
    lastChangeSource.current = 'arrow';
    setActiveDate(t);
  }

  // Slots sorted Mon→Sun then by time, used in dropdowns
  const DAY_ORDER: Record<string, number> = { Monday: 0, Tuesday: 1, Wednesday: 2, Thursday: 3, Friday: 4, Saturday: 5, Sunday: 6 };
  const sortedSlots = useMemo(() => {
    if (!data?.slots) return [];
    return [...data.slots].sort((a, b) => {
      const d = (DAY_ORDER[a.dayName] ?? 7) - (DAY_ORDER[b.dayName] ?? 7);
      return d !== 0 ? d : parseTimeMinutes(a.time) - parseTimeMinutes(b.time);
    });
  }, [data]);

  // ── Render login ────────────────────────────────────────────────────────────
  if (!authed) {
    return (
      <>
        <style>{loginCSS}</style>
        <div className="login-wrap">
          <div className="login-card">
            <div className="login-icon">📅</div>
            <h1>Schedule</h1>
            <p>Adrian&apos;s Math Tuition</p>
            <form onSubmit={handleLogin}>
              <input
                type="password"
                className="pw-input"
                placeholder="Admin password"
                value={password}
                onChange={e => { setPassword(e.target.value); setAuthError(''); }}
                autoFocus
                disabled={authLoading}
              />
              {authError && <div className="pw-error">{authError}</div>}
              <button type="submit" className="pw-btn" disabled={authLoading || !password}>
                {authLoading ? 'Checking…' : 'View Schedule'}
              </button>
            </form>
          </div>
        </div>
      </>
    );
  }

  // ── Build calendar data ─────────────────────────────────────────────────────
  const monday = new Date(mondayISO + 'T00:00:00');
  const weekDates = DAYS.map((_, i) => addDays(monday, i));

  // Group slots by day name, sorted by time
  const slotsByDay: Record<string, Slot[]> = {};
  if (data) {
    for (const slot of data.slots) {
      if (!slotsByDay[slot.dayName]) slotsByDay[slot.dayName] = [];
      slotsByDay[slot.dayName].push(slot);
    }
    for (const day of Object.keys(slotsByDay)) {
      slotsByDay[day].sort((a, b) => parseTimeMinutes(a.time) - parseTimeMinutes(b.time));
    }
  }

  // Group lessons by date+slotId
  const lessonMap: Record<string, Lesson[]> = {};
  if (data) {
    for (const lesson of data.lessons) {
      const key = `${lesson.date}__${lesson.slotId}`;
      if (!lessonMap[key]) lessonMap[key] = [];
      lessonMap[key].push(lesson);
    }
  }

  function getLessonsForSlot(date: Date, slotId: string): Lesson[] {
    return lessonMap[`${isoDate(date)}__${slotId}`] || [];
  }

  // ── Render day column ────────────────────────────────────────────────────────
  function renderDaySlots(dayIndex: number) {
    const day = DAYS[dayIndex];
    const date = weekDates[dayIndex];
    const slots = slotsByDay[day] || [];
    const isToday = isoDate(date) === isoDate(new Date());

    if (slots.length === 0) {
      return <div className="no-slots">No lessons</div>;
    }

    return slots.map(slot => {
      const lessons = getLessonsForSlot(date, slot.id);
      const enrolledIds: string[] = data?.enrollmentsBySlot?.[slot.id] || [];

      // Build merged student list:
      // Start with enrolled students as Regular, then overlay any lesson records
      const lessonByStudent: Record<string, Lesson> = {};
      const extraLessons: Lesson[] = []; // trial/additional with no enrollment
      for (const l of lessons) {
        if (l.studentId && enrolledIds.includes(l.studentId)) {
          lessonByStudent[l.studentId] = l;
        } else {
          extraLessons.push(l);
        }
      }

      // Count present: enrolled not absent + extra not absent
      const absentIds = new Set(
        Object.entries(lessonByStudent)
          .filter(([, l]) => l.status === 'Absent' || l.status === 'Cancelled')
          .map(([id]) => id)
      );
      const present = (enrolledIds.length - absentIds.size) +
        extraLessons.filter(l => l.status !== 'Absent' && l.status !== 'Cancelled').length;
      const total = slot.capacity;

      return (
        <div key={slot.id} className={`slot-card ${isToday ? 'today' : ''}`}>
          <div className="slot-header">
            <div className="slot-meta">
              <span className="slot-time">⏰ {slot.time}</span>
              {levelChip(slot.level)}
            </div>
            <span className={`capacity ${present >= total ? 'full' : ''}`}>
              {present}/{total}
            </span>
          </div>

          <div className="lesson-list">
            {/* Enrolled students (with lesson override if exists) */}
            {enrolledIds.map(studentId => {
              const student = data?.students[studentId];
              const lesson = lessonByStudent[studentId];
              const isAbsent = lesson && (lesson.status === 'Absent' || lesson.status === 'Cancelled');
              const type = lesson?.type || 'Regular';
              const style = getTypeStyle(type, lesson?.status || '');
              return (
                <div
                  key={studentId}
                  className={`lesson-chip ${isAbsent ? 'absent' : ''}`}
                  style={{ background: style.bg, color: style.text, borderColor: style.border }}
                  onClick={() => openStudentModal(studentId, type)}
                  role="button"
                >
                  <span className={isAbsent ? 'absent-name' : ''}>{student?.name || studentId}</span>
                  {type !== 'Regular' && !isAbsent && <span className="type-tag">{type}</span>}
                  {isAbsent && <span className="type-tag absent-tag">{lesson?.status}</span>}
                </div>
              );
            })}
            {/* Extra lessons: trial, makeup, additional not in enrollments */}
            {extraLessons.map(lesson => {
              const isAbsent = lesson.status === 'Absent' || lesson.status === 'Cancelled';
              const style = getTypeStyle(lesson.type, lesson.status);
              const isTrial = lesson.type === 'Trial';
              const student = lesson.studentId ? data?.students[lesson.studentId] : null;
              const displayName = student?.name || (isTrial ? getTrialName(lesson.notes) : 'Unknown');
              return (
                <div
                  key={lesson.id}
                  className={`lesson-chip ${isAbsent ? 'absent' : ''}`}
                  style={{ background: style.bg, color: style.text, borderColor: style.border }}
                  onClick={lesson.studentId ? () => openStudentModal(lesson.studentId!, lesson.type) : undefined}
                  role={lesson.studentId ? 'button' : undefined}
                >
                  {isTrial && <span className="trial-badge">🆕</span>}
                  <span className={isAbsent ? 'absent-name' : ''}>{displayName}</span>
                  {lesson.type !== 'Regular' && !isAbsent && <span className="type-tag">{lesson.type}</span>}
                  {isAbsent && <span className="type-tag absent-tag">{lesson.status}</span>}
                </div>
              );
            })}
            {enrolledIds.length === 0 && extraLessons.length === 0 && (
              <span className="enrolled-hint">No students enrolled</span>
            )}
          </div>
        </div>
      );
    });
  }

  // ── Roster slot card (enrollment-only, no lesson overlays) ──────────────────
  function renderRosterSlotCard(slot: Slot) {
    const enrolledIds: string[] = data?.enrollmentsBySlot?.[slot.id] || [];
    return (
      <div key={slot.id} className="slot-card">
        <div className="slot-header">
          <div className="slot-meta">
            <span className="slot-time">⏰ {slot.time}</span>
            {levelChip(slot.level)}
          </div>
          <span className="capacity">{enrolledIds.length}/{slot.capacity}</span>
        </div>
        <div className="lesson-list">
          {enrolledIds.map(studentId => {
            const student = data?.students[studentId];
            return (
              <div
                key={studentId}
                className="lesson-chip"
                style={{ background: TYPE_COLORS.Regular.bg, color: TYPE_COLORS.Regular.text, borderColor: TYPE_COLORS.Regular.border }}
                onClick={() => openStudentModal(studentId, 'Regular')}
                role="button"
              >
                {student?.name || studentId}
              </div>
            );
          })}
          {enrolledIds.length === 0 && <span className="enrolled-hint">No students enrolled</span>}
        </div>
      </div>
    );
  }

  // ── Roster view ─────────────────────────────────────────────────────────────
  function renderRosterView() {
    return (
      <>
        {/* Mobile: simple Mon–Sun tab strip (no dates — roster is week-agnostic) */}
        <div className="mobile-day">
          <div className="roster-day-tabs">
            {DAYS.map((day, i) => (
              <button
                key={day}
                className={`roster-day-tab${rosterDay === i ? ' active' : ''}`}
                onClick={() => setRosterDay(i)}
              >
                {DAY_SHORT[i]}
              </button>
            ))}
          </div>
          <div className="day-col" style={{ marginTop: 10 }}>
            {(slotsByDay[DAYS[rosterDay]] ?? []).map(slot => renderRosterSlotCard(slot))}
            {(slotsByDay[DAYS[rosterDay]] ?? []).length === 0 && <div className="no-slots">No slots</div>}
          </div>
        </div>

        {/* Desktop: full grid */}
        <div className="desktop-grid-scroll">
        <div className="desktop-grid">
          {DAYS.map((day, i) => {
            const date = weekDates[i];
            const isToday = isoDate(date) === isoDate(new Date());
            return (
              <div key={day} className={`grid-col ${isToday ? 'grid-col-today' : ''}`}>
                <div className="grid-day-header">
                  <span className="grid-day-name">{DAY_SHORT[i]}</span>
                  <span className={`grid-day-date ${isToday ? 'today-date' : ''}`}>
                    {isToday ? date.getDate() : date.toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })}
                  </span>
                </div>
                {(slotsByDay[day] ?? []).map(slot => renderRosterSlotCard(slot))}
                {(slotsByDay[day] ?? []).length === 0 && <div className="no-slots">No slots</div>}
              </div>
            );
          })}
        </div>
        </div>
      </>
    );
  }

  // ── Helper functions ─────────────────────────────────────────────────────────

  function showToast(type: 'success' | 'error', message: string) {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ type, message });
    toastTimerRef.current = setTimeout(() => setToast(null), 3000);
  }

  function formatDateSlot(dateStr: string, slotId: string | null): string {
    if (!dateStr) return '—';
    const d = new Date(dateStr + 'T00:00:00');
    const dateLabel = d.toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short' });
    const slot = slotId ? data?.slots.find(s => s.id === slotId) : null;
    return `${dateLabel}${slot ? ' ' + slot.time : ''}`;
  }

  function handleDragStart(event: DragStartEvent) {
    const lesson = enrichedLessons.find(l => l.id === (event.active.id as string));
    if (lesson) { setActiveDragLesson(lesson); navigator.vibrate?.(50); }
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDragLesson(null);
    const { active, over } = event;
    if (!over) return;
    const lesson = enrichedLessons.find(l => l.id === (active.id as string));
    if (!lesson) return;
    const fromKey = `${lesson.date}__${lesson.slotId}`;
    const toKey = over.id as string;
    if (fromKey === toKey) return;
    const sep = toKey.indexOf('__');
    if (sep === -1) return;
    const toDate = toKey.slice(0, sep);
    const toSlotId = toKey.slice(sep + 2);
    setModalError('');
    setRescheduleModal({ lesson, toDate, toSlotId, notes: '', notify: true, showPickers: false });
  }

  async function handleConfirmReschedule() {
    if (!rescheduleModal) return;
    const { lesson, toDate, toSlotId, notes, notify } = rescheduleModal;
    if (!toDate || !toSlotId) { setModalError('Select a date and slot'); return; }
    setSubmitting(true); setModalError('');
    try {
      const res = await fetch('/api/admin-schedule/reschedule', {
        method: 'POST',
        headers: { Authorization: `Bearer ${savedPw.current}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ lessonId: lesson.id, newDate: toDate, newSlotId: toSlotId, notes: notes || undefined, notify }),
      });
      const json = await res.json();
      if (res.status === 409) { setModalError(`Slot full — max ${json.capacity} (${json.currentCount} booked)`); return; }
      if (!res.ok) throw new Error(json.error || 'Failed');
      setRescheduleModal(null);
      await fetchSchedule(monday, savedPw.current);
      const sent = json.notificationsSent?.student || json.notificationsSent?.parent;
      showToast('success', notify ? (sent ? '✓ Rescheduled — notifications sent' : '✓ Rescheduled (notifications partial)') : '✓ Rescheduled');
    } catch (err: any) { setModalError(err.message || 'Failed'); }
    finally { setSubmitting(false); }
  }

  async function handleConfirmAbsent() {
    if (!absentModal) return;
    setSubmitting(true); setModalError('');
    try {
      const res = await fetch('/api/admin-schedule/delete', {
        method: 'POST',
        headers: { Authorization: `Bearer ${savedPw.current}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ lessonId: absentModal.lesson.id, action: 'absent', notify: absentModal.notify, reason: absentModal.reason || undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed');
      setAbsentModal(null);
      await fetchSchedule(monday, savedPw.current);
      showToast('success', '✓ Marked absent');
    } catch (err: any) { setModalError(err.message || 'Failed'); }
    finally { setSubmitting(false); }
  }

  async function handleConfirmDelete() {
    if (!deleteModal) return;
    setSubmitting(true); setModalError('');
    try {
      const res = await fetch('/api/admin-schedule/delete', {
        method: 'POST',
        headers: { Authorization: `Bearer ${savedPw.current}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ lessonId: deleteModal.lesson.id, action: 'delete', notify: deleteModal.notify, reason: deleteModal.reason || undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed');
      setDeleteModal(null);
      await fetchSchedule(monday, savedPw.current);
      showToast('success', '✓ Lesson deleted');
    } catch (err: any) { setModalError(err.message || 'Failed'); }
    finally { setSubmitting(false); }
  }

  async function fetchAbsentLessons(studentId: string) {
    setAbsentLessons([]);
    setAbsentLessonsError('');
    setAbsentLessonsLoading(true);
    try {
      const res = await fetch(`/api/admin-schedule/absent-lessons?studentId=${studentId}`, {
        headers: { Authorization: `Bearer ${savedPw.current}` },
      });
      if (!res.ok) {
        setAbsentLessonsError(`Error ${res.status} loading lessons`);
        return;
      }
      const json = await res.json();
      setAbsentLessons(json.lessons ?? []);
    } catch {
      setAbsentLessonsError('Network error loading lessons');
    } finally {
      setAbsentLessonsLoading(false);
    }
  }

  async function fetchUpcomingLessons(studentId: string) {
    setUpcomingLessons([]);
    setUpcomingLessonsError('');
    setUpcomingLessonsLoading(true);
    try {
      const res = await fetch(`/api/admin-schedule/upcoming-lessons?studentId=${studentId}`, {
        headers: { Authorization: `Bearer ${savedPw.current}` },
      });
      if (!res.ok) { setUpcomingLessonsError(`Error ${res.status} loading lessons`); return; }
      const json = await res.json();
      setUpcomingLessons(json.lessons ?? []);
    } catch {
      setUpcomingLessonsError('Network error loading lessons');
    } finally {
      setUpcomingLessonsLoading(false);
    }
  }

  async function handleConfirmAdd() {
    if (!addModal) return;
    setSubmitting(true); setModalError('');
    try {
      if (addModal.type === 'Trial' && !addModal.trialStudentName) { setModalError('Enter trial student name'); setSubmitting(false); return; }
      if (addModal.type !== 'Trial' && !addModal.studentId) { setModalError('Select a student'); setSubmitting(false); return; }
      if (!addModal.date || !addModal.slotId) { setModalError('Select a date and slot'); setSubmitting(false); return; }

      // Makeup + Rescheduled → reschedule route (links new lesson to original)
      if (addModal.type === 'Makeup' || addModal.type === 'Rescheduled') {
        if (!addModal.linkedLessonId) {
          setModalError(addModal.type === 'Makeup' ? 'Select which missed lesson to make up' : 'Select which lesson to reschedule');
          setSubmitting(false); return;
        }
        const defaultNote = addModal.type === 'Makeup' ? 'Makeup lesson' : 'Rescheduled by admin';
        const res = await fetch('/api/admin-schedule/reschedule', {
          method: 'POST',
          headers: { Authorization: `Bearer ${savedPw.current}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ lessonId: addModal.linkedLessonId, newDate: addModal.date, newSlotId: addModal.slotId, notes: addModal.notes || defaultNote }),
        });
        const json = await res.json();
        if (res.status === 409) { setModalError(`Slot full — max ${json.capacity} (${json.currentCount} booked)`); return; }
        if (!res.ok) throw new Error(json.error || 'Failed');
        setAddModal(null);
        await fetchSchedule(monday, savedPw.current);
        showToast('success', addModal.type === 'Makeup' ? '✓ Makeup lesson scheduled' : '✓ Lesson rescheduled');
        return;
      }

      // Additional / Trial → add route
      const body: Record<string, any> = { type: addModal.type, date: addModal.date, slotId: addModal.slotId, notes: addModal.notes || undefined };
      if (addModal.type === 'Trial') { body.trialStudentName = addModal.trialStudentName; }
      else { body.studentId = addModal.studentId; body.notify = addModal.notify; }
      const res = await fetch('/api/admin-schedule/add', {
        method: 'POST',
        headers: { Authorization: `Bearer ${savedPw.current}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (res.status === 409) { setModalError(`Slot full — max ${json.capacity} (${json.currentCount} booked)`); return; }
      if (!res.ok) throw new Error(json.error || 'Failed');
      setAddModal(null);
      await fetchSchedule(monday, savedPw.current);
      showToast('success', '✓ Lesson added');
    } catch (err: any) { setModalError(err.message || 'Failed'); }
    finally { setSubmitting(false); }
  }

  async function handleSaveNotes() {
    if (!editNotesModal) return;
    setSubmitting(true); setModalError('');
    try {
      const res = await fetch(`/api/admin/progress/lessons?id=${editNotesModal.lesson.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${savedPw.current}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: { Notes: editNotesModal.notes } }),
      });
      if (!res.ok) throw new Error('Failed to save');
      setEditNotesModal(null);
      await fetchSchedule(monday, savedPw.current);
      showToast('success', '✓ Notes saved');
    } catch (err: any) { setModalError(err.message || 'Failed'); }
    finally { setSubmitting(false); }
  }

  const PULL_THRESHOLD = 80;
  const MAX_PULL = 120;

  function handleContentTouchStart(e: React.TouchEvent) {
    if (activeDragLesson) return;
    const el = contentRef.current;
    if (!el || el.scrollTop > 0) return;
    isPullingRef.current = true;
    pullStartYRef.current = e.touches[0].clientY;
  }

  function handleContentTouchMove(e: React.TouchEvent) {
    if (!isPullingRef.current) return;
    const delta = e.touches[0].clientY - pullStartYRef.current;
    if (delta <= 0) { isPullingRef.current = false; setPullDistance(0); return; }
    setPullDistance(Math.min(delta * 0.5, MAX_PULL));
  }

  async function handleContentTouchEnd() {
    if (!isPullingRef.current) return;
    isPullingRef.current = false;
    const dist = pullDistance;
    setPullDistance(0);
    if (dist >= PULL_THRESHOLD) {
      await fetchSchedule(new Date(mondayISO + 'T00:00:00'), savedPw.current);
    }
  }

  function openAddModal(date: Date, slot: Slot) {
    setModalError('');
    setAddModal({ type: 'Makeup', date: isoDate(date), slotId: slot.id, studentId: '', studentSearch: '', trialStudentName: '', notes: '', notify: true, linkedLessonId: '' });
  }

  function openAddModalFab() {
    setModalError('');
    const todaySlots = slotsByDay[dayNameOf(activeDate)] ?? [];
    setAddModal({ type: 'Makeup', date: isoDate(activeDate), slotId: todaySlots[0]?.id ?? (data?.slots[0]?.id ?? ''), studentId: '', studentSearch: '', trialStudentName: '', notes: '', notify: true, linkedLessonId: '' });
  }

  async function openStudentModal(studentId: string, lessonType: string) {
    const cached = contactCache[studentId];
    if (cached) {
      setModal({ student: cached, lessonType });
      return;
    }
    const name = data?.students[studentId]?.name || '';
    setModal({ student: { name, parentName: '', parentEmail: '' }, lessonType });
    setContactLoading(true);
    try {
      const res = await fetch(`/api/admin-schedule/student-contact?id=${studentId}`, {
        headers: { Authorization: `Bearer ${savedPw.current}` },
      });
      if (!res.ok) throw new Error('Failed to load');
      const contact: StudentContact = await res.json();
      setContactCache(prev => ({ ...prev, [studentId]: contact }));
      setModal(m => m ? { ...m, student: contact } : null);
    } catch {
      // modal already open with name; leave contact fields blank
    } finally {
      setContactLoading(false);
    }
  }

  // ── Lesson modal: mark progress locally so dot appears immediately ───────────
  function handleProgressLogged(lessonId: string) {
    setData(d => d ? {
      ...d,
      lessons: d.lessons.map(l => l.id === lessonId ? { ...l, progressLogged: true } : l),
    } : d);
  }

  // ── Attendance marking ───────────────────────────────────────────────────────
  async function handleAttendance(studentId: string, slotId: string, date: string, status: 'Completed' | 'Absent') {
    setSavingAttendance(prev => new Set([...prev, studentId]));
    try {
      const res = await fetch('/api/admin-schedule/attendance', {
        method: 'POST',
        headers: { Authorization: `Bearer ${savedPw.current}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId, slotId, date, status }),
      });
      if (!res.ok) throw new Error('Failed');
      const lesson = await res.json();
      const student = data?.students[studentId];
      const examDate = data?.examsByStudent?.[studentId] ?? null;
      const enriched: EnrichedLesson = {
        ...lesson,
        studentName: student?.name || 'Unknown',
        examDate,
      };
      // Add or replace the lesson record in local data
      setData(d => d ? {
        ...d,
        lessons: [...d.lessons.filter(l => l.id !== enriched.id), enriched],
      } : d);
    } catch {
      showToast('error', 'Failed to mark attendance');
    } finally {
      setSavingAttendance(prev => { const s = new Set(prev); s.delete(studentId); return s; });
    }
  }

  // Patch an existing lesson's Status directly by ID — avoids the upsert
  // formula search in handleAttendance which can fail to find existing records.
  async function handleDirectStatus(lesson: EnrichedLesson, status: 'Completed' | 'Absent' | 'Scheduled') {
    try {
      const res = await fetch(`/api/admin/progress/lessons?id=${lesson.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${savedPw.current}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: { Status: status } }),
      });
      if (!res.ok) throw new Error('Failed');
      setData(d => d ? {
        ...d,
        lessons: d.lessons.map(l => l.id === lesson.id ? { ...l, status } : l),
      } : d);
    } catch {
      showToast('error', 'Failed to update status');
    }
  }

  // Mark an existing Absent lesson back to Completed
  async function handleMarkPresent(lesson: EnrichedLesson) {
    setActionSheet(null);
    await handleDirectStatus(lesson, 'Completed');
  }

  // ── Exam date click handler ──────────────────────────────────────────────────
  async function handleExamDateClick(lesson: EnrichedLesson) {
    if (!lesson.studentId) return;
    setExamDetailModal({ studentId: lesson.studentId, studentName: lesson.studentName, exams: null });
    setExamDetailLoading(true);
    try {
      const res = await fetch(`/api/admin/progress/students/${lesson.studentId}/exams`, {
        headers: { Authorization: `Bearer ${savedPw.current}` },
      });
      if (!res.ok) throw new Error();
      const json = await res.json();
      setExamDetailModal(prev => prev ? { ...prev, exams: json.exams ?? [] } : null);
    } catch {
      setExamDetailModal(prev => prev ? { ...prev, exams: [] } : null);
    } finally {
      setExamDetailLoading(false);
    }
  }

  // ── renderLessonsSlotCard ────────────────────────────────────────────────────
  function renderLessonsSlotCard(slot: Slot, date: Date) {
    const dateStr = isoDate(date);
    const todayStr = isoDate(new Date());
    const yesterdayStr = isoDate(addDays(new Date(), -1));
    const dropId = `${dateStr}__${slot.id}`;
    const lessons = enrichedLessonMap[dropId] ?? [];
    const isToday = dateStr === todayStr;
    const isYesterday = dateStr === yesterdayStr;
    const isPast = dateStr < todayStr;
    const isFuture = dateStr > todayStr;
    // Show ✗/✓ attendance buttons only for today and yesterday
    const showAttendance = isToday || isYesterday;

    // Visibility rules:
    // - Future: only Scheduled/Completed (clean view — no Absent/Rescheduled noise)
    // - Today + past: show Absent and Rescheduled-away so undo/info is accessible
    const visibleLessons = lessons.filter(l => {
      if (l.status === 'Cancelled') return false;
      if (l.status === 'Absent') return !isFuture;
      if (l.status === 'Rescheduled') return !isFuture;
      return true;
    }).sort((a, b) => {
      // Faded (Absent or Rescheduled-away) chips sink to the bottom of their slot group
      const aFaded = (a.status === 'Absent' || a.status === 'Rescheduled') ? 1 : 0;
      const bFaded = (b.status === 'Absent' || b.status === 'Rescheduled') ? 1 : 0;
      return aFaded - bFaded;
    });
    const presentCount = visibleLessons.filter(l => l.status === 'Completed').length;

    // Ghost chips: enrolled students with no lesson record for this date.
    // Only relevant for today and yesterday (not future, not older past days).
    const enrolledIds = data?.enrollmentsBySlot?.[slot.id] ?? [];
    let ghostStudents: { id: string; name: string }[] = [];
    if (showAttendance) {
      const absentStudentIds = new Set(
        lessons.filter(l => l.status === 'Absent').map(l => l.studentId).filter(Boolean)
      );
      const dateAbsentIds = absentStudentsByDate[dateStr] ?? new Set<string>();
      const visibleStudentIds = new Set(visibleLessons.map(l => l.studentId).filter(Boolean));
      ghostStudents = enrolledIds
        .filter(id => !visibleStudentIds.has(id) && !absentStudentIds.has(id) && !dateAbsentIds.has(id))
        .map(id => ({ id, name: data?.students[id]?.name ?? 'Unknown' }));
    }

    return (
      <div key={slot.id} className={`slot-card${isToday ? ' today' : ''}`}>
        <div className="slot-header">
          <div className="slot-meta">
            <span className="slot-time">⏰ {slot.time}</span>
            {levelChip(slot.level)}
          </div>
          <div className="slot-header-right">
            <span className="capacity">{presentCount}</span>
            <button className="slot-add-btn" onClick={() => openAddModal(date, slot)} title="Add lesson">+</button>
          </div>
        </div>
        <DroppableLessonSlot
          id={dropId}
          lessons={visibleLessons}
          onChipTap={(lesson) => { setModalError(''); setActionSheet({ lesson, date: dateStr, slotId: slot.id }); }}
          onAddClick={() => openAddModal(date, slot)}
          onExamDateClick={handleExamDateClick}
          ghostStudents={ghostStudents}
          onStudentClick={(lesson) => {
            // Trial lessons have no linked student — open full progress page instead
            if (!lesson.studentId || lesson.type === 'Trial') {
              window.open(`/admin/progress?date=${lesson.date}&lesson=${lesson.id}`, '_blank');
            } else {
              setLessonModal(lesson);
            }
          }}
          onMarkPresent={showAttendance ? (lesson) => handleDirectStatus(lesson, 'Completed') : undefined}
          onMarkAbsent={showAttendance ? (lesson) => handleDirectStatus(lesson, 'Absent') : undefined}
          onUndo={showAttendance ? (lesson) => handleDirectStatus(lesson, 'Scheduled') : undefined}
          onGhostTap={(studentId, studentName) => setGhostActionSheet({ studentId, studentName, slotId: slot.id, date: dateStr })}
          savingStudents={savingAttendance}
          activeExamType={data?.activeExamType}
        />
      </div>
    );
  }

  // ── Lessons view ─────────────────────────────────────────────────────────────
  function renderLessonsView() {
    const overlayStyle = activeDragLesson ? getTypeStyle(activeDragLesson.type, activeDragLesson.status) : null;
    return (
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd} autoScroll={{ layoutShiftCompensation: false }}>
        {/* Mobile: single day, expands to full week during drag for cross-day drop */}
        <div className="mobile-day">
          {activeDragLesson ? (
            DAYS.map((day, i) => (
              <div key={day} className="day-col">
                <div className="mobile-drag-day-label">{DAY_SHORT[i]} {weekDates[i].getDate()}</div>
                {(slotsByDay[day] ?? []).map(slot => renderLessonsSlotCard(slot, weekDates[i]))}
                {(slotsByDay[day] ?? []).length === 0 && <div className="no-slots">No slots</div>}
              </div>
            ))
          ) : (
            <div className="day-col">
              {(slotsByDay[dayNameOf(activeDate)] ?? []).map(slot => renderLessonsSlotCard(slot, activeDate))}
              {(slotsByDay[dayNameOf(activeDate)] ?? []).length === 0 && <div className="no-slots">No lessons</div>}
            </div>
          )}
        </div>
        {/* Desktop: full grid */}
        <div ref={desktopScrollRef} className="desktop-grid-scroll">
        <div className="desktop-grid">
          {DAYS.map((day, i) => {
            const date = weekDates[i];
            const isToday = isoDate(date) === isoDate(new Date());
            return (
              <div key={day} className={`grid-col${isToday ? ' grid-col-today' : ''}`}>
                <div className="grid-day-header">
                  <span className="grid-day-name">{DAY_SHORT[i]}</span>
                  <span className={`grid-day-date${isToday ? ' today-date' : ''}`}>
                    {isToday ? date.getDate() : date.toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })}
                  </span>
                </div>
                {(slotsByDay[day] ?? []).map(slot => renderLessonsSlotCard(slot, date))}
                {(slotsByDay[day] ?? []).length === 0 && <div className="no-slots">No slots</div>}
              </div>
            );
          })}
        </div>
        </div>
        <DragOverlay style={{ zIndex: 9999 }}>
          {activeDragLesson && overlayStyle && (
            <div className="lesson-chip" style={{
              background: overlayStyle.bg, color: overlayStyle.text, borderColor: overlayStyle.border,
              transform: 'scale(1.05) rotate(2deg)', opacity: 0.9,
              boxShadow: '0 8px 24px rgba(0,0,0,0.2)', touchAction: 'none', cursor: 'grabbing', width: 220,
            }}>
              {activeDragLesson.type === 'Trial' && <span className="trial-badge">🆕</span>}
              <span>{activeDragLesson.studentName}</span>
              {activeDragLesson.type !== 'Regular' && <span className="type-tag">{activeDragLesson.type}</span>}
              {activeDragLesson.type !== 'Trial' && activeDragLesson.notes && (
                <div className="text-[10px] italic text-amber-700 mt-0.5 leading-tight">↳ {activeDragLesson.notes}</div>
              )}
            </div>
          )}
        </DragOverlay>
      </DndContext>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{scheduleCSS}</style>

      {/* Header */}
      <div className="sched-header">
        <div className="sched-title">
          <a href="/admin" className="back-link">← Admin</a>
          <h1>Schedule</h1>
        </div>
        <div className="week-nav">
          <button className="nav-btn" onClick={prevWeek}>‹</button>
          <button className="week-label" onClick={thisWeek}>{formatWeekLabel(monday)}</button>
          <button className="nav-btn" onClick={nextWeek}>›</button>
          <button className="nav-btn refresh-btn" onClick={() => fetchSchedule(new Date(mondayISO + 'T00:00:00'), savedPw.current)} disabled={loading} title="Refresh">↻</button>
        </div>
      </div>

      {/* View tabs */}
      <div className="view-tabs-bar">
        {/* Left spacer — same flex weight as the right side so tabs stay centred */}
        <div className="view-tabs-side" />
        <div className="view-tabs">
          <button
            className={`view-tab ${viewMode === 'lessons' ? 'active' : ''}`}
            onClick={() => setViewMode('lessons')}
          >
            Lessons
          </button>
          <button
            className={`view-tab ${viewMode === 'roster' ? 'active' : ''}`}
            onClick={() => setViewMode('roster')}
          >
            Roster
          </button>
        </div>
        {/* Right side — Today pill lives here, always reserves space */}
        <div className="view-tabs-side view-tabs-right">
          {viewMode === 'lessons' && (
            <button className="today-pill-btn" onClick={goToToday} title="Go to today">
              Today
            </button>
          )}
        </div>
      </div>

      {/* Date strip wrapper — sticky bar, only shown in Lessons mode */}
      <div className={`date-strip-wrap${viewMode !== 'lessons' ? ' date-strip-wrap-hidden' : ''}`}>
        <div ref={stripRef} className="date-strip">
          {stripDates.map((date, idx) => {
            const iso = isoDate(date);
            const isActive = iso === isoDate(activeDate);
            const isTodayPill = iso === isoDate(new Date());
            const prevDate = idx > 0 ? stripDates[idx - 1] : null;
            const isFirstOfMonth = !prevDate || prevDate.getMonth() !== date.getMonth();
            return (
              <React.Fragment key={iso}>
                {isFirstOfMonth && (
                  <div className="strip-month-label">
                    {date.toLocaleDateString('en-SG', { month: 'short', year: 'numeric' })}
                  </div>
                )}
                <button
                  data-iso={iso}
                  className={`date-pill${isActive ? ' active' : ''}${isTodayPill ? ' today' : ''}`}
                  onClick={() => setActiveDateFromPill(date)}
                >
                  <span className="dp-dow">{date.toLocaleDateString('en-SG', { weekday: 'short' }).slice(0, 3).toUpperCase()}</span>
                  <span className="dp-date">{date.getDate()}</span>
                  {isTodayPill && <span className="dp-today-dot" />}
                </button>
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div
        className="sched-content"
        ref={contentRef}
        onTouchStart={handleContentTouchStart}
        onTouchMove={handleContentTouchMove}
        onTouchEnd={handleContentTouchEnd}
      >
        {/* Pull-to-refresh indicator */}
        {pullDistance > 0 && (
          <div style={{
            textAlign: 'center', padding: '8px 0', fontSize: 13,
            color: '#64748b', transform: `translateY(${pullDistance - 40}px)`,
            transition: 'none',
          }}>
            {pullDistance >= PULL_THRESHOLD ? '↑ Release to refresh' : '↓ Pull to refresh'}
          </div>
        )}
        {loading && <div className="loading-msg">Loading…</div>}
        {error && (
          <div className="error-banner">
            {error}
            <button onClick={() => fetchSchedule(new Date(mondayISO + 'T00:00:00'), savedPw.current)}>Retry</button>
          </div>
        )}

        {!loading && !error && data && (
          viewMode === 'lessons' ? renderLessonsView() : renderRosterView()
        )}

        {!loading && !error && !data && (
          <div className="loading-msg">No data</div>
        )}
      </div>

      {/* Legend */}
      <div className="legend">
        {Object.entries(TYPE_COLORS).map(([type, style]) => (
          <span key={type} className="legend-item" style={{ color: style.text, background: style.bg, borderColor: style.border }}>
            {type === 'Trial' && '🆕 '}{type}
          </span>
        ))}
      </div>

      {/* Student modal */}
      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="modal-name">{modal.student.name}</div>
                <div className="modal-type" style={{ color: TYPE_COLORS[modal.lessonType]?.text || '#64748b' }}>
                  {modal.lessonType} Lesson
                </div>
              </div>
              <button className="modal-close" onClick={() => setModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              {contactLoading ? (
                <div className="modal-row" style={{ color: '#94a3b8', fontStyle: 'italic' }}>Loading contact info…</div>
              ) : (
                <>
                  {modal.student.parentName && (
                    <div className="modal-row">
                      <span className="modal-label">Parent</span>
                      <span>{modal.student.parentName}</span>
                    </div>
                  )}
                  {modal.student.parentEmail && (
                    <div className="modal-row">
                      <span className="modal-label">Email</span>
                      <a href={`mailto:${modal.student.parentEmail}`}>{modal.student.parentEmail}</a>
                    </div>
                  )}
                  {modal.student.parentContact && (
                    <div className="modal-row">
                      <span className="modal-label">Parent #</span>
                      <a href={`tel:${modal.student.parentContact}`}>{modal.student.parentContact}</a>
                    </div>
                  )}
                  {modal.student.studentContact && (
                    <div className="modal-row">
                      <span className="modal-label">Student #</span>
                      <a href={`tel:${modal.student.studentContact}`}>{modal.student.studentContact}</a>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Exam detail modal */}
      {examDetailModal && (
        <div className="modal-overlay" onClick={() => setExamDetailModal(null)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="modal-name">{examDetailModal.studentName}</div>
                <div className="modal-type" style={{ color: '#64748b' }}>Exam Records</div>
              </div>
              <button className="modal-close" onClick={() => setExamDetailModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              {examDetailLoading || examDetailModal.exams === null ? (
                <div className="modal-row" style={{ color: '#94a3b8', fontStyle: 'italic' }}>Loading…</div>
              ) : examDetailModal.exams.length === 0 ? (
                <div className="modal-row" style={{ color: '#94a3b8', fontStyle: 'italic' }}>No exam records found</div>
              ) : (
                examDetailModal.exams
                  .slice()
                  .sort((a: any, b: any) => {
                    const order = ['WA1', 'WA2', 'WA3', 'EOY'];
                    return order.indexOf(a.examType) - order.indexOf(b.examType);
                  })
                  .map((exam: any) => (
                    <div key={exam.id} className="modal-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4, paddingBottom: 10, borderBottom: '1px solid #f1f5f9' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 700, fontSize: 12, background: '#f1f5f9', padding: '2px 6px', borderRadius: 4 }}>{exam.examType}</span>
                        {exam.subject && <span style={{ fontSize: 12, color: '#64748b', background: '#f8fafc', padding: '2px 6px', borderRadius: 4, border: '1px solid #e2e8f0' }}>{exam.subject}</span>}
                        {exam.noExam && <span style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic' }}>no exam</span>}
                      </div>
                      {exam.examDate && (
                        <div style={{ display: 'flex', gap: 6, fontSize: 13, color: '#334155' }}>
                          <span style={{ color: '#94a3b8' }}>📅</span>
                          <span>{formatExamDate(exam.examDate)}</span>
                        </div>
                      )}
                      {exam.testedTopics && (
                        <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.4 }}>
                          <span style={{ color: '#94a3b8' }}>Topics: </span>{exam.testedTopics}
                        </div>
                      )}
                      {exam.examNotes && (
                        <div style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>{exam.examNotes}</div>
                      )}
                      {!exam.examDate && !exam.testedTopics && !exam.noExam && (
                        <div style={{ fontSize: 12, color: '#cbd5e1', fontStyle: 'italic' }}>No details yet</div>
                      )}
                    </div>
                  ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* FAB (lessons view only) */}
      {viewMode === 'lessons' && data && (
        <button className="fab" onClick={openAddModalFab} title="Add lesson">+</button>
      )}

      {/* Ghost chip action sheet (mark attendance) */}
      {ghostActionSheet && (
        <div className="action-sheet-overlay" onClick={() => setGhostActionSheet(null)}>
          <div className="action-sheet-card" onClick={e => e.stopPropagation()}>
            <div className="action-sheet-header">
              <div className="action-sheet-title">{ghostActionSheet.studentName}</div>
              <div className="action-sheet-sub">Mark attendance</div>
            </div>
            <button className="action-btn" onClick={() => {
              handleAttendance(ghostActionSheet.studentId, ghostActionSheet.slotId, ghostActionSheet.date, 'Completed');
              setGhostActionSheet(null);
            }}>✅ Mark present</button>
            <button className="action-btn" onClick={() => {
              handleAttendance(ghostActionSheet.studentId, ghostActionSheet.slotId, ghostActionSheet.date, 'Absent');
              setGhostActionSheet(null);
            }}>🚫 Mark absent</button>
            <button className="action-btn cancel-btn" onClick={() => setGhostActionSheet(null)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Action sheet */}
      {actionSheet && (
        <div className="action-sheet-overlay" onClick={() => setActionSheet(null)}>
          <div className="action-sheet-card" onClick={e => e.stopPropagation()}>
            <div className="action-sheet-header">
              <div className="action-sheet-title">{actionSheet.lesson.studentName}</div>
              <div className="action-sheet-sub">{formatDateSlot(actionSheet.date, actionSheet.slotId)}</div>
            </div>
            <button className="action-btn" onClick={() => {
              window.open(`/admin/progress?date=${actionSheet.date}&lesson=${actionSheet.lesson.id}`, '_blank');
              setActionSheet(null);
            }}>📊 Log progress</button>
            <button className="action-btn" onClick={() => {
              setRescheduleModal({ lesson: actionSheet.lesson, toDate: '', toSlotId: '', notes: '', notify: true, showPickers: true });
              setModalError(''); setActionSheet(null);
            }}>🔄 Reschedule</button>
            {actionSheet.lesson.status !== 'Completed' && (
              <button className="action-btn" onClick={() => { setActionSheet(null); handleMarkPresent(actionSheet.lesson); }}>✅ Mark present</button>
            )}
            {actionSheet.lesson.status !== 'Absent' && (
              <button className="action-btn" onClick={() => {
                setAbsentModal({ lesson: actionSheet.lesson, notify: false, reason: '' });
                setModalError(''); setActionSheet(null);
              }}>🚫 Mark absent</button>
            )}
            <button className="action-btn" onClick={() => {
              setEditNotesModal({ lesson: actionSheet.lesson, notes: actionSheet.lesson.notes });
              setModalError(''); setActionSheet(null);
            }}>📝 Edit notes</button>
            <button className="action-btn danger" onClick={() => {
              setDeleteModal({ lesson: actionSheet.lesson, notify: false, reason: '' });
              setModalError(''); setActionSheet(null);
            }}>🗑 Delete lesson</button>
            <button className="action-btn cancel-btn" onClick={() => setActionSheet(null)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Reschedule modal */}
      {rescheduleModal && (
        <div className="modal-overlay" onClick={() => !submitting && setRescheduleModal(null)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="modal-name">Reschedule</div>
                <div className="modal-type">{rescheduleModal.lesson.studentName}</div>
              </div>
              <button className="modal-close" onClick={() => setRescheduleModal(null)} disabled={submitting}>✕</button>
            </div>
            <div className="modal-body">
              <div className="modal-row">
                <span className="modal-label">From</span>
                <span>{formatDateSlot(rescheduleModal.lesson.date, rescheduleModal.lesson.slotId)}</span>
              </div>
              {rescheduleModal.showPickers ? (
                <>
                  <div className="form-group">
                    <span className="form-label">New Date</span>
                    <input type="date" className="modal-input" value={rescheduleModal.toDate}
                      onChange={e => setRescheduleModal(m => m ? { ...m, toDate: e.target.value } : null)} />
                  </div>
                  <div className="form-group">
                    <span className="form-label">New Slot</span>
                    <select className="modal-select" value={rescheduleModal.toSlotId}
                      onChange={e => setRescheduleModal(m => m ? { ...m, toSlotId: e.target.value } : null)}>
                      <option value="">Select slot…</option>
                      {sortedSlots.map(s => <option key={s.id} value={s.id}>{s.dayName} {s.time} ({s.level})</option>)}
                    </select>
                  </div>
                </>
              ) : (
                <div className="modal-row">
                  <span className="modal-label">To</span>
                  <span>{formatDateSlot(rescheduleModal.toDate, rescheduleModal.toSlotId)}</span>
                </div>
              )}
              <div className="form-group">
                <span className="form-label">Notes</span>
                <textarea className="modal-textarea" rows={2} placeholder="Optional note…"
                  value={rescheduleModal.notes}
                  onChange={e => setRescheduleModal(m => m ? { ...m, notes: e.target.value } : null)} />
              </div>
              <label className="check-row">
                <input type="checkbox" checked={rescheduleModal.notify}
                  onChange={e => setRescheduleModal(m => m ? { ...m, notify: e.target.checked } : null)} />
                Notify student &amp; parent
              </label>
              {modalError && <div className="modal-error">{modalError}</div>}
              <div className="modal-actions">
                <button className="btn-cancel" onClick={() => setRescheduleModal(null)} disabled={submitting}>Cancel</button>
                <button className="btn-primary" onClick={handleConfirmReschedule}
                  disabled={submitting || (rescheduleModal.showPickers && (!rescheduleModal.toDate || !rescheduleModal.toSlotId))}>
                  {submitting ? 'Rescheduling…' : 'Confirm'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Absent modal */}
      {absentModal && (
        <div className="modal-overlay" onClick={() => !submitting && setAbsentModal(null)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="modal-name">Mark Absent</div>
                <div className="modal-type">{absentModal.lesson.studentName}</div>
              </div>
              <button className="modal-close" onClick={() => setAbsentModal(null)} disabled={submitting}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <span className="form-label">Reason (optional)</span>
                <input type="text" className="modal-input" placeholder="e.g. No show"
                  value={absentModal.reason}
                  onChange={e => setAbsentModal(m => m ? { ...m, reason: e.target.value } : null)} />
              </div>
              <label className="check-row">
                <input type="checkbox" checked={absentModal.notify}
                  onChange={e => setAbsentModal(m => m ? { ...m, notify: e.target.checked } : null)} />
                Notify student &amp; parent
              </label>
              {modalError && <div className="modal-error">{modalError}</div>}
              <div className="modal-actions">
                <button className="btn-cancel" onClick={() => setAbsentModal(null)} disabled={submitting}>Cancel</button>
                <button className="btn-primary" onClick={handleConfirmAbsent} disabled={submitting}>
                  {submitting ? 'Saving…' : 'Mark Absent'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete modal */}
      {deleteModal && (
        <div className="modal-overlay" onClick={() => !submitting && setDeleteModal(null)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="modal-name">Delete Lesson</div>
                <div className="modal-type" style={{ color: '#dc2626' }}>{deleteModal.lesson.studentName}</div>
              </div>
              <button className="modal-close" onClick={() => setDeleteModal(null)} disabled={submitting}>✕</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 14, color: '#374151' }}>Permanently delete this lesson record? This cannot be undone.</p>
              <label className="check-row">
                <input type="checkbox" checked={deleteModal.notify}
                  onChange={e => setDeleteModal(m => m ? { ...m, notify: e.target.checked } : null)} />
                Notify student &amp; parent
              </label>
              {modalError && <div className="modal-error">{modalError}</div>}
              <div className="modal-actions">
                <button className="btn-cancel" onClick={() => setDeleteModal(null)} disabled={submitting}>Cancel</button>
                <button className="btn-danger" onClick={handleConfirmDelete} disabled={submitting}>
                  {submitting ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit notes modal */}
      {editNotesModal && (
        <div className="modal-overlay" onClick={() => !submitting && setEditNotesModal(null)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="modal-name">Edit Notes</div>
                <div className="modal-type">{editNotesModal.lesson.studentName}</div>
              </div>
              <button className="modal-close" onClick={() => setEditNotesModal(null)} disabled={submitting}>✕</button>
            </div>
            <div className="modal-body">
              <textarea className="modal-textarea" rows={4}
                value={editNotesModal.notes}
                onChange={e => setEditNotesModal(m => m ? { ...m, notes: e.target.value } : null)}
                placeholder="Lesson notes…" />
              {modalError && <div className="modal-error">{modalError}</div>}
              <div className="modal-actions">
                <button className="btn-cancel" onClick={() => setEditNotesModal(null)} disabled={submitting}>Cancel</button>
                <button className="btn-primary" onClick={handleSaveNotes} disabled={submitting}>
                  {submitting ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add lesson modal */}
      {addModal && (
        <div className="modal-overlay" onClick={() => !submitting && setAddModal(null)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div><div className="modal-name">Add Lesson</div></div>
              <button className="modal-close" onClick={() => setAddModal(null)} disabled={submitting}>✕</button>
            </div>
            <div className="modal-body">
              {/* Type */}
              <div className="form-group">
                <span className="form-label">Type</span>
                <select className="modal-select" value={addModal.type}
                  onChange={e => {
                    const t = e.target.value as AddModalState['type'];
                    setAddModal(m => m ? { ...m, type: t, studentId: '', studentSearch: '', linkedLessonId: '' } : null);
                    setAbsentLessons([]); setAbsentLessonsError('');
                    setUpcomingLessons([]); setUpcomingLessonsError('');
                  }}>
                  <option value="Makeup">Makeup</option>
                  <option value="Rescheduled">Rescheduled</option>
                  <option value="Additional">Additional</option>
                  <option value="Trial">Trial</option>
                </select>
              </div>
              {/* Date */}
              <div className="form-group">
                <span className="form-label">Date</span>
                <input type="date" className="modal-input" value={addModal.date}
                  onChange={e => setAddModal(m => m ? { ...m, date: e.target.value } : null)} />
              </div>
              {/* Slot */}
              <div className="form-group">
                <span className="form-label">Slot</span>
                <select className="modal-select" value={addModal.slotId}
                  onChange={e => setAddModal(m => m ? { ...m, slotId: e.target.value } : null)}>
                  <option value="">Select slot…</option>
                  {data?.slots.map(s => <option key={s.id} value={s.id}>{s.dayName} {s.time} ({s.level})</option>)}
                </select>
              </div>
              {/* Student search (Additional/Makeup) */}
              {addModal.type !== 'Trial' && (
                <div className="form-group">
                  <span className="form-label">Student</span>
                  {addModal.studentId ? (
                    <div className="student-selected">
                      ✓ {data?.students[addModal.studentId]?.name ?? addModal.studentId}
                      <button style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: 12 }}
                        onClick={() => {
                          setAddModal(m => m ? { ...m, studentId: '', studentSearch: '', linkedLessonId: '' } : null);
                          setAbsentLessons([]); setAbsentLessonsError('');
                          setUpcomingLessons([]); setUpcomingLessonsError('');
                        }}>change</button>
                    </div>
                  ) : (
                    <>
                      <input type="text" className="modal-input" placeholder="Search student name…"
                        value={addModal.studentSearch}
                        onChange={e => setAddModal(m => m ? { ...m, studentSearch: e.target.value } : null)} />
                      {addModal.studentSearch && (
                        <div className="student-search-results">
                          {Object.entries(data?.students ?? {})
                            .filter(([, s]) => s.name.toLowerCase().includes(addModal.studentSearch.toLowerCase()))
                            .slice(0, 8)
                            .map(([id, s]) => (
                              <button key={id} className="student-result"
                                onClick={() => {
                                  setAddModal(m => m ? { ...m, studentId: id, studentSearch: '' } : null);
                                  if (addModal.type === 'Makeup') fetchAbsentLessons(id);
                                  if (addModal.type === 'Rescheduled') fetchUpcomingLessons(id);
                                }}>
                                {s.name}
                              </button>
                            ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Missed lesson picker — Makeup only, shown after a student is selected */}
              {addModal.type === 'Makeup' && addModal.studentId && (
                <div className="form-group">
                  <span className="form-label">Missed lesson to make up</span>
                  {absentLessonsLoading ? (
                    <div style={{ fontSize: 13, color: '#94a3b8', padding: '8px 0' }}>Loading missed lessons…</div>
                  ) : absentLessonsError ? (
                    <div style={{ fontSize: 13, color: '#dc2626', padding: '8px 0' }}>{absentLessonsError}</div>
                  ) : absentLessons.length === 0 ? (
                    <div style={{ fontSize: 13, color: '#94a3b8', padding: '8px 0' }}>No unmatched absent lessons found</div>
                  ) : (
                    <select className="modal-select" value={addModal.linkedLessonId}
                      onChange={e => setAddModal(m => m ? { ...m, linkedLessonId: e.target.value } : null)}>
                      <option value="">Select missed lesson…</option>
                      {absentLessons.map(l => {
                        const d = new Date(l.date + 'T00:00:00');
                        const dateLabel = d.toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
                        const slot = l.slotId ? data?.slots.find(s => s.id === l.slotId) : null;
                        return (
                          <option key={l.id} value={l.id}>
                            {dateLabel}{slot ? ` · ${slot.time}` : ''}
                          </option>
                        );
                      })}
                    </select>
                  )}
                </div>
              )}
              {/* Lesson to reschedule picker — Rescheduled only */}
              {addModal.type === 'Rescheduled' && addModal.studentId && (
                <div className="form-group">
                  <span className="form-label">Lesson to reschedule</span>
                  {upcomingLessonsLoading ? (
                    <div style={{ fontSize: 13, color: '#94a3b8', padding: '8px 0' }}>Loading upcoming lessons…</div>
                  ) : upcomingLessonsError ? (
                    <div style={{ fontSize: 13, color: '#dc2626', padding: '8px 0' }}>{upcomingLessonsError}</div>
                  ) : upcomingLessons.length === 0 ? (
                    <div style={{ fontSize: 13, color: '#94a3b8', padding: '8px 0' }}>No upcoming scheduled lessons found</div>
                  ) : (
                    <select className="modal-select" value={addModal.linkedLessonId}
                      onChange={e => setAddModal(m => m ? { ...m, linkedLessonId: e.target.value } : null)}>
                      <option value="">Select lesson to reschedule…</option>
                      {upcomingLessons.map(l => {
                        const d = new Date(l.date + 'T00:00:00');
                        const dateLabel = d.toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
                        const slot = l.slotId ? data?.slots.find(s => s.id === l.slotId) : null;
                        return (
                          <option key={l.id} value={l.id}>
                            {dateLabel}{slot ? ` · ${slot.time}` : ''}
                          </option>
                        );
                      })}
                    </select>
                  )}
                </div>
              )}

              {/* Trial name */}
              {addModal.type === 'Trial' && (
                <div className="form-group">
                  <span className="form-label">Trial Student Name</span>
                  <input type="text" className="modal-input" placeholder="Full name"
                    value={addModal.trialStudentName}
                    onChange={e => setAddModal(m => m ? { ...m, trialStudentName: e.target.value } : null)} />
                </div>
              )}
              {/* Notes */}
              <div className="form-group">
                <span className="form-label">Notes (optional)</span>
                <textarea className="modal-textarea" rows={2}
                  value={addModal.notes}
                  onChange={e => setAddModal(m => m ? { ...m, notes: e.target.value } : null)} />
              </div>
              {/* Notify (Additional/Makeup only) */}
              {addModal.type !== 'Trial' && (
                <label className="check-row">
                  <input type="checkbox" checked={addModal.notify}
                    onChange={e => setAddModal(m => m ? { ...m, notify: e.target.checked } : null)} />
                  Notify student &amp; parent
                </label>
              )}
              {modalError && <div className="modal-error">{modalError}</div>}
              <div className="modal-actions">
                <button className="btn-cancel" onClick={() => setAddModal(null)} disabled={submitting}>Cancel</button>
                <button className="btn-primary" onClick={handleConfirmAdd} disabled={submitting}>
                  {submitting ? 'Adding…' : 'Add Lesson'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Lesson input modal */}
      {lessonModal && (
        <LessonModal
          lesson={lessonModal}
          password={savedPw.current}
          slots={data?.slots ?? []}
          onClose={() => setLessonModal(null)}
          onProgressLogged={handleProgressLogged}
        />
      )}

      {/* Toast */}
      {toast && <div className={`toast toast-${toast.type}`}>{toast.message}</div>}
    </>
  );
}

// ─── CSS ──────────────────────────────────────────────────────────────────────

const loginCSS = `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f1f5f9; }
.login-wrap {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1a365d 0%, #2d3748 100%);
  padding: 24px;
}
.login-card {
  background: white;
  border-radius: 20px;
  padding: 40px 32px;
  width: 100%;
  max-width: 340px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.3);
  text-align: center;
}
.login-icon { font-size: 40px; margin-bottom: 12px; }
.login-card h1 { font-size: 24px; color: #0f172a; margin-bottom: 4px; font-weight: 700; }
.login-card p { font-size: 14px; color: #64748b; margin-bottom: 28px; }
.pw-input {
  width: 100%; padding: 12px 14px;
  border: 1.5px solid #e2e8f0; border-radius: 10px;
  font-size: 16px; margin-bottom: 10px;
  font-family: inherit; text-align: center; letter-spacing: 0.08em;
  outline: none;
}
.pw-input:focus { border-color: #1a365d; box-shadow: 0 0 0 3px rgba(26,54,93,0.15); }
.pw-error { font-size: 13px; color: #dc2626; margin-bottom: 10px; }
.pw-btn {
  width: 100%; padding: 12px;
  background: #1a365d; color: white;
  border: none; border-radius: 10px;
  font-size: 15px; font-weight: 600;
  cursor: pointer; font-family: inherit;
  transition: background 0.15s;
}
.pw-btn:hover:not(:disabled) { background: #243058; }
.pw-btn:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const scheduleCSS = `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: #f1f5f9;
  color: #1e293b;
  min-height: 100vh;
}

/* ── Header ── */
.sched-header {
  background: #1a365d;
  color: white;
  padding: 16px 20px 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  position: sticky;
  top: 0;
  z-index: 100;
}
.sched-title { display: flex; align-items: center; gap: 14px; }
.back-link {
  font-size: 14px; color: rgba(255,255,255,0.65);
  text-decoration: none; padding: 4px 0;
}
.back-link:hover { color: white; }
.sched-title h1 { font-size: 20px; font-weight: 700; }
.week-nav { display: flex; align-items: center; gap: 6px; }
.nav-btn {
  width: 34px; height: 34px;
  background: rgba(255,255,255,0.15);
  border: none; border-radius: 8px;
  color: white; font-size: 20px; line-height: 1;
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  transition: background 0.15s;
}
.nav-btn:hover { background: rgba(255,255,255,0.25); }
.refresh-btn { font-size: 18px; }
.refresh-btn:disabled { opacity: 0.5; cursor: default; }
.drag-handle {
  align-self: stretch;
  display: flex; align-items: center; justify-content: center;
  min-width: 28px; padding: 0 6px;
  flex-shrink: 0; cursor: grab; opacity: 0.35;
  border-right: 1px solid rgba(0,0,0,0.1); margin-right: 4px;
  user-select: none; -webkit-user-select: none;
}
.mobile-drag-day-label {
  font-size: 11px; font-weight: 700; letter-spacing: 0.06em;
  text-transform: uppercase; color: #64748b;
  padding: 10px 0 4px; border-bottom: 1px solid #e2e8f0;
  margin-bottom: 2px;
}
.week-label {
  font-size: 14px; font-weight: 600; color: white;
  background: none; border: none; cursor: pointer;
  padding: 6px 10px; border-radius: 8px;
  transition: background 0.15s; white-space: nowrap;
}
.week-label:hover { background: rgba(255,255,255,0.15); }

/* ── View tabs ── */
.view-tabs-bar {
  background: white;
  border-bottom: 1px solid #e2e8f0;
  padding: 6px 12px;
  position: sticky;
  top: 57px;
  z-index: 95;
  display: flex;
  align-items: center;
  gap: 8px;
}
/* Equal-flex sides keep the centre tabs truly centred */
.view-tabs-side {
  flex: 1;
}
.view-tabs-right {
  display: flex;
  justify-content: flex-end;
  align-items: center;
}
.view-tabs {
  flex: 0 0 auto;
  display: flex;
  background: #f1f5f9;
  border-radius: 20px;
  padding: 3px;
  gap: 2px;
  min-width: 180px;
}
.view-tab {
  flex: 1;
  padding: 6px 16px;
  border: none;
  border-radius: 16px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  background: transparent;
  color: #64748b;
  font-family: inherit;
  transition: background 0.15s, color 0.15s;
  white-space: nowrap;
}
.view-tab:hover:not(.active) { background: rgba(255,255,255,0.6); color: #1e293b; }
.view-tab.active {
  background: #1a365d;
  color: white;
  font-weight: 600;
}

/* ── Date strip (mobile, replaces old day-tabs) ── */
.date-strip-wrap {
  display: flex;
  align-items: stretch;
  background: white;
  border-bottom: 1px solid #e2e8f0;
  position: sticky;
  top: 107px;
  z-index: 90;
}
.date-strip-wrap-hidden { display: none !important; }
.date-strip {
  flex: 1;
  display: flex;
  gap: 4px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  padding: 6px 8px;
}
.date-strip::-webkit-scrollbar { display: none; }
/* Today pill — sits in the right flex slot, no absolute positioning needed */
.today-pill-btn {
  border: 1.5px solid #cbd5e1;
  border-radius: 12px;
  background: white;
  color: #1a365d;
  font-size: 11px;
  font-weight: 700;
  padding: 3px 9px;
  cursor: pointer;
  font-family: inherit;
  letter-spacing: 0.03em;
  transition: background 0.12s, border-color 0.12s;
  white-space: nowrap;
}
.today-pill-btn:hover { background: #f1f5f9; border-color: #94a3b8; }
/* Hidden on desktop — the date strip handles navigation there */
@media (min-width: 768px) {
  .today-pill-btn { display: none; }
  .view-tabs-side { display: none; }
}
.date-pill {
  flex-shrink: 0;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 1px; padding: 6px 8px;
  min-width: 46px;
  border: none; border-radius: 10px;
  background: transparent;
  color: #64748b;
  cursor: pointer;
  transition: background 0.12s;
  font-family: inherit;
}
.date-pill:hover { background: #f1f5f9; }
.date-pill.today:not(.active) { background: rgba(26,54,93,0.07); }
.date-pill.today .dp-date { color: #1a365d; font-weight: 700; }
.date-pill.active { background: #1a365d; color: #FFF8E7; }
.date-pill.active .dp-date { color: #FFF8E7; font-weight: 700; }
.date-pill.active .dp-dow { color: rgba(255,248,231,0.75); }
.dp-dow { font-size: 10px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; }
.dp-date { font-size: 15px; font-weight: 600; margin-top: 1px; }
/* Dot under today's date number */
.dp-today-dot {
  width: 4px; height: 4px; border-radius: 50%;
  background: #1a365d; margin-top: 2px;
  display: block;
}
.date-pill.active .dp-today-dot { background: #FFF8E7; }
/* Month label inserted before the first pill of each month */
.strip-month-label {
  flex-shrink: 0;
  align-self: flex-end;
  padding: 0 6px 8px 2px;
  font-size: 10px; font-weight: 700;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  white-space: nowrap;
  border-left: 1px solid #e2e8f0;
  margin-left: 4px;
  line-height: 1;
}
/* ── Roster day tabs (mobile, Mon–Sun labels only, no dates) ── */
.roster-day-tabs {
  display: flex;
  background: white;
  border-bottom: 1px solid #e2e8f0;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}
.roster-day-tabs::-webkit-scrollbar { display: none; }
.roster-day-tab {
  flex: 1; min-width: 0;
  padding: 10px 4px;
  border: none; background: none;
  font-size: 12px; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.05em;
  color: #64748b; cursor: pointer;
  border-bottom: 3px solid transparent;
  transition: background 0.1s, color 0.1s;
  font-family: inherit;
  white-space: nowrap;
}
.roster-day-tab:hover { background: #f8fafc; }
.roster-day-tab.active { border-bottom-color: #1a365d; color: #1a365d; }

/* ── Content area ── */
.sched-content { padding: 12px 12px 80px; max-width: 1400px; margin: 0 auto; }
.loading-msg { text-align: center; color: #94a3b8; padding: 48px; font-size: 15px; }
.error-banner {
  background: #fef2f2; border: 1px solid #fca5a5; color: #b91c1c;
  padding: 14px 18px; border-radius: 10px; margin: 16px 0;
  display: flex; align-items: center; justify-content: space-between;
  font-size: 14px;
}
.error-banner button {
  background: #ef4444; color: white; border: none;
  padding: 6px 14px; border-radius: 6px; font-size: 13px;
  cursor: pointer; font-family: inherit;
}

/* ── Mobile: single day view ── */
.mobile-day { display: block; }
.desktop-grid { display: none; }
.day-col { display: flex; flex-direction: column; gap: 10px; }

/* ── Slot cards ── */
.slot-card {
  background: white;
  border-radius: 14px;
  padding: 14px 16px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.07);
  border: 1px solid #e8ecf1;
}
.slot-card.today { border-color: #bfdbfe; }
.slot-header {
  display: flex; align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
.slot-meta { display: flex; align-items: center; gap: 8px; }
.slot-time { font-size: 14px; font-weight: 600; color: #1e293b; }
.slot-level {
  font-size: 11px; font-weight: 700; letter-spacing: 0.06em;
  padding: 2px 8px; border-radius: 20px;
  text-transform: uppercase;
}
.level-jc  { background: #eff6ff; color: #1d4ed8; }
.level-sec { background: #f0fdf4; color: #15803d; }
.level-mixed { background: #faf5ff; color: #7c3aed; }
.capacity {
  font-size: 13px; font-weight: 600; color: #64748b;
  background: #f1f5f9; padding: 3px 9px; border-radius: 20px;
}
.capacity.full { background: #fef2f2; color: #dc2626; }
.capacity.dim { color: #94a3b8; }
.no-slots { text-align: center; color: #94a3b8; font-size: 14px; padding: 24px 0; }

/* ── Lesson chips ── */
.lesson-list { display: flex; flex-direction: column; gap: 5px; }
.lesson-chip {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 12px; border-radius: 8px;
  font-size: 14px; font-weight: 500;
  border: 1px solid; cursor: default;
  transition: opacity 0.1s;
}
.lesson-chip[role="button"] { cursor: pointer; }
.lesson-chip[role="button"]:hover { opacity: 0.8; }
.lesson-chip.absent { opacity: 0.6; }
.absent-name { text-decoration: line-through; color: #94a3b8; }
.trial-badge { font-size: 14px; }
.type-tag {
  display: block;
  font-size: 11px; font-weight: 600;
  opacity: 0.7; white-space: nowrap;
}
.absent-tag { opacity: 0.9; }
.empty-enrolled { padding: 6px 0; }
.enrolled-hint { font-size: 13px; color: #94a3b8; font-style: italic; }

/* ── Legend ── */
.legend {
  position: fixed; bottom: 0; left: 0; right: 0;
  background: white; border-top: 1px solid #e2e8f0;
  padding: 10px 16px;
  display: flex; gap: 6px; overflow-x: auto;
  scrollbar-width: none; z-index: 80;
}
.legend::-webkit-scrollbar { display: none; }
.legend-item {
  font-size: 11px; font-weight: 600;
  padding: 3px 10px; border-radius: 20px;
  border: 1px solid; white-space: nowrap;
}

/* ── Modal ── */
.modal-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.4);
  display: flex; align-items: flex-end; justify-content: center;
  z-index: 200; padding: 16px;
}
@media (min-width: 480px) {
  .modal-overlay { align-items: center; }
}
.modal-card {
  background: white; border-radius: 20px;
  width: 100%; max-width: 400px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.25);
  overflow: hidden;
}
.modal-header {
  display: flex; align-items: flex-start;
  justify-content: space-between;
  padding: 20px 20px 16px;
  border-bottom: 1px solid #f1f5f9;
}
.modal-name { font-size: 20px; font-weight: 700; color: #0f172a; }
.modal-type { font-size: 13px; font-weight: 500; margin-top: 2px; }
.modal-close {
  background: #f1f5f9; border: none; border-radius: 50%;
  width: 32px; height: 32px; font-size: 14px;
  cursor: pointer; flex-shrink: 0; color: #64748b;
  display: flex; align-items: center; justify-content: center;
}
.modal-body { padding: 16px 20px 24px; display: flex; flex-direction: column; gap: 12px; }
.modal-row { display: flex; align-items: center; gap: 12px; font-size: 15px; }
.modal-label {
  font-size: 11px; font-weight: 700; letter-spacing: 0.08em;
  text-transform: uppercase; color: #94a3b8; min-width: 52px;
}
.modal-row a { color: #1a365d; font-weight: 500; text-decoration: none; }
.modal-row a:hover { text-decoration: underline; }

/* ── Desktop grid ── */
@media (min-width: 768px) {
  .mobile-day { display: none; }
  .date-strip-wrap { display: none; }
  .roster-day-tabs { display: none; }
  .desktop-grid-scroll {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
  .desktop-grid {
    display: grid;
    grid-template-columns: repeat(7, minmax(160px, 1fr));
    min-width: 1120px;
    gap: 8px;
    align-items: start;
  }
  .grid-col { display: flex; flex-direction: column; gap: 8px; }
  .grid-col-today .slot-card { border-color: #bfdbfe; }
  .grid-day-header {
    display: flex; flex-direction: column; align-items: center;
    padding: 10px 4px; margin-bottom: 2px;
  }
  .grid-day-name {
    font-size: 11px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.08em; color: #94a3b8;
  }
  .grid-day-date { font-size: 15px; font-weight: 600; color: #1e293b; margin-top: 2px; }
  .today-date {
    color: white; background: #1a365d;
    width: 32px; height: 32px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 14px;
  }
  .sched-content { padding: 16px 16px 24px; }
  .legend { position: static; border: none; padding: 12px 16px; border-top: 1px solid #e2e8f0; }
  .slot-card { padding: 12px 14px; }
  .slot-time { font-size: 13px; }
  .lesson-chip { font-size: 13px; padding: 6px 10px; }
}

@media (min-width: 1100px) {
  .sched-content { padding: 20px 24px 32px; }
}

/* ── Coming soon placeholder ── */
.coming-soon {
  text-align: center;
  color: #94a3b8;
  font-size: 15px;
  padding: 64px 24px;
  font-style: italic;
}

/* ── Lessons tab additions ── */
.slot-header-right { display: flex; align-items: center; gap: 8px; }
.slot-add-btn {
  width: 28px; height: 28px; border-radius: 50%;
  border: 1.5px solid #cbd5e1; background: white; color: #64748b;
  font-size: 20px; line-height: 1; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  font-family: inherit; transition: background 0.15s, border-color 0.15s;
}
.slot-add-btn:hover { background: #f8fafc; border-color: #1a365d; color: #1a365d; }
.lesson-drop-zone { min-height: 40px; border-radius: 8px; padding: 4px 0; transition: border 0.15s; border: 2px dashed transparent; }
.lesson-drop-zone.drop-over { border-color: #1a365d; background: rgba(26,54,93,0.03); }
.add-hint {
  font-size: 13px; color: #94a3b8; font-style: italic;
  background: none; border: none; cursor: pointer;
  padding: 4px 0; text-align: left; width: 100%; font-family: inherit;
}
.add-hint:hover { color: #64748b; }
/* FAB */
.fab {
  position: fixed; bottom: 56px; right: 20px;
  width: 52px; height: 52px; border-radius: 50%;
  background: #1a365d; color: white; border: none;
  font-size: 28px; cursor: pointer; z-index: 150;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 4px 16px rgba(26,54,93,0.35); font-family: inherit; line-height: 1;
  transition: background 0.15s, transform 0.1s;
}
.fab:hover { background: #1e3a5f; }
.fab:active { transform: scale(0.95); }
/* Toast */
.toast {
  position: fixed; bottom: 72px; left: 50%; transform: translateX(-50%);
  padding: 10px 20px; border-radius: 24px; font-size: 14px; font-weight: 600;
  z-index: 500; pointer-events: none; white-space: nowrap;
  box-shadow: 0 4px 16px rgba(0,0,0,0.2); animation: toast-in 0.2s ease;
}
@keyframes toast-in {
  from { opacity: 0; transform: translateX(-50%) translateY(8px); }
  to   { opacity: 1; transform: translateX(-50%) translateY(0); }
}
.toast-success { background: #166534; color: white; }
.toast-error   { background: #991b1b; color: white; }
/* Action sheet */
.action-sheet-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.4);
  display: flex; align-items: flex-end; justify-content: center;
  z-index: 300; padding: 0 0 8px;
}
.action-sheet-card {
  background: white; border-radius: 20px 20px 12px 12px;
  width: 100%; max-width: 480px; overflow: hidden;
  box-shadow: 0 -4px 32px rgba(0,0,0,0.15);
}
.action-sheet-header { padding: 16px 20px 12px; border-bottom: 1px solid #f1f5f9; }
.action-sheet-title { font-size: 17px; font-weight: 700; color: #0f172a; }
.action-sheet-sub { font-size: 13px; color: #64748b; margin-top: 2px; }
.action-btn {
  display: flex; align-items: center; gap: 12px;
  width: 100%; padding: 14px 20px; border: none; background: none;
  font-size: 15px; font-family: inherit; cursor: pointer; text-align: left;
  border-bottom: 1px solid #f8fafc; color: #1e293b; transition: background 0.1s;
}
.action-btn:hover { background: #f8fafc; }
.action-btn:last-child { border-bottom: none; }
.action-btn.danger { color: #dc2626; }
.action-btn.cancel-btn { color: #64748b; font-weight: 500; }
/* Modal form elements */
.modal-error {
  font-size: 13px; color: #dc2626; background: #fef2f2;
  border: 1px solid #fca5a5; padding: 8px 12px; border-radius: 8px;
}
.modal-actions { display: flex; gap: 10px; margin-top: 4px; }
.modal-actions button {
  flex: 1; padding: 11px; border-radius: 10px; font-size: 14px;
  font-weight: 600; cursor: pointer; font-family: inherit; border: none;
  transition: opacity 0.15s, background 0.15s;
}
.modal-actions button:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-cancel { background: #f1f5f9; color: #64748b; }
.btn-cancel:hover:not(:disabled) { background: #e2e8f0; }
.btn-primary { background: #1a365d; color: white; }
.btn-primary:hover:not(:disabled) { background: #1e3a5f; }
.btn-danger { background: #dc2626; color: white; }
.btn-danger:hover:not(:disabled) { background: #b91c1c; }
.modal-textarea {
  width: 100%; padding: 10px 12px; border: 1.5px solid #e2e8f0;
  border-radius: 10px; font-size: 14px; font-family: inherit;
  resize: vertical; min-height: 72px; outline: none;
}
.modal-textarea:focus { border-color: #1a365d; }
.modal-input {
  width: 100%; padding: 10px 12px; border: 1.5px solid #e2e8f0;
  border-radius: 10px; font-size: 14px; font-family: inherit; outline: none;
}
.modal-input:focus { border-color: #1a365d; }
.modal-select {
  width: 100%; padding: 10px 12px; border: 1.5px solid #e2e8f0;
  border-radius: 10px; font-size: 14px; font-family: inherit;
  outline: none; background: white;
}
.modal-select:focus { border-color: #1a365d; }
.check-row { display: flex; align-items: center; gap: 10px; font-size: 14px; color: #374151; cursor: pointer; }
.check-row input[type="checkbox"] { width: 18px; height: 18px; cursor: pointer; accent-color: #1a365d; }
.student-search-results {
  border: 1.5px solid #e2e8f0; border-top: none;
  border-radius: 0 0 10px 10px; max-height: 180px; overflow-y: auto; background: white;
}
.student-result {
  display: block; width: 100%; padding: 9px 12px; border: none;
  background: none; text-align: left; font-size: 14px; cursor: pointer;
  border-bottom: 1px solid #f1f5f9; font-family: inherit; color: #1e293b;
}
.student-result:hover { background: #f8fafc; }
.student-result:last-child { border-bottom: none; }
.student-selected {
  font-size: 13px; color: #166534; background: #f0fdf4;
  border: 1px solid #bbf7d0; padding: 6px 10px; border-radius: 6px; margin-top: 4px;
}
.form-label {
  font-size: 12px; font-weight: 700; letter-spacing: 0.06em;
  text-transform: uppercase; color: #94a3b8; display: block;
}
.form-group { display: flex; flex-direction: column; gap: 4px; }

/* ── Lesson input modal ── */
.lm-card {
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
.lm-full-link:hover { background: #f8fafc; }
`;
