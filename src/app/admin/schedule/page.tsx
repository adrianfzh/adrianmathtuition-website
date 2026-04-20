'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
}

interface EnrichedLesson extends Lesson {
  studentName: string;
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
  type: 'Additional' | 'Makeup' | 'Trial';
  date: string;
  slotId: string;
  studentId: string;
  studentSearch: string;
  trialStudentName: string;
  notes: string;
  notify: boolean;
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
  const effectiveType = (status === 'Absent' || status === 'Cancelled') ? status : type;
  return TYPE_COLORS[effectiveType] || TYPE_COLORS.Regular;
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

// ─── Module-level DnD components ──────────────────────────────────────────────

function DraggableLessonChip({ lesson, onTap }: { lesson: EnrichedLesson; onTap: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: lesson.id });
  const style = getTypeStyle(lesson.type, lesson.status);
  const isAbsent = lesson.status === 'Absent' || lesson.status === 'Cancelled';
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={onTap}
      className={`lesson-chip${isAbsent ? ' absent' : ''}`}
      style={{
        background: style.bg, color: style.text, borderColor: style.border,
        opacity: isDragging ? 0.3 : 1,
        touchAction: 'none',
        cursor: 'grab',
      }}
    >
      {lesson.type === 'Trial' && <span className="trial-badge">🆕</span>}
      <span className={isAbsent ? 'absent-name' : ''}>{lesson.studentName}</span>
      {lesson.type !== 'Regular' && !isAbsent && <span className="type-tag">{lesson.type}</span>}
      {isAbsent && <span className="type-tag absent-tag">{lesson.status}</span>}
      {lesson.type !== 'Trial' && lesson.notes && (
        <div className="text-[10px] italic text-amber-700 mt-0.5 leading-tight" title={lesson.notes}>↳ {lesson.notes}</div>
      )}
    </div>
  );
}

function DroppableLessonSlot({
  id, lessons, onChipTap, onAddClick,
}: {
  id: string;
  lessons: EnrichedLesson[];
  onChipTap: (lesson: EnrichedLesson) => void;
  onAddClick: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={`lesson-drop-zone${isOver ? ' drop-over' : ''}`}>
      <div className="lesson-list">
        {lessons.map(l => (
          <DraggableLessonChip key={l.id} lesson={l} onTap={() => onChipTap(l)} />
        ))}
        {lessons.length === 0 && (
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

  const [monday, setMonday] = useState<Date>(() => getMondayOfWeek(new Date()));
  const [data, setData] = useState<ScheduleData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeDay, setActiveDay] = useState<number>(() => {
    const d = new Date().getDay();
    return d === 0 ? 6 : d - 1; // 0=Mon…6=Sun
  });

  const [modal, setModal] = useState<{ student: StudentContact; lessonType: string } | null>(null);
  const [contactCache, setContactCache] = useState<Record<string, StudentContact>>({});
  const [contactLoading, setContactLoading] = useState(false);
  const savedPw = useRef('');

  const [viewMode, setViewMode] = useState<'lessons' | 'roster'>(() => {
    if (typeof window === 'undefined') return 'lessons';
    return (localStorage.getItem('schedule_view_mode') as 'lessons' | 'roster') || 'lessons';
  });

  useEffect(() => {
    localStorage.setItem('schedule_view_mode', viewMode);
  }, [viewMode]);

  // DnD
  const [activeDragLesson, setActiveDragLesson] = useState<EnrichedLesson | null>(null);
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
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 500, tolerance: 5 } })
  );

  const enrichedLessons = useMemo<EnrichedLesson[]>(() => {
    if (!data) return [];
    return data.lessons.map(lesson => {
      const student = lesson.studentId ? data.students[lesson.studentId] : null;
      const studentName = student?.name || (lesson.type === 'Trial' ? getTrialName(lesson.notes) : 'Unknown');
      return { ...lesson, studentName };
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
      fetchSchedule(monday, savedPw.current);
    }
  }, [authed, monday, fetchSchedule]);

  function prevWeek() { setMonday(d => addDays(d, -7)); }
  function nextWeek() { setMonday(d => addDays(d, 7)); }
  function thisWeek() { setMonday(getMondayOfWeek(new Date())); }

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
        {/* Mobile: single day */}
        <div className="mobile-day">
          <div className="day-col">
            {(slotsByDay[DAYS[activeDay]] ?? []).map(slot => renderRosterSlotCard(slot))}
            {(slotsByDay[DAYS[activeDay]] ?? []).length === 0 && <div className="no-slots">No slots</div>}
          </div>
        </div>

        {/* Desktop: full grid */}
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
    if (lesson) { setActiveDragLesson(lesson); navigator.vibrate?.(15); }
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

  async function handleConfirmAdd() {
    if (!addModal) return;
    setSubmitting(true); setModalError('');
    try {
      if (addModal.type === 'Trial' && !addModal.trialStudentName) { setModalError('Enter trial student name'); setSubmitting(false); return; }
      if (addModal.type !== 'Trial' && !addModal.studentId) { setModalError('Select a student'); setSubmitting(false); return; }
      if (!addModal.date || !addModal.slotId) { setModalError('Select a date and slot'); setSubmitting(false); return; }
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

  function openAddModal(date: Date, slot: Slot) {
    setModalError('');
    setAddModal({ type: 'Additional', date: isoDate(date), slotId: slot.id, studentId: '', studentSearch: '', trialStudentName: '', notes: '', notify: true });
  }

  function openAddModalFab() {
    setModalError('');
    const todaySlots = slotsByDay[DAYS[activeDay]] ?? [];
    setAddModal({ type: 'Additional', date: isoDate(new Date()), slotId: todaySlots[0]?.id ?? (data?.slots[0]?.id ?? ''), studentId: '', studentSearch: '', trialStudentName: '', notes: '', notify: true });
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

  // ── renderLessonsSlotCard ────────────────────────────────────────────────────
  function renderLessonsSlotCard(slot: Slot, date: Date) {
    const dropId = `${isoDate(date)}__${slot.id}`;
    const lessons = enrichedLessonMap[dropId] ?? [];
    const isToday = isoDate(date) === isoDate(new Date());
    const presentCount = lessons.filter(l => l.status !== 'Absent' && l.status !== 'Cancelled').length;
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
          lessons={lessons}
          onChipTap={(lesson) => { setModalError(''); setActionSheet({ lesson, date: isoDate(date), slotId: slot.id }); }}
          onAddClick={() => openAddModal(date, slot)}
        />
      </div>
    );
  }

  // ── Lessons view ─────────────────────────────────────────────────────────────
  function renderLessonsView() {
    const overlayStyle = activeDragLesson ? getTypeStyle(activeDragLesson.type, activeDragLesson.status) : null;
    return (
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        {/* Mobile: single day */}
        <div className="mobile-day">
          <div className="day-col">
            {(slotsByDay[DAYS[activeDay]] ?? []).map(slot => renderLessonsSlotCard(slot, weekDates[activeDay]))}
            {(slotsByDay[DAYS[activeDay]] ?? []).length === 0 && <div className="no-slots">No lessons</div>}
          </div>
        </div>
        {/* Desktop: full grid */}
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
        <DragOverlay>
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
        </div>
      </div>

      {/* View tabs */}
      <div className="view-tabs-bar">
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
      </div>

      {/* Day tabs (mobile) */}
      <div className="day-tabs">
        {DAYS.map((day, i) => {
          const date = weekDates[i];
          const isToday = isoDate(date) === isoDate(new Date());
          const slots = slotsByDay[day] || [];
          const hasActivity = data && slots.some(s =>
            (data.enrollmentsBySlot?.[s.id]?.length || 0) > 0 ||
            getLessonsForSlot(date, s.id).length > 0
          );
          return (
            <button
              key={day}
              className={`day-tab ${activeDay === i ? 'active' : ''} ${isToday ? 'today' : ''}`}
              onClick={() => setActiveDay(i)}
            >
              <span className="day-short">{DAY_SHORT[i]}</span>
              <span className="day-date">{date.getDate()}</span>
              {hasActivity && <span className="day-dot" />}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="sched-content">
        {loading && <div className="loading-msg">Loading…</div>}
        {error && (
          <div className="error-banner">
            {error}
            <button onClick={() => fetchSchedule(monday, savedPw.current)}>Retry</button>
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

      {/* FAB (lessons view only) */}
      {viewMode === 'lessons' && data && (
        <button className="fab" onClick={openAddModalFab} title="Add lesson">+</button>
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
              setRescheduleModal({ lesson: actionSheet.lesson, toDate: '', toSlotId: '', notes: '', notify: true, showPickers: true });
              setModalError(''); setActionSheet(null);
            }}>🔄 Reschedule</button>
            <button className="action-btn" onClick={() => {
              setAbsentModal({ lesson: actionSheet.lesson, notify: false, reason: '' });
              setModalError(''); setActionSheet(null);
            }}>🚫 Mark absent</button>
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
                      {data?.slots.map(s => <option key={s.id} value={s.id}>{s.dayName} {s.time} ({s.level})</option>)}
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
                  onChange={e => setAddModal(m => m ? { ...m, type: e.target.value as AddModalState['type'], studentId: '', studentSearch: '' } : null)}>
                  <option value="Additional">Additional</option>
                  <option value="Makeup">Makeup</option>
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
                        onClick={() => setAddModal(m => m ? { ...m, studentId: '', studentSearch: '' } : null)}>change</button>
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
                                onClick={() => setAddModal(m => m ? { ...m, studentId: id, studentSearch: '' } : null)}>
                                {s.name}
                              </button>
                            ))}
                        </div>
                      )}
                    </>
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
  padding: 8px 16px;
  position: sticky;
  top: 57px;
  z-index: 95;
  display: flex;
  justify-content: center;
}
.view-tabs {
  display: flex;
  background: #f1f5f9;
  border-radius: 20px;
  padding: 3px;
  gap: 2px;
  width: 100%;
  max-width: 300px;
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

/* ── Day tabs ── */
.day-tabs {
  display: flex;
  background: white;
  border-bottom: 1px solid #e2e8f0;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  position: sticky;
  top: 107px;
  z-index: 90;
}
.day-tabs::-webkit-scrollbar { display: none; }
.day-tab {
  flex: 1; min-width: 44px;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 2px; padding: 10px 4px;
  border: none; background: none;
  cursor: pointer; position: relative;
  border-bottom: 3px solid transparent;
  transition: background 0.1s;
  color: #64748b;
}
.day-tab:hover { background: #f8fafc; }
.day-tab.active { border-bottom-color: #1a365d; color: #1a365d; font-weight: 600; }
.day-tab.today .day-date { color: #1a365d; font-weight: 700; }
.day-short { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; }
.day-date { font-size: 16px; font-weight: 600; }
.day-dot {
  width: 5px; height: 5px; border-radius: 50%;
  background: #1a365d; position: absolute;
  bottom: 3px; left: 50%; transform: translateX(-50%);
}
.day-tab.active .day-dot { background: #1a365d; }

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
  margin-left: auto;
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
  .day-tabs { display: none; }
  .desktop-grid {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
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
`;
