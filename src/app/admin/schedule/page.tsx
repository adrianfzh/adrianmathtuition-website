'use client';

import React, { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo } from 'react';
import { ensureAdminSession, loginAdminSession } from '@/lib/admin-client';
import { getExamTopicsForSubject } from '@/lib/canonical-topics';
import AdminAIChat from '@/components/AdminAIChat';
import LessonModal from '@/components/LessonModal';
import { QuickLogSheet, VoiceLog } from '@/components/QuickLog';
import {
  DndContext, DragOverlay,
  useSensor, useSensors,
  PointerSensor, TouchSensor,
  closestCenter, pointerWithin,
  useDraggable, useDroppable,
} from '@dnd-kit/core';
import { snapCenterToCursor } from '@dnd-kit/modifiers';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Slot {
  id: string;
  dayNum: number;
  dayName: string;
  time: string;
  level: string;
  capacity: number;
  makeupCapacity: number | null;
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
  rescheduledToSlotTime?: string;
  rescheduledToStatus?: string;
  progressLogged?: boolean;
  revisionLabel?: string;
  revisionSubject?: string;
  revisionTime?: string;
  revisionMakeup?: boolean;
}

interface Student {
  name: string;
  level: string;
  subjects?: string[];
}

interface ExamEntry { subject: string; paper: string; date: string | null; topics: string; notes: string; approx?: boolean }

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
  cancelledLessons?: { studentId: string | null; date: string; slotId: string | null; notes: string }[];
  students: Record<string, Student>;
  activeExamType?: string | null;
  examsByStudent?: Record<string, string | null>;
  examTopicsByStudent?: Record<string, string | null>;
  examApproxByStudent?: Record<string, boolean>;
  examEntriesByStudent?: Record<string, ExamEntry[]>;
  currentTopicByStudent?: Record<string, { subject: string; topic: string }[]>;
}

interface TimelineRow { id: string; subject: string; topic: string; started: string | null; ended: string | null; current: boolean }

function fmtTLDate(iso: string | null): string {
  if (!iso) return '';
  try { return new Date(iso + 'T00:00:00').toLocaleDateString('en-SG', { day: 'numeric', month: 'short' }); } catch { return iso; }
}

// Regular-work tab: per subject, the current topic + a box to advance to the
// next topic, and the topic timeline (history) below.
function ExamWorkTab({ studentId, level, subjects, tl, onDraft, onAdvance, onDeleteRow }: {
  studentId: string;
  level: string;
  subjects: string[];
  tl: { loading: boolean; rows: TimelineRow[]; drafts: Record<string, string>; savingSubject: string | null } | null;
  onDraft: (subject: string, v: string) => void;
  onAdvance: (subject: string, topic: string) => void;
  onDeleteRow: (rowId: string) => void;
}) {
  if (!tl || tl.loading) return <div style={{ color: '#94a3b8', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>Loading topics…</div>;
  return (
    <>
      {subjects.map(subject => {
        const cats = getExamTopicsForSubject(level || 'Sec 4', subject || 'E Math');
        const listId = `tl-topics-${(subject || 'x').replace(/\s+/g, '')}`;
        const rows = tl.rows.filter(r => (r.subject || '') === subject).sort((a, b) => (b.started || '').localeCompare(a.started || ''));
        const current = rows.find(r => r.current);
        const history = rows.filter(r => !r.current);
        const draft = tl.drafts[subject] ?? '';
        const saving = tl.savingSubject === subject;
        return (
          <div key={subject || 'gen'} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 12, marginBottom: 12 }}>
            {subject && <div style={{ fontSize: 13.5, fontWeight: 700, color: '#1e293b', marginBottom: 8 }}>{subject}</div>}
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', color: '#94a3b8', textTransform: 'uppercase', marginBottom: 4 }}>Working on now</div>
            {current ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#0369a1', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, padding: '5px 10px' }}>📘 {current.topic}</span>
                <span style={{ fontSize: 11.5, color: '#94a3b8' }}>since {fmtTLDate(current.started)}</span>
              </div>
            ) : (
              <div style={{ fontSize: 13, color: '#cbd5e1', fontStyle: 'italic', marginBottom: 10 }}>No current topic</div>
            )}
            <div style={{ display: 'flex', gap: 6 }}>
              <input className="modal-input" list={listId} placeholder={current ? 'Move to next topic…' : 'Pick or type a topic…'} value={draft}
                onChange={e => onDraft(subject, e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && draft.trim()) onAdvance(subject, draft); }}
                style={{ flex: 1, minWidth: 0 }} />
              <datalist id={listId}>
                {cats.flatMap(c => c.topics).map(t => <option key={t} value={t} />)}
              </datalist>
              <button className="btn-primary" disabled={saving || !draft.trim()} onClick={() => onAdvance(subject, draft)} style={{ whiteSpace: 'nowrap' }}>
                {saving ? '…' : current ? 'Advance' : 'Set'}
              </button>
            </div>
            {history.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', color: '#94a3b8', textTransform: 'uppercase', marginBottom: 6 }}>Timeline</div>
                {history.map(r => (
                  <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: '#475569', padding: '3px 0' }}>
                    <span style={{ color: '#cbd5e1' }}>•</span>
                    <span style={{ flex: 1 }}>{r.topic}</span>
                    <span style={{ color: '#94a3b8', fontSize: 11.5 }}>{fmtTLDate(r.started)}{r.ended ? ` – ${fmtTLDate(r.ended)}` : ''}</span>
                    <button onClick={() => onDeleteRow(r.id)} title="Delete" style={{ border: 'none', background: 'none', color: '#cbd5e1', cursor: 'pointer', fontSize: 13, padding: '0 2px' }}>✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

interface EnrichedLesson extends Lesson {
  studentName: string;
  studentLevel: string;
  examDate?: string | null;
  examTopics?: string | null;
  examApprox?: boolean;
  examEntries?: ExamEntry[];
  currentTopic?: string | null;
}

// LessonModal types (ExamRecord/LessonContextData) now live in the shared
// component → src/components/LessonModal.tsx

interface RescheduleState {
  lesson: EnrichedLesson;
  toDate: string;
  toSlotId: string;
  notes: string;
  notify: boolean;
  showPickers: boolean; // true = manual pick mode (from action sheet)
  switchMode?: boolean; // true = same-day slot switch (date locked, slot picker only)
}
interface ActionSheetState {
  lesson: EnrichedLesson;
  date: string;
  slotId: string;
}
interface AddModalState {
  type: 'Makeup' | 'Rescheduled' | 'Additional' | 'Trial' | 'Revision Makeup' | 'Ad-hoc';
  date: string;
  slotId: string;
  studentId: string;
  studentSearch: string;
  trialStudentName: string;
  notes: string;
  notify: boolean;
  /** Makeup: the Absent lesson being made up. Rescheduled: the Scheduled lesson being moved. */
  linkedLessonId: string;
  /** Ad-hoc only: per-lesson charge + inline new-student fields. */
  charge?: string;
  newLevel?: string;
  newEmail?: string;
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

// Returns the student's level label when it doesn't match the slot's level
// category (e.g. a JC student rescheduled into a Sec slot), else null.
// Mixed/Adhoc slots intentionally hold multiple levels and are never flagged.
function crossLevelBadge(studentLevel: string, slotLevel: string): string | null {
  const stu = (studentLevel || '').toLowerCase();
  const sl = (slotLevel || '').toLowerCase();
  if (!stu || !sl) return null;
  if (sl === 'mixed' || sl === 'adhoc') return null;
  const studentIsJC = stu.startsWith('jc');
  const slotIsJC = sl.startsWith('jc');
  const slotIsSec = sl.startsWith('sec'); // 'secondary' or 'sec'
  if (!slotIsJC && !slotIsSec) return null; // unknown slot category — don't flag
  return studentIsJC !== slotIsJC ? studentLevel.toUpperCase() : null;
}

// True if a slot is the same JC/Sec category as the student (Mixed/Adhoc/unknown
// count as available to everyone). Used to sort the revision-makeup slot picker.
function sameLevelSlot(studentLevel: string, slotLevel: string): boolean {
  const stu = (studentLevel || '').toLowerCase();
  const sl = (slotLevel || '').toLowerCase();
  if (!sl || sl === 'mixed' || sl === 'adhoc') return true;
  const slJC = sl.startsWith('jc'), slSec = sl.startsWith('sec');
  if (!slJC && !slSec) return true;
  return stu.startsWith('jc') === slJC;
}

const TYPE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  Regular:     { bg: '#f8fafc',  text: '#1e293b', border: '#e2e8f0' },
  Rescheduled: { bg: '#eff6ff',  text: '#1d4ed8', border: '#bfdbfe' },
  Trial:       { bg: '#f0fdf4',  text: '#15803d', border: '#bbf7d0' },
  Makeup:      { bg: '#fff7ed',  text: '#c2410c', border: '#fed7aa' },
  'Revision Makeup': { bg: '#fff7ed', text: '#c2410c', border: '#fed7aa' },
  Additional:  { bg: '#faf5ff',  text: '#7c3aed', border: '#e9d5ff' },
  'Ad-hoc':    { bg: '#fdf4ff',  text: '#a21caf', border: '#f5d0fe' },
  'Revision Sprint': { bg: '#ecfeff', text: '#0e7490', border: '#a5f3fc' },
  Absent:      { bg: '#f1f5f9',  text: '#94a3b8', border: '#e2e8f0' },
  Cancelled:   { bg: '#f1f5f9',  text: '#94a3b8', border: '#e2e8f0' },
};

// Small 👤 link on each student chip → opens that student's full profile page.
// stopPropagation so tapping it doesn't fire the chip's contact-popup / drag.
function ProfileIconLink({ studentId }: { studentId: string }) {
  return (
    <a
      href={`/admin/students/${studentId}`}
      onClick={e => e.stopPropagation()}
      onPointerDown={e => e.stopPropagation()}
      title="Open full profile"
      style={{ marginLeft: 'auto', paddingLeft: 6, textDecoration: 'none', fontSize: 12, lineHeight: 1, opacity: 0.65, flexShrink: 0 }}
    >👤</a>
  );
}

function getTypeStyle(type: string, status: string) {
  // Lessons that have "happened but moved/missed" should look muted regardless of original type
  if (status === 'Absent' || status === 'Cancelled' || status === 'Rescheduled') return TYPE_COLORS.Absent;
  return TYPE_COLORS[type] || TYPE_COLORS.Regular;
}

// ─── Lesson input modal ────────────────────────────────────────────────────────

// LessonModal is now a shared component → src/components/LessonModal.tsx

// ─── Module-level DnD components ──────────────────────────────────────────────

function formatExamDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-SG', { day: 'numeric', month: 'short' });
}

function DraggableLessonChip({ lesson, onTap, onExamDateClick, onWork, onStudentClick, onMarkPresent, onMarkAbsent, onUndo, onQuickLog, activeExamType, slotLevel }: { lesson: EnrichedLesson; onTap: () => void; onExamDateClick?: (lesson: EnrichedLesson) => void; onWork?: () => void; onStudentClick?: () => void; onMarkPresent?: () => void; onMarkAbsent?: () => void; onUndo?: () => void; onQuickLog?: () => void; activeExamType?: string | null; slotLevel?: string }) {
  // Rescheduled-away chips (status=Rescheduled) are display-only — disable dragging
  const isRescheduledAway = lesson.status === 'Rescheduled';
  // Cross-level flag: e.g. a JC student rescheduled into a Sec slot
  const crossBadge = crossLevelBadge(lesson.studentLevel, slotLevel || '');
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: lesson.id, disabled: isRescheduledAway });
  const style = getTypeStyle(lesson.type, lesson.status);
  const isFaded = lesson.status === 'Absent' || lesson.status === 'Cancelled' || isRescheduledAway;
  // True on touch/coarse-pointer devices (phones, tablets).
  const isTouch = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
  // Whether attendance controls are present (caller passes undefined when not applicable)
  const hasAttendance = !!(onMarkPresent || onMarkAbsent || onUndo);

  const [showTopicDropdown, setShowTopicDropdown] = useState(false);
  const dropdownRef = useRef<HTMLSpanElement>(null);

  // Close dropdown when clicking outside the chip
  useEffect(() => {
    if (!showTopicDropdown) return;
    function onDocClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowTopicDropdown(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [showTopicDropdown]);

  function handleClick() {
    if (showTopicDropdown) { setShowTopicDropdown(false); return; }
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0, flexWrap: 'wrap', rowGap: 3 }}>
          <span
            className={isFaded ? 'absent-name' : ''}
            role={onStudentClick ? 'button' : undefined}
            onClick={onStudentClick ? e => { e.stopPropagation(); onStudentClick(); } : undefined}
            style={{
              ...(onStudentClick ? { cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2 } : {}),
              flex: '1 1 100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0,
            }}
          >{lesson.studentName}</span>
          {/* Cross-level badge — student level differs from this slot's level */}
          {crossBadge && (
            <span
              title={`${lesson.studentLevel} student in a ${slotLevel} slot`}
              style={{
                flexShrink: 0, fontSize: 9, fontWeight: 700, lineHeight: 1.4,
                padding: '1px 5px', borderRadius: 8, whiteSpace: 'nowrap',
                background: '#fef3c7', color: '#b45309', border: '1px solid #fcd34d',
              }}
            >⚠ {crossBadge}</span>
          )}
          {/* One pill → opens the tabbed dialog (Exam | Regular work). Shows the
              most relevant glanceable info; details/edit live in the popup. */}
          {!isFaded && lesson.type !== 'Trial' && (onExamDateClick || onWork) && (() => {
            const hasExam = !!lesson.examDate && lesson.examDate !== 'NO_EXAM';
            let label: string, openTab: 'exam' | 'work';
            if (hasExam) {
              label = `📅 ${lesson.examApprox ? '~' : ''}${formatExamDate(lesson.examDate!)}${lesson.examApprox ? ' (wk)' : ''}`;
              openTab = 'exam';
            } else if (lesson.currentTopic) {
              label = `📘 ${lesson.currentTopic}`;
              openTab = 'work';
            } else {
              label = '📋 log';
              openTab = 'exam';
            }
            const open = () => { if (openTab === 'work' && onWork) onWork(); else if (onExamDateClick) onExamDateClick(lesson); else onWork?.(); };
            return (
              <span
                role="button"
                title="Exam & regular-work — tap for details"
                onClick={e => { e.stopPropagation(); open(); }}
                style={{
                  flexShrink: 0, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis',
                  fontSize: 9, fontWeight: 700, lineHeight: 1.4, cursor: 'pointer',
                  padding: '1px 7px', borderRadius: 8, whiteSpace: 'nowrap',
                  background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe',
                }}
              >{label}</span>
            );
          })()}
        </div>
        {/* Line 2 (web only): type-tag + small attendance buttons on the same row */}
        {!isTouch && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 2, flexWrap: 'wrap' }}>
            {lesson.revisionMakeup && !isFaded ? (
              <span className="type-tag" style={{ background: '#ccfbf1', color: '#0f766e', borderColor: '#99f6e4' }} title="Makeup for a missed June holiday revision lesson">🏖 Revision makeup</span>
            ) : lesson.type !== 'Regular' && !isFaded && (
              <span className="type-tag">{lesson.type}</span>
            )}
            {!isRescheduledAway && lesson.status !== 'Cancelled' && hasAttendance && lesson.status === 'Scheduled' && (
              <>
                {onMarkAbsent && (
                  <button onClick={e => { e.stopPropagation(); onMarkAbsent(); }} title="Mark absent"
                    style={{ width: 20, height: 20, borderRadius: 4, border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>✗</button>
                )}
                {onMarkPresent && (
                  <button onClick={e => { e.stopPropagation(); onMarkPresent(); }} title="Mark present"
                    style={{ width: 20, height: 20, borderRadius: 4, border: '1px solid #bbf7d0', background: '#f0fdf4', color: '#16a34a', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>✓</button>
                )}
              </>
            )}
            {!isRescheduledAway && lesson.status !== 'Cancelled' && hasAttendance && (lesson.status === 'Completed' || lesson.status === 'Absent') && (
              <>
                {onUndo && (
                  <button onClick={e => { e.stopPropagation(); onUndo(); }} title="Undo"
                    style={{ fontSize: 10, fontWeight: 600, color: '#64748b', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 4, padding: '1px 5px', cursor: 'pointer', flexShrink: 0, lineHeight: 1 }}>undo</button>
                )}
                <span style={{ fontSize: 10, fontWeight: 600, flexShrink: 0, color: lesson.status === 'Completed' ? '#16a34a' : '#ef4444' }}>
                  {lesson.status}
                </span>
              </>
            )}
            {/* Quick-log 📝 pill — today/yesterday only (same gate as attendance) */}
            {!isRescheduledAway && !isFaded && onQuickLog && (
              <button onClick={e => { e.stopPropagation(); onQuickLog(); }} title="Quick log progress"
                style={{ width: 20, height: 20, borderRadius: 4, border: '1px solid #dbeafe', background: '#eff6ff', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, padding: 0 }}>📝</button>
            )}
          </div>
        )}
        {/* Mobile only: type-tag on its own line */}
        {isTouch && lesson.revisionMakeup && !isFaded ? (
          <span className="type-tag" style={{ display: 'inline-block', marginTop: 1, background: '#ccfbf1', color: '#0f766e', borderColor: '#99f6e4' }} title="Makeup for a missed June holiday revision lesson">🏖 Revision makeup</span>
        ) : isTouch && lesson.type !== 'Regular' && !isFaded && (
          <span className="type-tag" style={{ display: 'inline-block', marginTop: 1 }}>{lesson.type}</span>
        )}
        {/* Faded status sub-lines */}
        {isRescheduledAway && (
          <span style={{
            display: 'block', fontSize: 10, marginTop: 2, fontWeight: 600,
            // green if the destination lesson is already completed, blue if still upcoming
            color: lesson.rescheduledToStatus === 'Completed' ? '#16a34a' : '#2563eb',
          }}>
            {lesson.rescheduledToDate
              ? `Rescheduled → ${formatExamDate(lesson.rescheduledToDate)}${lesson.rescheduledToSlotTime ? ` ${lesson.rescheduledToSlotTime}` : ''}`
              : 'Rescheduled'}
          </span>
        )}
        {lesson.status === 'Absent' && (
          <span style={{ display: 'block', fontSize: 10, marginTop: 2, fontWeight: 600, color: '#dc2626' }}>
            no reschedule yet
          </span>
        )}
        {!isFaded && lesson.examDate === 'NO_EXAM' && (
          <span style={{ display: 'block', fontSize: 10, opacity: 0.4, fontStyle: 'italic', marginTop: 1 }}>no upcoming exam</span>
        )}
        {lesson.type !== 'Trial' && lesson.notes && !isFaded && (
          <div className="text-[10px] italic text-amber-700 mt-0.5 leading-tight" title={lesson.notes}>↳ {lesson.notes}</div>
        )}
      </div>
      {/* Attendance controls — mobile only (web uses line-2 inside content div) */}
      {isTouch && !isRescheduledAway && lesson.status !== 'Cancelled' && hasAttendance && (
        <div style={{ display: 'flex', gap: 4, flexShrink: 0, alignItems: 'center' }}>
          {/* Quick-log 📝 pill */}
          {!isFaded && onQuickLog && (
            <button onClick={e => { e.stopPropagation(); onQuickLog(); }} title="Quick log progress"
              style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #dbeafe', background: '#eff6ff', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, padding: 0 }}>📝</button>
          )}
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
  id, lessons, onChipTap, onAddClick, onExamDateClick, onWork, onStudentClick,
  onMarkPresent, onMarkAbsent, onUndo, onQuickLog,
  ghostStudents, cancelledStudents, onGhostTap, savingStudents, activeExamType, slotLevel,
}: {
  id: string;
  lessons: EnrichedLesson[];
  slotLevel?: string;
  onChipTap: (lesson: EnrichedLesson) => void;
  onAddClick: () => void;
  onExamDateClick?: (lesson: EnrichedLesson) => void;
  onWork?: (lesson: EnrichedLesson) => void;
  onStudentClick?: (lesson: EnrichedLesson) => void;
  onMarkPresent?: (lesson: EnrichedLesson) => void;
  onMarkAbsent?: (lesson: EnrichedLesson) => void;
  onUndo?: (lesson: EnrichedLesson) => void;
  onQuickLog?: (lesson: EnrichedLesson) => void;
  ghostStudents?: { id: string; name: string }[];
  cancelledStudents?: { id: string; name: string; reason: string }[];
  onGhostTap?: (studentId: string, studentName: string) => void;
  savingStudents?: Set<string>;
  activeExamType?: string | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const ghosts = ghostStudents ?? [];
  const cancelled = cancelledStudents ?? [];
  return (
    <div ref={setNodeRef} className={`lesson-drop-zone${isOver ? ' drop-over' : ''}`}>
      <div className="lesson-list">
        {lessons.map(l => (
          <DraggableLessonChip key={l.id} lesson={l} onTap={() => onChipTap(l)} onExamDateClick={onExamDateClick} onWork={onWork && l.studentId && l.type !== 'Trial' ? () => onWork(l) : undefined} onStudentClick={onStudentClick ? () => onStudentClick(l) : undefined} onMarkPresent={onMarkPresent ? () => onMarkPresent(l) : undefined} onMarkAbsent={onMarkAbsent ? () => onMarkAbsent(l) : undefined} onUndo={onUndo ? () => onUndo(l) : undefined} onQuickLog={onQuickLog && l.studentId && l.type !== 'Trial' ? () => onQuickLog(l) : undefined} activeExamType={activeExamType} slotLevel={slotLevel} />
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
        {/* Cancelled lessons (e.g. moved to Revision Sprint) — faded, NOT markable */}
        {cancelled.map(s => (
          <div
            key={s.id}
            className="lesson-chip absent"
            style={{ background: '#f8fafc', borderColor: '#e2e8f0', display: 'flex', alignItems: 'center', gap: 6 }}
            title={`Regular lesson cancelled (${s.reason}) — not attending this slot`}
          >
            <div style={{ flex: 1, minWidth: 0, textDecoration: 'line-through', color: '#94a3b8' }}>{s.name}</div>
            <span style={{ fontSize: 10, fontWeight: 600, color: '#64748b', flexShrink: 0 }}>Cancelled · {s.reason}</span>
          </div>
        ))}
        {lessons.length === 0 && ghosts.length === 0 && cancelled.length === 0 && (
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
  // Track actual viewport width so desktop grid is only mounted on desktop.
  // This prevents display:none desktop droppables from polluting dnd-kit
  // collision detection on mobile.
  const [isMobileView, setIsMobileView] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    setIsMobileView(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobileView(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

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

  const [modal, setModal] = useState<{ student: StudentContact; lessonType: string; studentId: string } | null>(null);
  const [lessonModal, setLessonModal] = useState<EnrichedLesson | null>(null);
  // Fast in-class tap-log bottom sheet (📝 pill on today/yesterday chips)
  const [quickLog, setQuickLog] = useState<EnrichedLesson | null>(null);
  const [contactCache, setContactCache] = useState<Record<string, StudentContact>>({});
  const [contactLoading, setContactLoading] = useState(false);
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
  const [showAllRescheduleSlots, setShowAllRescheduleSlots] = useState(false);
  const [actionSheet, setActionSheet] = useState<ActionSheetState | null>(null);
  // Topics of the original missed revision session, shown when a 🏖 Revision makeup
  // chip's action sheet is open. Fetched on demand from the attendance route (which
  // derives topics incl. the published-schedule default). null = none/loading.
  const [revMakeupInfo, setRevMakeupInfo] = useState<{ subjectLabel: string; date: string; topics: string[] } | null | 'loading'>(null);
  const [addModal, setAddModal] = useState<AddModalState | null>(null);
  // Ad-hoc lesson support: all students (for reselecting unenrolled ones) + inline create.
  const [allStudents, setAllStudents] = useState<{ id: string; name: string; level: string }[]>([]);
  const [creatingStudent, setCreatingStudent] = useState(false);
  async function loadAllStudents() {
    if (allStudents.length) return;
    try {
      const r = await fetch('/api/admin/progress/students');
      const d = await r.json();
      setAllStudents((d.students || []).map((s: { id: string; name: string; level: string }) => ({ id: s.id, name: s.name, level: s.level })));
    } catch { /* non-fatal */ }
  }
  async function prefillCharge(level: string) {
    try {
      const r = await fetch(`/api/admin/rate?level=${encodeURIComponent(level)}`);
      const d = await r.json();
      if (d.rate != null) setAddModal(m => m ? { ...m, charge: String(d.rate) } : null);
    } catch { /* keep manual */ }
  }
  async function createAdhocStudent(name: string) {
    const level = addModal?.newLevel || '';
    if (!name.trim() || !level || creatingStudent) { if (!level) setModalError('Pick a level for the new student'); return; }
    setCreatingStudent(true); setModalError('');
    try {
      const r = await fetch('/api/admin/students/create', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), level, email: addModal?.newEmail || undefined }),
      });
      const d = await r.json();
      if (!r.ok) { setModalError(d.error || 'Could not create student'); return; }
      setAllStudents(prev => [{ id: d.id, name: d.name, level }, ...prev]);
      setAddModal(m => m ? { ...m, studentId: d.id, studentSearch: '' } : null);
      prefillCharge(level);
    } catch { setModalError('Could not create student'); }
    finally { setCreatingStudent(false); }
  }
  const [addSlotModal, setAddSlotModal] = useState<{ slot: Slot; studentId: string; studentSearch: string; startDate: string } | null>(null);
  const [addSlotSubmitting, setAddSlotSubmitting] = useState(false);
  const [absentModal, setAbsentModal] = useState<AbsentDeleteState | null>(null);
  // Reschedule a June-holiday Revision Sprint lesson to a regular slot (makeup).
  const [revReschedule, setRevReschedule] = useState<{ lesson: EnrichedLesson; date: string; slotId: string; saving: boolean } | null>(null);
  // Convert a trial student → enrolment: collect details, generate a signup link.
  const [trialEnrol, setTrialEnrol] = useState<{ lesson: EnrichedLesson; trialName: string; studentName: string; level: string; subjects: string[]; subjectLevel: string; slotId: string; startDate: string; url: string; generating: boolean } | null>(null);
  const [deleteModal, setDeleteModal] = useState<AbsentDeleteState | null>(null);
  const [editNotesModal, setEditNotesModal] = useState<{ lesson: EnrichedLesson; notes: string } | null>(null);
  const [examDetailModal, setExamDetailModal] = useState<{ studentId: string; studentName: string; exams: any[] | null } | null>(null);
  const [examDetailLoading, setExamDetailLoading] = useState(false);
  // Per-chip exam quick-add/edit for the active exam season. Each subject the
  // student takes gets a row; S4 EM/AM and JC2 prelims default to a Paper 1/2
  // split, others to a single paper (with an option to split).
  type ExamSubjectRow = { subject: string; mode: 'single' | 'split'; date: string; p1Date: string; p2Date: string; topics: string; notes: string; approx: boolean; approxP1: boolean; approxP2: boolean };
  const [examEdit, setExamEdit] = useState<{ studentId: string; studentName: string; studentLevel: string; studentSubjects: string[]; examType: string; noExam: boolean; rows: ExamSubjectRow[]; saving: boolean; tab: 'exam' | 'work' } | null>(null);
  // Regular-work topic timeline for the open student (Work tab).
  const [topicTL, setTopicTL] = useState<{ loading: boolean; rows: TimelineRow[]; drafts: Record<string, string>; savingSubject: string | null } | null>(null);
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
  // Revision Makeup flow — the student's June Revision Sprint sessions (date · subject · topics)
  const [revSessions, setRevSessions] = useState<{ lessonId: string; date: string; subjectLabel: string; time: string; topics: string[]; status: string; outcome: string; hasMakeup: boolean }[]>([]);
  const [revSessionsLoading, setRevSessionsLoading] = useState(false);
  const [revSessionsError, setRevSessionsError] = useState('');
  const [savingAttendance, setSavingAttendance] = useState<Set<string>>(new Set());

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 500, tolerance: 8 } })
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
      const studentName = student?.name || (lesson.type === 'Trial' ? getTrialName(lesson.notes) : lesson.type === 'Rescheduled' ? '(no student)' : 'Unknown');
      const studentLevel = student?.level || '';
      const examDate = lesson.studentId ? (data.examsByStudent?.[lesson.studentId] ?? null) : null;
      const examTopics = lesson.studentId ? (data.examTopicsByStudent?.[lesson.studentId] ?? null) : null;
      const examApprox = lesson.studentId ? (data.examApproxByStudent?.[lesson.studentId] ?? false) : false;
      const currentTopic = lesson.studentId
        ? ((data.currentTopicByStudent?.[lesson.studentId] || []).map(t => t.topic).filter(Boolean).join(' · ') || null)
        : null;
      const examEntries = lesson.studentId ? (data.examEntriesByStudent?.[lesson.studentId] ?? []) : [];
      return { ...lesson, studentName, studentLevel, examDate, examTopics, examApprox, examEntries, currentTopic };
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

  // Check session on mount (upgrades a legacy plaintext cookie if present)
  useEffect(() => {
    setAuthLoading(true);
    ensureAdminSession()
      .then(ok => { if (ok) setAuthed(true); })
      .finally(() => setAuthLoading(false));
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);
    try {
      const ok = await loginAdminSession(password);
      if (ok) setAuthed(true);
      else setAuthError('Incorrect password');
    } catch {
      setAuthError('Connection error');
    } finally {
      setAuthLoading(false);
    }
  }

  const fetchSchedule = useCallback(async (mon: Date) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/admin-schedule?week=${isoDate(mon)}`);
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
    if (authed) {
      // Clear any manual exam season override so auto-detection takes over
      fetch('/api/admin/exam-season', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }).catch(() => {}); // non-fatal
      fetchSchedule(new Date(mondayISO + 'T00:00:00'));
    }
  }, [authed, mondayISO, fetchSchedule]);

  // When a Revision makeup chip's action sheet opens, fetch the original missed
  // session's topics (matched by makeup.lessonId === this chip's lesson id).
  useEffect(() => {
    const lesson = actionSheet?.lesson;
    if (!lesson?.revisionMakeup || !lesson.studentId) { setRevMakeupInfo(null); return; }
    let cancelled = false;
    setRevMakeupInfo('loading');
    fetch(`/api/admin-revision-attendance?studentId=${lesson.studentId}`)
      .then(r => r.json())
      .then(d => {
        if (cancelled) return;
        const sessions = d.students?.[0]?.sessions || [];
        const match = sessions.find((s: any) => s.makeup?.lessonId === lesson.id);
        setRevMakeupInfo(match ? { subjectLabel: match.subjectLabel || 'Revision', date: match.date || '', topics: match.topics || [] } : null);
      })
      .catch(() => { if (!cancelled) setRevMakeupInfo(null); });
    return () => { cancelled = true; };
  }, [actionSheet]);

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

  // All slots by id — used to recover a stray lesson's intended time/level when
  // its linked slot belongs to a different weekday than the lesson's date.
  const slotById: Record<string, Slot> = {};
  if (data) for (const s of data.slots) slotById[s.id] = s;

  // ── Render day column ────────────────────────────────────────────────────────
  function renderDaySlots(dayIndex: number) {
    const day = DAYS[dayIndex];
    const date = weekDates[dayIndex];
    const dateStr = isoDate(date);
    const slots = slotsByDay[day] || [];
    const isToday = dateStr === isoDate(new Date());

    // ── Stray lessons: dated THIS day but linked to a slot that isn't drawn on
    // this day (its slot belongs to another weekday, or is inactive). Without
    // this, such a lesson lands in no date×slot cell and silently vanishes
    // (e.g. a Friday-dated lesson linked to a Monday slot). Re-place each into
    // this day's slot with the same time+level; if none matches, list it as
    // "unplaced" so it's never lost.
    const drawnSlotIds = new Set(slots.map(s => s.id));
    const straysBySlot: Record<string, Lesson[]> = {};
    const unplacedStrays: Lesson[] = [];
    for (const l of (data?.lessons || [])) {
      if (l.date !== dateStr || !l.slotId || drawnSlotIds.has(l.slotId)) continue;
      if (l.status === 'Cancelled') continue;
      const orig = slotById[l.slotId];
      const match = orig ? slots.find(s => s.time === orig.time && s.level === orig.level) : null;
      if (match) (straysBySlot[match.id] ||= []).push(l);
      else unplacedStrays.push(l);
    }

    if (slots.length === 0 && unplacedStrays.length === 0) {
      return <div className="no-slots">No lessons</div>;
    }

    const slotCards = slots.map(slot => {
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
      // Re-placed stray lessons for this slot (date/slot-day mismatch — see above)
      const slotStrays = straysBySlot[slot.id] || [];
      const present = (enrolledIds.length - absentIds.size) +
        extraLessons.filter(l => l.status !== 'Absent' && l.status !== 'Cancelled').length +
        slotStrays.filter(l => l.status !== 'Absent' && l.status !== 'Cancelled').length;
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
                  <ProfileIconLink studentId={studentId} />
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
                  {lesson.studentId && <ProfileIconLink studentId={lesson.studentId} />}
                </div>
              );
            })}
            {/* Re-placed stray lessons (date/slot-day mismatch) — flagged with ⚠ */}
            {slotStrays.map(lesson => {
              const isAbsent = lesson.status === 'Absent' || lesson.status === 'Cancelled';
              const style = getTypeStyle(lesson.type, lesson.status);
              const isTrial = lesson.type === 'Trial';
              const student = lesson.studentId ? data?.students[lesson.studentId] : null;
              const displayName = student?.name || (isTrial ? getTrialName(lesson.notes) : 'Unknown');
              const origSlot = lesson.slotId ? slotById[lesson.slotId] : null;
              return (
                <div
                  key={lesson.id}
                  className={`lesson-chip ${isAbsent ? 'absent' : ''}`}
                  style={{ background: style.bg, color: style.text, borderColor: style.border }}
                  onClick={lesson.studentId ? () => openStudentModal(lesson.studentId!, lesson.type) : undefined}
                  role={lesson.studentId ? 'button' : undefined}
                  title={`⚠ This lesson is dated ${dateStr} but linked to a ${origSlot ? origSlot.dayName + ' ' + origSlot.time : 'different'} slot. Showing it here by matching time — fix the slot link to clear the warning.`}
                >
                  <span style={{ marginRight: 4 }}>⚠</span>
                  {isTrial && <span className="trial-badge">🆕</span>}
                  <span className={isAbsent ? 'absent-name' : ''}>{displayName}</span>
                  {lesson.type !== 'Regular' && !isAbsent && <span className="type-tag">{lesson.type}</span>}
                  {isAbsent && <span className="type-tag absent-tag">{lesson.status}</span>}
                  {lesson.studentId && <ProfileIconLink studentId={lesson.studentId} />}
                </div>
              );
            })}
            {enrolledIds.length === 0 && extraLessons.length === 0 && slotStrays.length === 0 && (
              <span className="enrolled-hint">No students enrolled</span>
            )}
          </div>
        </div>
      );
    });

    // Fallback: strays with no matching slot on this day — never silently drop them
    if (unplacedStrays.length === 0) return slotCards;
    return [
      ...slotCards,
      <div key="unplaced" className="slot-card" style={{ borderColor: '#fca5a5' }}>
        <div className="slot-header">
          <div className="slot-meta"><span className="slot-time">⚠ Unplaced lessons</span></div>
        </div>
        <div className="lesson-list">
          {unplacedStrays.map(lesson => {
            const student = lesson.studentId ? data?.students[lesson.studentId] : null;
            const displayName = student?.name || getTrialName(lesson.notes) || 'Unknown';
            const origSlot = lesson.slotId ? slotById[lesson.slotId] : null;
            return (
              <div key={lesson.id} className="lesson-chip"
                onClick={lesson.studentId ? () => openStudentModal(lesson.studentId!, lesson.type) : undefined}
                role={lesson.studentId ? 'button' : undefined}
                title={`Dated ${dateStr}, linked to ${origSlot ? origSlot.dayName + ' ' + origSlot.time : 'an unknown'} slot — no matching slot on this day. Fix the slot link.`}>
                <span style={{ marginRight: 4 }}>⚠</span>
                <span>{displayName}</span>
                {origSlot && <span className="type-tag">{origSlot.time}</span>}
              </div>
            );
          })}
        </div>
      </div>,
    ];
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
          <div className="slot-header-right">
            <span className="capacity">{enrolledIds.length}/{slot.capacity}</span>
            <button
              className="slot-add-btn"
              title="Add a weekly student to this slot"
              onClick={() => setAddSlotModal({ slot, studentId: '', studentSearch: '', startDate: isoDate(new Date()) })}
            >+</button>
          </div>
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
                <span>{student?.name || studentId}</span>
                <ProfileIconLink studentId={studentId} />
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

  // Add a recurring weekly slot for a student: creates an Active enrollment +
  // generates 9 weeks of Regular lessons (server-side).
  async function submitAddWeeklySlot() {
    if (!addSlotModal) return;
    if (!addSlotModal.studentId) { showToast('error', 'Select a student'); return; }
    if (!addSlotModal.startDate) { showToast('error', 'Pick a start date'); return; }
    setAddSlotSubmitting(true);
    try {
      const res = await fetch('/api/admin-schedule/add-weekly-slot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: addSlotModal.studentId,
          slotId: addSlotModal.slot.id,
          startDate: addSlotModal.startDate,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to add weekly slot');
      setAddSlotModal(null);
      showToast('success', `✓ Added — ${json.lessonsCreated} lesson${json.lessonsCreated !== 1 ? 's' : ''} generated`);
      await fetchSchedule(monday);
    } catch (err: any) {
      showToast('error', err.message || 'Failed');
    } finally {
      setAddSlotSubmitting(false);
    }
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
    setRescheduleModal({ lesson, toDate, toSlotId, notes: '', notify: false, showPickers: false });
    setShowAllRescheduleSlots(false);
  }

  async function handleConfirmReschedule() {
    if (!rescheduleModal) return;
    const { lesson, toDate, toSlotId, notes, notify } = rescheduleModal;
    if (!toSlotId) { setModalError('Select a slot'); return; }
    if (!toDate) { setModalError(rescheduleModal.switchMode ? 'Select a start date' : 'Select a date'); return; }
    setSubmitting(true); setModalError('');
    try {
      if (rescheduleModal.switchMode) {
        const selectedSlot = sortedSlots.find(s => s.id === toSlotId);
        const slotLabel = selectedSlot ? `${selectedSlot.dayName} ${selectedSlot.time}` : 'new slot';
        const confirmed = window.confirm(
          `Switch ${lesson.studentName} to ${slotLabel} from ${toDate}?\n\n` +
          `This will:\n` +
          `• Cancel all future lessons on the current slot (from ${toDate})\n` +
          `• Create new lessons on ${slotLabel} for the next 28 days\n` +
          `• Update their enrollment permanently\n\n` +
          `This cannot be undone easily.`
        );
        if (!confirmed) { setSubmitting(false); return; }
        // Permanent slot switch: cancel future lessons, create new ones, update enrollment
        const res = await fetch('/api/admin-schedule/switch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lessonId: lesson.id, newSlotId: toSlotId, switchDate: toDate }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Switch failed');
        setRescheduleModal(null);
        await fetchSchedule(monday);
        showToast('success', `✓ Switched to ${json.newSlotName} from ${json.switchDate} — ${json.cancelled} cancelled, ${json.created} created${json.adjustment ? ` · ${json.adjustment > 0 ? '+' : ''}$${json.adjustment} ${json.adjustmentMonth} adjustment` : ''}`);
      } else {
        const res = await fetch('/api/admin-schedule/reschedule', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lessonId: lesson.id, newDate: toDate, newSlotId: toSlotId, notes: notes || undefined, notify }),
        });
        const json = await res.json();
        if (res.status === 409) { setModalError(`Slot full — max ${json.capacity} (${json.currentCount} booked)`); return; }
        if (!res.ok) throw new Error(json.error || 'Failed');
        setRescheduleModal(null);
        await fetchSchedule(monday);
        const sent = json.notificationsSent?.student || json.notificationsSent?.parent;
        showToast('success', notify ? (sent ? '✓ Rescheduled — notifications sent' : '✓ Rescheduled (notifications partial)') : '✓ Rescheduled');
      }
    } catch (err: any) { setModalError(err.message || 'Failed'); }
    finally { setSubmitting(false); }
  }

  async function handleConfirmAbsent() {
    if (!absentModal) return;
    setSubmitting(true); setModalError('');
    try {
      const res = await fetch('/api/admin-schedule/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lessonId: absentModal.lesson.id, action: 'absent', notify: absentModal.notify, reason: absentModal.reason || undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed');
      setAbsentModal(null);
      await fetchSchedule(monday);
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lessonId: deleteModal.lesson.id, action: 'delete', notify: deleteModal.notify, reason: deleteModal.reason || undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed');
      setDeleteModal(null);
      await fetchSchedule(monday);
      showToast('success', '✓ Lesson deleted');
    } catch (err: any) { setModalError(err.message || 'Failed'); }
    finally { setSubmitting(false); }
  }

  async function fetchAbsentLessons(studentId: string) {
    setAbsentLessons([]);
    setAbsentLessonsError('');
    setAbsentLessonsLoading(true);
    try {
      const res = await fetch(`/api/admin-schedule/absent-lessons?studentId=${studentId}`);
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
      const res = await fetch(`/api/admin-schedule/upcoming-lessons?studentId=${studentId}`);
      if (!res.ok) { setUpcomingLessonsError(`Error ${res.status} loading lessons`); return; }
      const json = await res.json();
      setUpcomingLessons(json.lessons ?? []);
    } catch {
      setUpcomingLessonsError('Network error loading lessons');
    } finally {
      setUpcomingLessonsLoading(false);
    }
  }

  async function fetchRevSessions(studentId: string) {
    setRevSessions([]);
    setRevSessionsError('');
    setRevSessionsLoading(true);
    try {
      const res = await fetch(`/api/admin-revision-attendance?studentId=${studentId}`);
      if (!res.ok) { setRevSessionsError(`Error ${res.status} loading revision lessons`); return; }
      const json = await res.json();
      const stu = (json.students ?? [])[0];
      const sessions = (stu?.sessions ?? []).map((s: any) => ({
        lessonId: s.lessonId, date: s.date, subjectLabel: s.subjectLabel, time: s.time,
        topics: s.topics ?? [], status: s.status, outcome: s.outcome, hasMakeup: !!s.makeup,
      }));
      // Only offer lessons that aren't already made up (no linked makeup yet).
      const open = sessions.filter((s: any) => !s.hasMakeup);
      setRevSessions(open);
      if (!sessions.length) setRevSessionsError('No June Revision Sprint sessions found for this student');
    } catch {
      setRevSessionsError('Network error loading revision lessons');
    } finally {
      setRevSessionsLoading(false);
    }
  }

  async function handleConfirmAdd() {
    if (!addModal) return;
    setSubmitting(true); setModalError('');
    try {
      if (addModal.type === 'Trial' && !addModal.trialStudentName) { setModalError('Enter trial student name'); setSubmitting(false); return; }
      if (addModal.type !== 'Trial' && !addModal.studentId) { setModalError('Select a student'); setSubmitting(false); return; }
      if (!addModal.date || !addModal.slotId) { setModalError('Select a date and slot'); setSubmitting(false); return; }
      if (addModal.type === 'Ad-hoc' && !(Number(addModal.charge) > 0)) { setModalError('Enter a charge for the session'); setSubmitting(false); return; }

      // Makeup + Rescheduled → reschedule route (links new lesson to original)
      if (addModal.type === 'Makeup' || addModal.type === 'Rescheduled') {
        if (!addModal.linkedLessonId) {
          setModalError(addModal.type === 'Makeup' ? 'Select which missed lesson to make up' : 'Select which lesson to reschedule');
          setSubmitting(false); return;
        }
        const defaultNote = addModal.type === 'Makeup' ? 'Makeup lesson' : 'Rescheduled by admin';
        const res = await fetch('/api/admin-schedule/reschedule', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lessonId: addModal.linkedLessonId, newDate: addModal.date, newSlotId: addModal.slotId, notes: addModal.notes || defaultNote }),
        });
        const json = await res.json();
        if (res.status === 409) { setModalError(`Slot full — max ${json.capacity} (${json.currentCount} booked)`); return; }
        if (!res.ok) throw new Error(json.error || 'Failed');
        setAddModal(null);
        await fetchSchedule(monday);
        showToast('success', addModal.type === 'Makeup' ? '✓ Makeup lesson scheduled' : '✓ Lesson rescheduled');
        return;
      }

      // Revision Makeup linked to a specific Revision Sprint session → reuse the
      // tested attendance makeup action (creates the Revision Makeup lesson, marks
      // the original Rescheduled, and links them). Unlinked → standalone via /add.
      if (addModal.type === 'Revision Makeup' && addModal.linkedLessonId) {
        const res = await fetch('/api/admin-revision-attendance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'makeup', lessonId: addModal.linkedLessonId, studentId: addModal.studentId, date: addModal.date, slotId: addModal.slotId }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed');
        setAddModal(null);
        await fetchSchedule(monday);
        showToast('success', '✓ Revision makeup scheduled');
        return;
      }

      // Additional / Trial / standalone Revision Makeup → add route
      const body: Record<string, any> = { type: addModal.type, date: addModal.date, slotId: addModal.slotId, notes: addModal.notes || undefined };
      if (addModal.type === 'Trial') { body.trialStudentName = addModal.trialStudentName; }
      else { body.studentId = addModal.studentId; body.notify = addModal.notify; }
      if (addModal.type === 'Ad-hoc') body.chargeOverride = Number(addModal.charge);
      const res = await fetch('/api/admin-schedule/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (res.status === 409) { setModalError(`Slot full — max ${json.capacity} (${json.currentCount} booked)`); return; }
      if (!res.ok) throw new Error(json.error || 'Failed');
      setAddModal(null);
      await fetchSchedule(monday);
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: { Notes: editNotesModal.notes } }),
      });
      if (!res.ok) throw new Error('Failed to save');
      setEditNotesModal(null);
      await fetchSchedule(monday);
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
      await fetchSchedule(new Date(mondayISO + 'T00:00:00'));
    }
  }

  function openAddModal(date: Date, slot: Slot) {
    setModalError('');
    setAddModal({ type: 'Makeup', date: isoDate(date), slotId: slot.id, studentId: '', studentSearch: '', trialStudentName: '', notes: '', notify: false, linkedLessonId: '' });
  }

  function openAddModalFab() {
    setModalError('');
    const todaySlots = slotsByDay[dayNameOf(activeDate)] ?? [];
    setAddModal({ type: 'Makeup', date: isoDate(activeDate), slotId: todaySlots[0]?.id ?? (data?.slots[0]?.id ?? ''), studentId: '', studentSearch: '', trialStudentName: '', notes: '', notify: false, linkedLessonId: '' });
  }

  async function openStudentModal(studentId: string, lessonType: string) {
    const cached = contactCache[studentId];
    if (cached) {
      setModal({ student: cached, lessonType, studentId });
      return;
    }
    const name = data?.students[studentId]?.name || '';
    setModal({ student: { name, parentName: '', parentEmail: '' }, lessonType, studentId });
    setContactLoading(true);
    try {
      const res = await fetch(`/api/admin-schedule/student-contact?id=${studentId}`);
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

  // Voice log applied to several lessons at once — flip all their dots locally.
  function handleProgressLoggedBatch(lessonIds: string[]) {
    const ids = new Set(lessonIds);
    setData(d => d ? {
      ...d,
      lessons: d.lessons.map(l => ids.has(l.id) ? { ...l, progressLogged: true } : l),
    } : d);
  }

  // Roster for the voice-log parser: the viewed day's lessons with a linked
  // student (skips Trial/no-student chips and cancelled/moved-away lessons).
  function getVoiceRoster(): { lessonId: string; studentName: string; slotTime?: string }[] {
    const dateStr = isoDate(activeDate);
    return enrichedLessons
      .filter(l =>
        l.date === dateStr && l.studentId && l.type !== 'Trial' &&
        l.status !== 'Cancelled' && l.status !== 'Rescheduled'
      )
      .map(l => ({
        lessonId: l.id,
        studentName: l.studentName,
        slotTime: data?.slots.find(s => s.id === l.slotId)?.time,
      }));
  }

  // ── Attendance marking ───────────────────────────────────────────────────────
  async function handleAttendance(studentId: string, slotId: string, date: string, status: 'Completed' | 'Absent') {
    setSavingAttendance(prev => new Set([...prev, studentId]));
    try {
      const res = await fetch('/api/admin-schedule/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
        headers: { 'Content-Type': 'application/json' },
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

  // Reschedule a Revision Sprint lesson → create a makeup at a regular slot and
  // mark the original Absent (same action as the Attendance tab's "Log makeup").
  async function submitRevReschedule() {
    if (!revReschedule || !revReschedule.date || !revReschedule.slotId) return;
    const { lesson, date, slotId } = revReschedule;
    if (!lesson.studentId) { showToast('error', 'No student on this lesson'); return; }
    setRevReschedule({ ...revReschedule, saving: true });
    try {
      const res = await fetch('/api/admin-revision-attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'makeup', lessonId: lesson.id, studentId: lesson.studentId, date, slotId }),
      });
      if (!res.ok) throw new Error(await res.text());
      setRevReschedule(null);
      await fetchSchedule(new Date(mondayISO + 'T00:00:00'));
      showToast('success', 'Revision lesson rescheduled');
    } catch (e: unknown) {
      setRevReschedule(r => r && { ...r, saving: false });
      showToast('error', e instanceof Error ? e.message.slice(0, 80) : 'Failed to reschedule');
    }
  }

  // Undo a regular reschedule: delete the moved (Rescheduled) lesson — the delete
  // endpoint restores the source lesson to Scheduled/Absent and clears the link.
  async function handleUndoReschedule(lesson: EnrichedLesson) {
    setActionSheet(null);
    if (!confirm('Undo this reschedule? The moved lesson is removed and the original is restored to its slot.')) return;
    try {
      const res = await fetch('/api/admin-schedule/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lessonId: lesson.id, action: 'delete', notify: false }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
      await fetchSchedule(new Date(mondayISO + 'T00:00:00'));
      showToast('success', '✓ Reschedule undone');
    } catch (e: unknown) {
      showToast('error', e instanceof Error ? e.message.slice(0, 80) : 'Failed to undo');
    }
  }

  // Undo a Revision Sprint makeup: delete the makeup chip + revert the linked
  // revision lesson (to Scheduled). Driven by the makeup lesson's id.
  async function handleUndoRevisionMakeup(lesson: EnrichedLesson) {
    setActionSheet(null);
    if (!confirm('Undo this revision reschedule? The makeup is removed and the holiday lesson goes back to its original date.')) return;
    try {
      const res = await fetch('/api/admin-revision-attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'unmakeup', makeupId: lesson.id }),
      });
      if (!res.ok) throw new Error(await res.text());
      await fetchSchedule(new Date(mondayISO + 'T00:00:00'));
      showToast('success', '✓ Revision reschedule undone');
    } catch (e: unknown) {
      showToast('error', e instanceof Error ? e.message.slice(0, 80) : 'Failed to undo');
    }
  }

  // Generate the signup link to convert a trial student into an enrolled one.
  async function generateTrialLink() {
    if (!trialEnrol) return;
    if (!trialEnrol.level || trialEnrol.subjects.length === 0 || !trialEnrol.slotId) {
      showToast('error', 'Pick level, subject(s) and slot first'); return;
    }
    setTrialEnrol({ ...trialEnrol, generating: true });
    try {
      const res = await fetch('/api/admin-schedule/trial-signup-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trialLessonId: trialEnrol.lesson.id,
          studentName: trialEnrol.studentName?.trim() || undefined,
          level: trialEnrol.level,
          subjects: trialEnrol.subjects,
          subjectLevel: trialEnrol.subjectLevel || undefined,
          slotId: trialEnrol.slotId,
          startDate: trialEnrol.startDate || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed');
      setTrialEnrol(t => t && { ...t, url: json.url, generating: false });
    } catch (e: unknown) {
      setTrialEnrol(t => t && { ...t, generating: false });
      showToast('error', e instanceof Error ? e.message.slice(0, 80) : 'Failed');
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
      const res = await fetch(`/api/admin/progress/students/${lesson.studentId}/exams`);
      if (!res.ok) throw new Error();
      const json = await res.json();
      setExamDetailModal(prev => prev ? { ...prev, exams: json.exams ?? [] } : null);
    } catch {
      setExamDetailModal(prev => prev ? { ...prev, exams: [] } : null);
    } finally {
      setExamDetailLoading(false);
    }
  }

  // ── Exam quick-add/edit (per chip, active season) ────────────────────────────
  // Prelims split into Paper 1 / Paper 2 for S4 EM/AM and JC2; everything else
  // is a single paper by default.
  function prelimSplitDefault(level: string, subject: string): boolean {
    const lv = (level || '').toLowerCase();
    const s = (subject || '').toLowerCase();
    if (lv.includes('sec 4') && (s.includes('e math') || s.includes('a math'))) return true;
    if (lv === 'jc2' && s.includes('h2')) return true;
    return false;
  }
  // Sec 4 / JC2 in the WA3 window sit their Prelims, not "WA3".
  function levelExamType(level: string): string {
    const active = data?.activeExamType || 'WA3';
    const lv = (level || '').toLowerCase();
    if (active === 'WA3' && (lv.includes('sec 4') || lv === 'jc2')) return 'Prelim';
    return active;
  }
  function openExamEdit(lesson: EnrichedLesson) {
    if (!lesson.studentId) return;
    const sid = lesson.studentId;
    const level = lesson.studentLevel || '';
    // If the student already has records under an exam type, honour it; else default by level.
    const existingType = (data?.examEntriesByStudent?.[sid] || []).length ? null : null; // entries don't carry type; keep default
    const examType = existingType || levelExamType(level);
    const entries = data?.examEntriesByStudent?.[sid] || [];
    // Subjects the student takes (fall back to whatever exam records already exist).
    let subjects = (data?.students?.[sid]?.subjects || []).filter(Boolean);
    if (!subjects.length) subjects = [...new Set(entries.map(e => e.subject).filter(Boolean))];
    if (!subjects.length) subjects = ['']; // generic single row

    const rows: ExamSubjectRow[] = subjects.map(subject => {
      const subjEntries = entries.filter(e => (e.subject || '') === subject);
      const single = subjEntries.find(e => !e.paper);
      const p1 = subjEntries.find(e => e.paper === 'Paper 1');
      const p2 = subjEntries.find(e => e.paper === 'Paper 2');
      const hasSplit = !!(p1 || p2);
      const mode: 'single' | 'split' = hasSplit ? 'split' : (subjEntries.length ? 'single' : (prelimSplitDefault(level, subject) ? 'split' : 'single'));
      return {
        subject,
        mode,
        date: single?.date || '',
        p1Date: p1?.date || '',
        p2Date: p2?.date || '',
        topics: (subjEntries.find(e => e.topics)?.topics) || '',
        notes: (subjEntries.find(e => e.notes)?.notes) || '',
        approx: !!single?.approx,
        approxP1: !!p1?.approx,
        approxP2: !!p2?.approx,
      };
    });
    setExamEdit({ studentId: sid, studentName: lesson.studentName, studentLevel: level, studentSubjects: subjects.filter(Boolean), examType, noExam: lesson.examDate === 'NO_EXAM', rows, saving: false, tab: 'exam' });
    loadTimeline(sid);
  }
  // Open the student panel straight on the Regular-work (topic) tab.
  function openWork(lesson: EnrichedLesson) {
    openExamEdit(lesson);
    setExamEdit(prev => prev ? { ...prev, tab: 'work' } : prev);
  }
  async function loadTimeline(studentId: string) {
    setTopicTL({ loading: true, rows: [], drafts: {}, savingSubject: null });
    try {
      const res = await fetch(`/api/admin-schedule/topic-timeline?studentId=${studentId}`);
      const d = await res.json();
      setTopicTL({ loading: false, rows: d.rows || [], drafts: {}, savingSubject: null });
    } catch { setTopicTL({ loading: false, rows: [], drafts: {}, savingSubject: null }); }
  }
  async function advanceTopic(studentId: string, subject: string, topic: string) {
    if (!topic.trim()) return;
    setTopicTL(prev => prev ? { ...prev, savingSubject: subject } : prev);
    try {
      const res = await fetch('/api/admin-schedule/topic-timeline', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId, subject, topic: topic.trim() }),
      });
      if (!res.ok) throw new Error();
      showToast('success', `Now on: ${topic.trim()}`);
      setTopicTL(prev => prev ? { ...prev, drafts: { ...prev.drafts, [subject]: '' } } : prev);
      await loadTimeline(studentId);
      await fetchSchedule(new Date(mondayISO + 'T00:00:00'));
    } catch { showToast('error', 'Failed to update topic'); setTopicTL(prev => prev ? { ...prev, savingSubject: null } : prev); }
  }
  async function deleteTimelineRow(studentId: string, rowId: string) {
    try {
      await fetch('/api/admin-schedule/topic-timeline', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rowId, action: 'delete' }) });
      await loadTimeline(studentId);
      await fetchSchedule(new Date(mondayISO + 'T00:00:00'));
    } catch { showToast('error', 'Failed to delete'); }
  }
  function setExamRow(i: number, patch: Partial<ExamSubjectRow>) {
    setExamEdit(prev => prev ? { ...prev, rows: prev.rows.map((r, idx) => idx === i ? { ...r, ...patch } : r) } : prev);
  }
  async function saveExamEdit() {
    if (!examEdit || examEdit.saving) return;
    setExamEdit({ ...examEdit, saving: true });
    try {
      const entries = examEdit.noExam ? [] : examEdit.rows.flatMap(r =>
        r.mode === 'split'
          ? [
              { subject: r.subject, paper: 'Paper 1', examDate: r.p1Date, testedTopics: r.topics, notes: r.notes, approx: r.approxP1 },
              { subject: r.subject, paper: 'Paper 2', examDate: r.p2Date, testedTopics: '', notes: '', approx: r.approxP2 },
            ]
          : [{ subject: r.subject, paper: '', examDate: r.date, testedTopics: r.topics, notes: r.notes, approx: r.approx }]
      );
      const res = await fetch('/api/admin-schedule/set-exams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: examEdit.studentId, examType: examEdit.examType, noExam: examEdit.noExam, entries }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Failed'); }
      showToast('success', 'Exam info saved');
      setExamEdit(null);
      await fetchSchedule(new Date(mondayISO + 'T00:00:00'));
    } catch (e: unknown) {
      showToast('error', e instanceof Error ? e.message.slice(0, 80) : 'Failed to save');
      setExamEdit(prev => prev ? { ...prev, saving: false } : prev);
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
      if (l.status === 'Absent') return true; // show on all dates, faded
      if (l.status === 'Rescheduled') return !isFuture;
      return true;
    }).sort((a, b) => {
      // Faded (Absent or Rescheduled-away) chips sink to the bottom of their slot group
      const aFaded = (a.status === 'Absent' || a.status === 'Rescheduled') ? 1 : 0;
      const bFaded = (b.status === 'Absent' || b.status === 'Rescheduled') ? 1 : 0;
      return aFaded - bFaded;
    });
    const presentCount = visibleLessons.filter(l => l.status === 'Completed').length;

    // Enrolled students whose lesson for THIS date+slot was cancelled (e.g.
    // June regular lesson cancelled for a Revision Sprint). Shown as a faded,
    // non-markable chip — NOT a "tap to mark" ghost. Reason derived from notes.
    const cancelledHere = (data?.cancelledLessons ?? []).filter(
      c => c.date === dateStr && c.slotId === slot.id && c.studentId
    );
    const cancelledStudents = (!isFuture ? cancelledHere : []).map(c => ({
      id: c.studentId as string,
      name: data?.students[c.studentId as string]?.name ?? 'Unknown',
      reason: /revision/i.test(c.notes) ? 'on revision'
        : /holiday/i.test(c.notes) ? 'holiday'
        : 'cancelled',
    }));
    const cancelledStudentIds = new Set(cancelledHere.map(c => c.studentId));

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
        .filter(id => !visibleStudentIds.has(id) && !absentStudentIds.has(id) && !dateAbsentIds.has(id) && !cancelledStudentIds.has(id))
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
          slotLevel={slot.level}
          onChipTap={(lesson) => { setModalError(''); setActionSheet({ lesson, date: dateStr, slotId: slot.id }); }}
          onAddClick={() => openAddModal(date, slot)}
          onExamDateClick={openExamEdit}
          onWork={openWork}
          ghostStudents={ghostStudents}
          cancelledStudents={cancelledStudents}
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
          onQuickLog={showAttendance ? (lesson) => setQuickLog(lesson) : undefined}
          onGhostTap={(studentId, studentName) => setGhostActionSheet({ studentId, studentName, slotId: slot.id, date: dateStr })}
          savingStudents={savingAttendance}
          activeExamType={data?.activeExamType}
        />
      </div>
    );
  }

  // ── Revision Sprint card (June only) ─────────────────────────────────────────
  // Revision lessons have no Slot, so they render in their own per-day card,
  // clearly badged. Display-only here — attendance/makeups live on
  // /admin/revision-signups → Attendance tab.
  function renderRevisionCard(date: Date) {
    const dateStr = isoDate(date);
    const revs = (data?.lessons ?? []).filter(
      l => l.type === 'Revision Sprint' && l.date === dateStr && l.status !== 'Cancelled'
    );
    if (!revs.length) return null;
    const style = TYPE_COLORS['Revision Sprint'];
    const enriched: EnrichedLesson[] = revs
      .map(l => ({
        ...l,
        studentName: l.studentId ? (data?.students[l.studentId]?.name ?? 'Unknown') : 'Trial',
        studentLevel: l.studentId ? (data?.students[l.studentId]?.level ?? '') : '',
      }))
      .sort((a, b) => (a.revisionTime || '').localeCompare(b.revisionTime || '') || a.studentName.localeCompare(b.studentName));
    return (
      <div className="slot-card revision-card" key={`rev-${dateStr}`}>
        <div className="slot-header">
          <div className="slot-meta">
            <span className="slot-time">🏖 Revision Sprint</span>
          </div>
          <span className="capacity">{enriched.length}</span>
        </div>
        <div className="lesson-list">
          {enriched.map(l => {
            const faded = l.status === 'Absent';
            return (
              <div key={l.id} className="lesson-chip" style={{
                background: style.bg, color: style.text, borderColor: style.border,
                display: 'flex', alignItems: 'center', gap: 4, opacity: faded ? 0.55 : 1,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: faded ? 'line-through' : 'none' }}>{l.studentName}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2, flexWrap: 'wrap' }}>
                    <span className="type-tag" style={{ background: '#cffafe', color: '#0e7490', border: '1px solid #a5f3fc' }}>Revision</span>
                    {l.revisionLabel && <span style={{ fontSize: 10, color: '#64748b' }}>{l.revisionLabel}</span>}
                    {l.status === 'Scheduled' && (
                      <>
                        <button onClick={() => handleDirectStatus(l, 'Absent')} title="Mark missed"
                          style={{ width: 20, height: 20, borderRadius: 4, border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>✗</button>
                        <button onClick={() => handleDirectStatus(l, 'Completed')} title="Mark attended"
                          style={{ width: 20, height: 20, borderRadius: 4, border: '1px solid #bbf7d0', background: '#f0fdf4', color: '#16a34a', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>✓</button>
                        <button onClick={() => setRevReschedule({ lesson: l, date: '', slotId: '', saving: false })} title="Reschedule to a regular slot (makeup)"
                          style={{ height: 20, padding: '0 6px', borderRadius: 4, border: '1px solid #a5f3fc', background: '#ecfeff', color: '#0e7490', fontSize: 10, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 2 }}>↻ Reschedule</button>
                      </>
                    )}
                    {l.status === 'Completed' && (
                      <span style={{ fontSize: 10, color: '#15803d', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        ✓ Attended
                        <button onClick={() => handleDirectStatus(l, 'Scheduled')} style={{ fontSize: 9, color: '#94a3b8', background: 'none', border: 'none', textDecoration: 'underline', cursor: 'pointer', padding: 0 }}>undo</button>
                      </span>
                    )}
                    {l.status === 'Absent' && (
                      <span style={{ fontSize: 10, color: '#dc2626', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        ✗ Missed
                        <button onClick={() => handleDirectStatus(l, 'Scheduled')} style={{ fontSize: 9, color: '#94a3b8', background: 'none', border: 'none', textDecoration: 'underline', cursor: 'pointer', padding: 0 }}>undo</button>
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Lessons view ─────────────────────────────────────────────────────────────
  function renderLessonsView() {
    const overlayStyle = activeDragLesson ? getTypeStyle(activeDragLesson.type, activeDragLesson.status) : null;
    return (
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        autoScroll={{ layoutShiftCompensation: false, threshold: { x: 0, y: 0.15 } }}
      >
        {/* Mobile: always show only the active day — drag within same day only */}
        <div className="mobile-day">
          <div className="day-col">
            {renderRevisionCard(activeDate)}
            {(slotsByDay[dayNameOf(activeDate)] ?? []).map(slot => renderLessonsSlotCard(slot, activeDate))}
            {(slotsByDay[dayNameOf(activeDate)] ?? []).length === 0 && !renderRevisionCard(activeDate) && <div className="no-slots">No lessons</div>}
          </div>
        </div>
        {/* Desktop: full grid — only mounted on desktop to avoid ghost droppables on mobile */}
        {!isMobileView && (
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
                {renderRevisionCard(date)}
                {(slotsByDay[day] ?? []).map(slot => renderLessonsSlotCard(slot, date))}
                {(slotsByDay[day] ?? []).length === 0 && !renderRevisionCard(date) && <div className="no-slots">No slots</div>}
              </div>
            );
          })}
        </div>
        </div>
        )}
        <DragOverlay modifiers={[snapCenterToCursor]} style={{ zIndex: 9999 }}>
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
          <AdminAIChat
            apiRoute="/api/admin/ai-schedule"
            title="Schedule Assistant"
            accentColor="#1e3a5f"
            placeholder="e.g. Mark all today's lessons completed. Who is absent this week?"
            fabTop={16}
            fabSmall
            fabClassName="schedule-ai-fab"
          />
          <VoiceLog getRoster={getVoiceRoster} onApplied={handleProgressLoggedBatch} onToast={showToast} />
          <button className="nav-btn" onClick={prevWeek}>‹</button>
          <button className="week-label" onClick={thisWeek}>{formatWeekLabel(monday)}</button>
          <button className="nav-btn" onClick={nextWeek}>›</button>
          <button className="nav-btn refresh-btn" onClick={() => fetchSchedule(new Date(mondayISO + 'T00:00:00'))} disabled={loading} title="Refresh">↻</button>
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
            <button onClick={() => fetchSchedule(new Date(mondayISO + 'T00:00:00'))}>Retry</button>
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
                <a href={`/admin/students/${modal.studentId}`}
                  style={{ display: 'inline-block', marginTop: 6, fontSize: 13, fontWeight: 700, color: '#1d4ed8', textDecoration: 'none' }}>
                  Open full profile →
                </a>
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
      {examEdit && (
        <div className="modal-overlay" onClick={() => !examEdit.saving && setExamEdit(null)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="modal-name">{examEdit.studentName}</div>
                <div className="modal-type" style={{ color: '#64748b' }}>{examEdit.tab === 'exam' ? `Exam info · ${examEdit.examType}` : 'Regular work · topics'}</div>
              </div>
              <button className="modal-close" onClick={() => setExamEdit(null)} disabled={examEdit.saving}>✕</button>
            </div>
            {/* Tabs */}
            <div style={{ display: 'flex', gap: 6, padding: '0 16px', marginTop: -4 }}>
              {(['exam', 'work'] as const).map(t => (
                <button key={t} onClick={() => setExamEdit({ ...examEdit, tab: t })}
                  style={{ flex: 1, padding: '9px 10px', fontSize: 13, fontWeight: 700, cursor: 'pointer', borderRadius: 8,
                    border: examEdit.tab === t ? '1px solid #1e3a5f' : '1px solid #e5e7eb',
                    background: examEdit.tab === t ? '#1e3a5f' : '#fff', color: examEdit.tab === t ? '#fff' : '#64748b' }}>
                  {t === 'exam' ? '📝 Exam' : '📘 Regular work'}
                </button>
              ))}
            </div>
            <div className="modal-body">
              {examEdit.tab === 'work' ? (
                <ExamWorkTab
                  studentId={examEdit.studentId}
                  level={examEdit.studentLevel}
                  subjects={examEdit.studentSubjects.length ? examEdit.studentSubjects : ['']}
                  tl={topicTL}
                  onDraft={(subject, v) => setTopicTL(prev => prev ? { ...prev, drafts: { ...prev.drafts, [subject]: v } } : prev)}
                  onAdvance={(subject, topic) => advanceTopic(examEdit.studentId, subject, topic)}
                  onDeleteRow={(rowId) => deleteTimelineRow(examEdit.studentId, rowId)}
                />
              ) : (<>
              <div className="form-group" style={{ marginBottom: 12 }}>
                <span className="form-label">Exam</span>
                <select className="modal-select" value={examEdit.examType} onChange={e => setExamEdit({ ...examEdit, examType: e.target.value })}>
                  {['Prelim', 'WA3', 'WA1', 'WA2', 'EOY'].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: '#334155', cursor: 'pointer', marginBottom: 14 }}>
                <input type="checkbox" checked={examEdit.noExam} onChange={e => setExamEdit({ ...examEdit, noExam: e.target.checked })} />
                No exam this season
              </label>
              {!examEdit.noExam && examEdit.rows.map((row, i) => (
                <div key={row.subject || i} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 12px 4px', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 700, color: '#1e293b' }}>{row.subject || 'Exam'}</span>
                    {row.mode === 'single' ? (
                      <button onClick={() => setExamRow(i, { mode: 'split', p1Date: row.date, p2Date: '' })}
                        style={{ fontSize: 11.5, fontWeight: 600, color: '#0369a1', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 6, padding: '3px 9px', cursor: 'pointer' }}>➕ Split P1 / P2</button>
                    ) : (
                      <button onClick={() => setExamRow(i, { mode: 'single', date: row.p1Date })}
                        style={{ fontSize: 11.5, fontWeight: 600, color: '#64748b', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '3px 9px', cursor: 'pointer' }}>Merge to 1 paper</button>
                    )}
                  </div>
                  {row.mode === 'single' ? (
                    <>
                      <div className="form-group">
                        <span className="form-label">Exam date</span>
                        <input type="date" className="modal-input" value={row.date} onChange={e => setExamRow(i, { date: e.target.value })} />
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#64748b', cursor: 'pointer', marginTop: 5 }}>
                          <input type="checkbox" checked={row.approx} onChange={e => setExamRow(i, { approx: e.target.checked })} />
                          ~ week only (date not confirmed)
                        </label>
                      </div>
                      <div className="form-group" style={{ marginTop: 10 }}>
                        <span className="form-label">Topics tested <span style={{ color: '#cbd5e1', fontWeight: 400 }}>· optional</span></span>
                        <input className="modal-input" placeholder="e.g. Indices, Surds, Quadratics" value={row.topics} onChange={e => setExamRow(i, { topics: e.target.value })} />
                      </div>
                    </>
                  ) : (
                    <>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <div className="form-group" style={{ flex: 1, minWidth: 0 }}>
                        <span className="form-label">Paper 1 date</span>
                        <input type="date" className="modal-input" style={{ minWidth: 0, width: '100%', boxSizing: 'border-box' }} value={row.p1Date} onChange={e => setExamRow(i, { p1Date: e.target.value })} />
                        <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: '#64748b', cursor: 'pointer', marginTop: 5 }}>
                          <input type="checkbox" checked={row.approxP1} onChange={e => setExamRow(i, { approxP1: e.target.checked })} /> ~ week
                        </label>
                      </div>
                      <div className="form-group" style={{ flex: 1, minWidth: 0 }}>
                        <span className="form-label">Paper 2 date</span>
                        <input type="date" className="modal-input" style={{ minWidth: 0, width: '100%', boxSizing: 'border-box' }} value={row.p2Date} onChange={e => setExamRow(i, { p2Date: e.target.value })} />
                        <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: '#64748b', cursor: 'pointer', marginTop: 5 }}>
                          <input type="checkbox" checked={row.approxP2} onChange={e => setExamRow(i, { approxP2: e.target.checked })} /> ~ week
                        </label>
                      </div>
                    </div>
                    <div className="form-group" style={{ marginTop: 10 }}>
                      <span className="form-label">Topics tested <span style={{ color: '#cbd5e1', fontWeight: 400 }}>· optional</span></span>
                      <input className="modal-input" placeholder="e.g. whole syllabus" value={row.topics} onChange={e => setExamRow(i, { topics: e.target.value })} />
                    </div>
                    </>
                  )}
                  <div className="form-group" style={{ marginTop: 10 }}>
                    <span className="form-label">Notes <span style={{ color: '#cbd5e1', fontWeight: 400 }}>· optional</span></span>
                    <input className="modal-input" placeholder="e.g. bring graph paper" value={row.notes} onChange={e => setExamRow(i, { notes: e.target.value })} />
                  </div>
                </div>
              ))}
              <div className="modal-actions">
                <button className="btn-cancel" onClick={() => setExamEdit(null)} disabled={examEdit.saving}>Cancel</button>
                <button className="btn-primary" onClick={saveExamEdit} disabled={examEdit.saving}>
                  {examEdit.saving ? 'Saving…' : 'Save'}
                </button>
              </div>
              </>)}
            </div>
          </div>
        </div>
      )}

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
            {actionSheet.lesson.studentId && (
              <button className="action-btn" style={{ color: '#1d4ed8', fontWeight: 700 }} onClick={() => {
                window.open(`/admin/students/${actionSheet.lesson.studentId}`, '_blank');
                setActionSheet(null);
              }}>👤 Open full profile</button>
            )}
            {actionSheet.lesson.type === 'Trial' && (
              <button className="action-btn" style={{ color: '#15803d', fontWeight: 700 }} onClick={() => {
                const tl = actionSheet.lesson;
                setTrialEnrol({ lesson: tl, trialName: tl.studentName, studentName: tl.studentName, level: '', subjects: [], subjectLevel: '', slotId: tl.slotId || '', startDate: '', url: '', generating: false });
                setActionSheet(null);
              }}>🎓 Convert to enrolment</button>
            )}
            <button className="action-btn" onClick={() => {
              window.open(`/admin/progress?date=${actionSheet.date}&lesson=${actionSheet.lesson.id}`, '_blank');
              setActionSheet(null);
            }}>📊 Log progress</button>
            {actionSheet.lesson.revisionMakeup && (
              <div style={{ padding: '10px 16px', borderTop: '1px solid #f1f5f9', fontSize: 13 }}>
                <div style={{ color: '#0f766e', fontWeight: 700, marginBottom: 4 }}>
                  🏖 Makeup for missed revision{revMakeupInfo && revMakeupInfo !== 'loading' && (revMakeupInfo.subjectLabel || revMakeupInfo.date) ? ` · ${revMakeupInfo.subjectLabel}${revMakeupInfo.date ? ` (${formatExamDate(revMakeupInfo.date)})` : ''}` : ''}
                </div>
                {revMakeupInfo === 'loading' ? (
                  <div style={{ color: '#94a3b8' }}>Loading topics…</div>
                ) : revMakeupInfo && revMakeupInfo.topics.length > 0 ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {revMakeupInfo.topics.map((t, i) => (
                      <span key={i} style={{ background: '#ccfbf1', color: '#0f766e', border: '1px solid #99f6e4', borderRadius: 999, padding: '2px 9px', fontSize: 12 }}>{t}</span>
                    ))}
                  </div>
                ) : (
                  <div style={{ color: '#94a3b8' }}>No topics recorded for that session.</div>
                )}
              </div>
            )}
            {actionSheet.lesson.revisionMakeup && (
              <button className="action-btn" onClick={() => handleUndoRevisionMakeup(actionSheet.lesson)}>↩ Undo revision reschedule</button>
            )}
            {actionSheet.lesson.type === 'Rescheduled' && (
              <button className="action-btn" onClick={() => handleUndoReschedule(actionSheet.lesson)}>↩ Undo reschedule</button>
            )}
            <button className="action-btn" onClick={() => {
              setRescheduleModal({ lesson: actionSheet.lesson, toDate: '', toSlotId: '', notes: '', notify: false, showPickers: true });
              setShowAllRescheduleSlots(false);
              setModalError(''); setActionSheet(null);
            }}>🔄 Reschedule</button>
            {actionSheet.lesson.type !== 'Trial' && (
              <button className="action-btn" onClick={() => {
                setRescheduleModal({ lesson: actionSheet.lesson, toDate: '', toSlotId: '', notes: '', notify: false, showPickers: true, switchMode: true });
                setShowAllRescheduleSlots(false);
                setModalError(''); setActionSheet(null);
              }}>🔀 Switch slot</button>
            )}
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
                <div className="modal-name">{rescheduleModal.switchMode ? 'Switch Slot' : 'Reschedule'}</div>
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
                  {!rescheduleModal.switchMode && (
                    <div className="form-group">
                      <span className="form-label">New Date</span>
                      <input type="date" className="modal-input" value={rescheduleModal.toDate}
                        onChange={e => setRescheduleModal(m => m ? { ...m, toDate: e.target.value, toSlotId: '' } : null)} />
                    </div>
                  )}
                  <div className="form-group">
                    <span className="form-label">New Slot</span>
                    {(() => {
                      // Switch mode: show ALL days (don't filter by selected date's day)
                      const selectedDayName = rescheduleModal.switchMode ? null : rescheduleModal.toDate
                        ? ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date(rescheduleModal.toDate + 'T00:00:00').getDay()]
                        : null;
                      const daySlots = selectedDayName
                        ? sortedSlots.filter(s => s.dayName === selectedDayName)
                        : sortedSlots;
                      const displaySlots = showAllRescheduleSlots ? sortedSlots : daySlots;
                      const hiddenCount = sortedSlots.length - daySlots.length;

                      return (
                        <>
                          <select className="modal-select" value={rescheduleModal.toSlotId}
                            onChange={e => setRescheduleModal(m => m ? { ...m, toSlotId: e.target.value, toDate: rescheduleModal.switchMode ? '' : m?.toDate ?? '' } : null)}>
                            <option value="">Select slot…</option>
                            {displaySlots.filter(s => {
                              if (s.id === rescheduleModal.lesson.slotId) return false;
                              if (rescheduleModal.switchMode) {
                                // Level filter: match Secondary/JC category
                                // Slot level field is 'Secondary', 'JC', 'Adhoc' etc.
                                // Student level is 'Sec1'/'Sec2'/... or 'JC1'/'JC2'
                                const studentLvl = (rescheduleModal.lesson.studentLevel || '').toLowerCase();
                                const slotLvl = (s.level || '').toLowerCase();
                                const studentIsJC = studentLvl.startsWith('jc');
                                const slotIsJC = slotLvl === 'jc' || slotLvl.startsWith('jc');
                                const slotIsAdhoc = slotLvl === 'adhoc';
                                if (slotIsAdhoc) return false; // never show adhoc slots for switch
                                if (!showAllRescheduleSlots && studentIsJC !== slotIsJC) return false;
                                // Capacity filter: only show slots with room (enrolledCount < normalCapacity)
                                const regCap = s.capacity ?? 0;
                                const enrolled = s.enrolledCount ?? 0;
                                if (!showAllRescheduleSlots && regCap > 0 && enrolled >= regCap) return false;
                              }
                              return true;
                            }).map(s => {
                              if (rescheduleModal.switchMode) {
                                // Switch mode: show regular capacity (enrolled vs normal cap)
                                const regCap = s.capacity ?? 0;
                                const enrolled = s.enrolledCount ?? 0;
                                const isFull = regCap > 0 && enrolled >= regCap;
                                const availStr = regCap > 0
                                  ? (isFull ? ` — FULL (${enrolled}/${regCap})` : ` — ${enrolled}/${regCap} enrolled`)
                                  : '';
                                const label = `${s.dayName} ${s.time} (${s.level})${availStr}`;
                                return <option key={s.id} value={s.id} disabled={isFull && !showAllRescheduleSlots}>{label}</option>;
                              }
                              // Reschedule mode: show makeup capacity
                              const mkCap = s.makeupCapacity ?? s.capacity ?? 0;
                              const slotLessons = rescheduleModal.toDate
                                ? (enrichedLessonMap[`${rescheduleModal.toDate}__${s.id}`] ?? [])
                                : [];
                              const existingLessons = slotLessons.length > 0
                                ? slotLessons.filter(l =>
                                    l.status !== 'Cancelled' &&
                                    l.status !== 'Absent' &&
                                    l.status !== 'Rescheduled'
                                  ).length
                                : (s.enrolledCount ?? 0);
                              const isFull = mkCap > 0 && existingLessons >= mkCap;
                              const availStr = mkCap > 0
                                ? (isFull ? ' — FULL' : ` — ${existingLessons}/${mkCap}`)
                                : '';
                              const label = `${s.dayName} ${s.time} (${s.level})${availStr}`;
                              return <option key={s.id} value={s.id} disabled={isFull && !showAllRescheduleSlots}>{label}</option>;
                            })}
                          </select>
                          <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <input type="checkbox" id="show-all-slots" checked={showAllRescheduleSlots}
                              onChange={e => { setShowAllRescheduleSlots(e.target.checked); setRescheduleModal(m => m ? { ...m, toSlotId: '' } : null); }} />
                            <label htmlFor="show-all-slots" style={{ fontSize: 12, color: '#64748b', cursor: 'pointer' }}>
                              {rescheduleModal.switchMode
                                ? 'Show full slots and other levels'
                                : `Show all slots${hiddenCount > 0 && !showAllRescheduleSlots ? ` (${hiddenCount} on other days)` : ''}`}
                            </label>
                          </div>
                        </>
                      );
                    })()}
                  </div>

                  {/* Switch mode: "Start on" — next two occurrences of the selected slot's day */}
                  {rescheduleModal.switchMode && rescheduleModal.toSlotId && (() => {
                    const slot = sortedSlots.find(s => s.id === rescheduleModal.toSlotId);
                    if (!slot) return null;
                    const DAY_ORDER = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
                    const targetDay = DAY_ORDER.indexOf(slot.dayName);
                    if (targetDay === -1) return null;
                    // Find next two occurrences starting from tomorrow (SGT approx)
                    const today = new Date();
                    today.setHours(0,0,0,0);
                    const dates: string[] = [];
                    let d = new Date(today);
                    d.setDate(d.getDate() + 1); // start from tomorrow
                    while (dates.length < 2) {
                      if (d.getDay() === targetDay) {
                        dates.push(d.toLocaleDateString('en-CA')); // YYYY-MM-DD
                      }
                      d.setDate(d.getDate() + 1);
                    }
                    return (
                      <div className="form-group">
                        <span className="form-label">Start on</span>
                        <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                          {dates.map(dateStr => {
                            const label = new Date(dateStr + 'T00:00:00').toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short' });
                            const isSelected = rescheduleModal.toDate === dateStr;
                            return (
                              <button key={dateStr} type="button"
                                onClick={() => setRescheduleModal(m => m ? { ...m, toDate: dateStr } : null)}
                                style={{
                                  flex: 1, padding: '10px 8px', borderRadius: 8, border: '1.5px solid',
                                  borderColor: isSelected ? '#1e3a5f' : '#e2e8f0',
                                  background: isSelected ? '#1e3a5f' : '#f8fafc',
                                  color: isSelected ? '#fff' : '#475569',
                                  fontSize: 13, fontWeight: 600, cursor: 'pointer',
                                }}>
                                {label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
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

      {/* Add weekly slot modal */}
      {addSlotModal && (
        <div className="modal-overlay" onClick={() => !addSlotSubmitting && setAddSlotModal(null)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div><div className="modal-name">Add weekly slot</div></div>
              <button className="modal-close" onClick={() => setAddSlotModal(null)} disabled={addSlotSubmitting}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>
                {addSlotModal.slot.dayName} {addSlotModal.slot.time} · {addSlotModal.slot.level}
              </div>

              <div className="form-group">
                <span className="form-label">Student</span>
                <select
                  className="modal-select"
                  value={addSlotModal.studentId}
                  onChange={e => setAddSlotModal({ ...addSlotModal, studentId: e.target.value })}
                >
                  <option value="">Select a student…</option>
                  {Object.entries(data?.students ?? {})
                    .map(([id, s]) => ({ id, name: (s as { name: string }).name }))
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>

              <div className="form-group" style={{ marginTop: 12 }}>
                <span className="form-label">Start date</span>
                <input
                  type="date"
                  className="modal-input"
                  value={addSlotModal.startDate}
                  onChange={e => setAddSlotModal({ ...addSlotModal, startDate: e.target.value })}
                />
              </div>

              <div style={{ marginTop: 10, fontSize: 12, color: '#64748b', lineHeight: 1.5 }}>
                Creates an active enrollment in this slot and generates 9 weeks of weekly lessons (rate copied from the student&apos;s existing enrollment).
              </div>

              <div className="modal-actions">
                <button className="btn-cancel" onClick={() => setAddSlotModal(null)} disabled={addSlotSubmitting}>Cancel</button>
                <button className="btn-primary" onClick={submitAddWeeklySlot} disabled={addSlotSubmitting || !addSlotModal.studentId}>
                  {addSlotSubmitting ? 'Adding…' : 'Add weekly slot'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reschedule a Revision Sprint lesson → makeup at a regular slot */}
      {revReschedule && (
        <div className="modal-overlay" onClick={() => !revReschedule.saving && setRevReschedule(null)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div><div className="modal-name">Reschedule revision lesson</div></div>
              <button className="modal-close" onClick={() => setRevReschedule(null)} disabled={revReschedule.saving}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>
                {revReschedule.lesson.studentName}{revReschedule.lesson.revisionLabel ? ` · ${revReschedule.lesson.revisionLabel}` : ''} · {formatExamDate(revReschedule.lesson.date)}
              </div>

              <div className="form-group">
                <span className="form-label">New date</span>
                <input type="date" className="modal-input" value={revReschedule.date}
                  onChange={e => setRevReschedule({ ...revReschedule, date: e.target.value })} />
              </div>

              <div className="form-group" style={{ marginTop: 12 }}>
                <span className="form-label">Slot (same-level first; any timing allowed)</span>
                <select className="modal-select" value={revReschedule.slotId}
                  onChange={e => setRevReschedule({ ...revReschedule, slotId: e.target.value })}>
                  <option value="">Select a slot…</option>
                  {(() => {
                    const lvl = revReschedule.lesson.studentLevel || '';
                    const all = (data?.slots ?? []).slice().sort((a, b) => a.dayNum - b.dayNum || a.time.localeCompare(b.time));
                    const same = all.filter(s => sameLevelSlot(lvl, s.level));
                    const other = all.filter(s => !sameLevelSlot(lvl, s.level));
                    const opt = (s: Slot) => <option key={s.id} value={s.id}>{s.dayName} {s.time} ({s.level})</option>;
                    return (
                      <>
                        {same.length > 0 && <optgroup label={`Same level${lvl ? ` (${lvl})` : ''}`}>{same.map(opt)}</optgroup>}
                        {other.length > 0 && <optgroup label="Other slots">{other.map(opt)}</optgroup>}
                      </>
                    );
                  })()}
                </select>
              </div>

              <div style={{ marginTop: 10, fontSize: 12, color: '#64748b', lineHeight: 1.5 }}>
                Creates an <strong>Additional</strong> makeup lesson at the chosen slot, marks this revision lesson <strong>Absent</strong>, and links them. It will show here with a 🏖 Revision makeup badge. (Silent — no parent message.)
              </div>

              <div className="modal-actions">
                <button className="btn-cancel" onClick={() => setRevReschedule(null)} disabled={revReschedule.saving}>Cancel</button>
                <button className="btn-primary" onClick={submitRevReschedule} disabled={revReschedule.saving || !revReschedule.date || !revReschedule.slotId}>
                  {revReschedule.saving ? 'Rescheduling…' : 'Reschedule'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Convert trial → enrolment: generate a signup link */}
      {trialEnrol && (
        <div className="modal-overlay" onClick={() => !trialEnrol.generating && setTrialEnrol(null)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div><div className="modal-name">Convert to enrolment</div><div className="modal-type">{trialEnrol.trialName}</div></div>
              <button className="modal-close" onClick={() => setTrialEnrol(null)} disabled={trialEnrol.generating}>✕</button>
            </div>
            <div className="modal-body">
              {!trialEnrol.url ? (
                <>
                  <div className="form-group">
                    <span className="form-label">Student name</span>
                    <input className="modal-input" value={trialEnrol.studentName} onChange={e => setTrialEnrol({ ...trialEnrol, studentName: e.target.value })} placeholder="Student's full name" />
                    <span style={{ fontSize: 11, color: '#94a3b8', marginTop: 4, display: 'block' }}>Pre-fills the parent&apos;s signup form — they can still correct it.</span>
                  </div>
                  <div className="form-group" style={{ marginTop: 12 }}>
                    <span className="form-label">Level</span>
                    <select className="modal-select" value={trialEnrol.level} onChange={e => setTrialEnrol({ ...trialEnrol, level: e.target.value })}>
                      <option value="">Select…</option>
                      {['Sec 1', 'Sec 2', 'Sec 3', 'Sec 4', 'Sec 5', 'JC1', 'JC2'].map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </div>
                  <div className="form-group" style={{ marginTop: 12 }}>
                    <span className="form-label">Subject(s)</span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                      {['E Math', 'A Math', 'H2 Math', 'H1 Math', 'Math'].map(subj => {
                        const on = trialEnrol.subjects.includes(subj);
                        return (
                          <button key={subj} type="button"
                            onClick={() => setTrialEnrol({ ...trialEnrol, subjects: on ? trialEnrol.subjects.filter(s => s !== subj) : [...trialEnrol.subjects, subj] })}
                            style={{ fontSize: 13, fontWeight: 600, padding: '6px 12px', borderRadius: 8, cursor: 'pointer', border: `1px solid ${on ? '#1e3a5f' : '#e5e7eb'}`, background: on ? '#1e3a5f' : '#fff', color: on ? '#fff' : '#475569' }}>
                            {subj}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="form-group" style={{ marginTop: 12 }}>
                    <span className="form-label">Subject level (optional)</span>
                    <select className="modal-select" value={trialEnrol.subjectLevel} onChange={e => setTrialEnrol({ ...trialEnrol, subjectLevel: e.target.value })}>
                      <option value="">—</option>
                      {['G1', 'G2', 'G3', 'IP', 'H1', 'H2'].map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </div>
                  <div className="form-group" style={{ marginTop: 12 }}>
                    <span className="form-label">Enrolment slot</span>
                    <select className="modal-select" value={trialEnrol.slotId} onChange={e => setTrialEnrol({ ...trialEnrol, slotId: e.target.value })}>
                      <option value="">Select a slot…</option>
                      {sortedSlots.map(s => <option key={s.id} value={s.id}>{s.dayName} {s.time} ({s.level})</option>)}
                    </select>
                  </div>
                  <div className="form-group" style={{ marginTop: 12 }}>
                    <span className="form-label">First lesson date (optional)</span>
                    <input type="date" className="modal-input" value={trialEnrol.startDate} onChange={e => setTrialEnrol({ ...trialEnrol, startDate: e.target.value })} />
                  </div>
                  <div className="modal-actions">
                    <button className="btn-cancel" onClick={() => setTrialEnrol(null)} disabled={trialEnrol.generating}>Cancel</button>
                    <button className="btn-primary" onClick={generateTrialLink} disabled={trialEnrol.generating || !trialEnrol.level || trialEnrol.subjects.length === 0 || !trialEnrol.slotId}>
                      {trialEnrol.generating ? 'Generating…' : 'Generate signup link'}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 13, color: '#15803d', fontWeight: 600, marginBottom: 8 }}>✓ Signup link ready — send it to the parent (valid 24h)</div>
                  <input readOnly className="modal-input" value={trialEnrol.url} onFocus={e => e.currentTarget.select()} style={{ fontSize: 12 }} />
                  <div className="modal-actions">
                    <button className="btn-cancel" onClick={() => setTrialEnrol(null)}>Close</button>
                    <a className="btn-primary" href={trialEnrol.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>Open</a>
                    <button className="btn-primary" onClick={() => { navigator.clipboard?.writeText(trialEnrol.url); showToast('success', 'Link copied'); }}>Copy link</button>
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 8, lineHeight: 1.5 }}>
                    When the parent submits the form, the system creates their Student record, enrolment, first invoice and recurring lessons — and links this trial lesson to them.
                  </div>
                </>
              )}
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
                    setRevSessions([]); setRevSessionsError('');
                    if (t === 'Ad-hoc') loadAllStudents();
                  }}>
                  <option value="Makeup">Makeup</option>
                  <option value="Rescheduled">Rescheduled</option>
                  <option value="Additional">Additional</option>
                  <option value="Revision Makeup">Revision Makeup (not billed)</option>
                  <option value="Ad-hoc">Ad-hoc (billable)</option>
                  <option value="Trial">Trial</option>
                </select>
              </div>
              {/* Date */}
              <div className="form-group">
                <span className="form-label">Date</span>
                <input type="date" className="modal-input" value={addModal.date}
                  onChange={e => setAddModal(m => m ? { ...m, date: e.target.value, slotId: '' } : null)} />
              </div>
              {/* Slot — scoped to the selected date's weekday */}
              <div className="form-group">
                <span className="form-label">Slot</span>
                {(() => {
                  const dayName = addModal.date
                    ? ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date(addModal.date + 'T00:00:00').getDay()]
                    : null;
                  const daySlots = (data?.slots ?? []).filter(s => !dayName || s.dayName === dayName);
                  return (
                    <select className="modal-select" value={addModal.slotId}
                      onChange={e => setAddModal(m => m ? { ...m, slotId: e.target.value } : null)}>
                      <option value="">{!addModal.date ? 'Pick a date first…' : daySlots.length ? 'Select slot…' : `No slots on ${dayName}`}</option>
                      {daySlots.map(s => <option key={s.id} value={s.id}>{s.dayName} {s.time} ({s.level})</option>)}
                    </select>
                  );
                })()}
              </div>
              {/* Student search (Additional/Makeup) */}
              {addModal.type !== 'Trial' && addModal.type !== 'Ad-hoc' && (
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
                          setRevSessions([]); setRevSessionsError('');
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
                                  if (addModal.type === 'Revision Makeup') fetchRevSessions(id);
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

              {/* Ad-hoc: search ALL students + inline create + per-session charge */}
              {addModal.type === 'Ad-hoc' && (
                <>
                  <div className="form-group">
                    <span className="form-label">Student (unenrolled ok)</span>
                    {addModal.studentId ? (
                      <div className="student-selected">
                        ✓ {allStudents.find(s => s.id === addModal.studentId)?.name ?? data?.students[addModal.studentId]?.name ?? addModal.studentId}
                        <button style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: 12 }}
                          onClick={() => setAddModal(m => m ? { ...m, studentId: '', studentSearch: '', charge: '' } : null)}>change</button>
                      </div>
                    ) : (
                      <>
                        <input type="text" className="modal-input" placeholder="Search, or type a new name…"
                          value={addModal.studentSearch}
                          onChange={e => setAddModal(m => m ? { ...m, studentSearch: e.target.value } : null)} />
                        {addModal.studentSearch && (() => {
                          const q = addModal.studentSearch.toLowerCase();
                          const matches = allStudents.filter(s => s.name.toLowerCase().includes(q)).slice(0, 6);
                          return (
                            <div className="student-search-results">
                              {matches.map(s => (
                                <button key={s.id} className="student-result"
                                  onClick={() => { setAddModal(m => m ? { ...m, studentId: s.id, studentSearch: '' } : null); prefillCharge(s.level); }}>
                                  {s.name} <span style={{ color: '#94a3b8', fontSize: 11 }}>· {s.level}</span>
                                </button>
                              ))}
                              <div style={{ borderTop: matches.length ? '1px solid #f1f5f9' : 'none', padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                                <div style={{ fontSize: 12, color: '#64748b' }}>➕ New student “<b>{addModal.studentSearch}</b>”</div>
                                <div style={{ display: 'flex', gap: 6 }}>
                                  <select className="modal-select" style={{ flex: 1 }} value={addModal.newLevel || ''}
                                    onChange={e => setAddModal(m => m ? { ...m, newLevel: e.target.value } : null)}>
                                    <option value="">Level…</option>
                                    {['Sec 1', 'Sec 2', 'Sec 3', 'Sec 4', 'Sec 5', 'JC1', 'JC2'].map(l => <option key={l} value={l}>{l}</option>)}
                                  </select>
                                  <input type="email" className="modal-input" style={{ flex: 1.6 }} placeholder="Parent email (optional)"
                                    value={addModal.newEmail || ''} onChange={e => setAddModal(m => m ? { ...m, newEmail: e.target.value } : null)} />
                                </div>
                                <button disabled={creatingStudent || !addModal.newLevel} onClick={() => createAdhocStudent(addModal.studentSearch)}
                                  style={{ background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 0', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: (creatingStudent || !addModal.newLevel) ? 0.5 : 1 }}>
                                  {creatingStudent ? 'Creating…' : 'Create + select'}
                                </button>
                              </div>
                            </div>
                          );
                        })()}
                      </>
                    )}
                  </div>
                  {addModal.studentId && (
                    <div className="form-group">
                      <span className="form-label">Charge for this session ($)</span>
                      <input type="number" className="modal-input" placeholder="e.g. 60" min="0" step="1"
                        value={addModal.charge || ''} onChange={e => setAddModal(m => m ? { ...m, charge: e.target.value } : null)} />
                      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>Prefilled from the level rate — edit as needed. Billed on demand from the student’s profile.</div>
                    </div>
                  )}
                </>
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

              {/* Revision lesson picker — Revision Makeup only, shown after a student is selected */}
              {addModal.type === 'Revision Makeup' && addModal.studentId && (
                <div className="form-group">
                  <span className="form-label">Revision lesson being made up</span>
                  {revSessionsLoading ? (
                    <div style={{ fontSize: 13, color: '#94a3b8', padding: '8px 0' }}>Loading revision sessions…</div>
                  ) : revSessionsError ? (
                    <div style={{ fontSize: 13, color: '#dc2626', padding: '8px 0' }}>{revSessionsError}</div>
                  ) : revSessions.length === 0 ? (
                    <div style={{ fontSize: 13, color: '#94a3b8', padding: '8px 0' }}>No un-made-up revision sessions — you can still add a standalone makeup.</div>
                  ) : (
                    <>
                      <select className="modal-select" value={addModal.linkedLessonId}
                        onChange={e => setAddModal(m => m ? { ...m, linkedLessonId: e.target.value } : null)}>
                        <option value="">— Standalone (not linked to a session) —</option>
                        {revSessions.map(s => {
                          const d = new Date(s.date + 'T00:00:00');
                          const dateLabel = d.toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short' });
                          const miss = s.outcome === 'missed' || s.outcome === 'rescheduled_missed' || s.status === 'Absent';
                          return (
                            <option key={s.lessonId} value={s.lessonId}>
                              {dateLabel} · {s.subjectLabel}{s.time ? ` ${s.time}` : ''}{miss ? ' · ⚠ missed' : ''}
                            </option>
                          );
                        })}
                      </select>
                      {/* Topics of the selected session, for confirmation */}
                      {(() => {
                        const sel = revSessions.find(s => s.lessonId === addModal.linkedLessonId);
                        if (!sel) return null;
                        return (
                          <div style={{ fontSize: 12.5, color: '#475569', marginTop: 6, lineHeight: 1.45 }}>
                            <strong>{sel.subjectLabel}</strong>{sel.time ? ` · ${sel.time}` : ''}
                            {sel.topics.length > 0
                              ? <> — topics: {sel.topics.join(', ')}</>
                              : <> — no topics recorded for this date</>}
                          </div>
                        );
                      })()}
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
              {/* Revision Makeup hint — silent, not billed */}
              {addModal.type === 'Revision Makeup' && (
                <div style={{ fontSize: 12.5, color: '#0f766e', background: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: 8, padding: '8px 10px', lineHeight: 1.45 }}>
                  Creates a <strong>🏖 Revision Makeup</strong> lesson (already paid in the Revision Sprint, so <strong>not billed</strong> again). Silent — no parent message.
                </div>
              )}
              {/* Notify (Additional/Makeup only — Revision Makeup is always silent) */}
              {addModal.type !== 'Trial' && addModal.type !== 'Revision Makeup' && (
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
          slots={data?.slots ?? []}
          onClose={() => setLessonModal(null)}
          onProgressLogged={handleProgressLogged}
        />
      )}

      {/* Quick tap-log bottom sheet (📝 pill) */}
      {quickLog && (
        <QuickLogSheet
          lesson={{ id: quickLog.id, studentName: quickLog.studentName, date: quickLog.date }}
          onClose={() => setQuickLog(null)}
          onLogged={handleProgressLogged}
          onToast={showToast}
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
/* Voice-log header button: emoji-only on narrow screens */
@media (max-width: 767px) {
  .voice-log-label { display: none; }
}
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
.slot-card.revision-card { border-left: 4px solid #06b6d4; background: #f6feff; }
.slot-card.revision-card .slot-time { color: #0e7490; }
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
.lesson-chip.absent { opacity: 0.8; }
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
  /* On desktop the AI button sits inline in the header, left of the week nav */
  .schedule-ai-fab {
    position: static !important;
    top: auto !important; right: auto !important; bottom: auto !important;
    margin-right: 6px;
  }
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
