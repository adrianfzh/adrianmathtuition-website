'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

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
  parentName: string;
  parentEmail: string;
  parentPhone: string;
}

interface ScheduleData {
  weekStart: string;
  weekEnd: string;
  slots: Slot[];
  lessons: Lesson[];
  students: Record<string, Student>;
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
  return d.toISOString().split('T')[0];
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

  const [modal, setModal] = useState<{ student: Student; lessonType: string } | null>(null);
  const savedPw = useRef('');

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
            <p>Adrian's Math Tuition</p>
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

  function getLessons(date: Date, slotId: string): Lesson[] {
    return lessonMap[`${isoDate(date)}__${slotId}`] || [];
  }

  function countPresent(date: Date, slotId: string): number {
    return getLessons(date, slotId).filter(
      l => l.status !== 'Absent' && l.status !== 'Cancelled'
    ).length;
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
      const lessons = getLessons(date, slot.id);
      const present = countPresent(date, slot.id);
      const hasLessons = lessons.length > 0;

      return (
        <div key={slot.id} className={`slot-card ${isToday ? 'today' : ''}`}>
          <div className="slot-header">
            <div className="slot-meta">
              <span className="slot-time">⏰ {slot.time}</span>
              <span className={`slot-level level-${slot.level.toLowerCase()}`}>{slot.level}</span>
            </div>
            {hasLessons ? (
              <span className={`capacity ${present >= slot.capacity ? 'full' : ''}`}>
                {present}/{slot.capacity}
              </span>
            ) : (
              <span className="capacity dim">{slot.enrolledCount}/{slot.capacity}</span>
            )}
          </div>

          {hasLessons ? (
            <div className="lesson-list">
              {lessons.map(lesson => renderLesson(lesson, data!))}
            </div>
          ) : (
            <div className="lesson-list empty-enrolled">
              <span className="enrolled-hint">{slot.enrolledCount} enrolled</span>
            </div>
          )}
        </div>
      );
    });
  }

  function renderLesson(lesson: Lesson, d: ScheduleData) {
    const isAbsent = lesson.status === 'Absent' || lesson.status === 'Cancelled';
    const style = getTypeStyle(lesson.type, lesson.status);
    const isTrial = lesson.type === 'Trial';

    let displayName: string;
    let student: Student | null = null;
    if (lesson.studentId && d.students[lesson.studentId]) {
      student = d.students[lesson.studentId];
      displayName = student.name;
    } else if (isTrial) {
      displayName = getTrialName(lesson.notes);
    } else {
      displayName = 'Unknown';
    }

    const clickable = student || isTrial;

    return (
      <div
        key={lesson.id}
        className={`lesson-chip ${isAbsent ? 'absent' : ''}`}
        style={{ background: style.bg, color: style.text, borderColor: style.border }}
        onClick={clickable && student ? () => setModal({ student, lessonType: lesson.type }) : undefined}
        role={clickable && student ? 'button' : undefined}
      >
        {isTrial && <span className="trial-badge">🆕</span>}
        <span className={isAbsent ? 'absent-name' : ''}>{displayName}</span>
        {lesson.type !== 'Regular' && !isAbsent && (
          <span className="type-tag">{lesson.type}</span>
        )}
        {isAbsent && <span className="type-tag absent-tag">{lesson.status}</span>}
      </div>
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

      {/* Day tabs (mobile) */}
      <div className="day-tabs">
        {DAYS.map((day, i) => {
          const date = weekDates[i];
          const isToday = isoDate(date) === isoDate(new Date());
          const slots = slotsByDay[day] || [];
          const hasActivity = data && slots.some(s => getLessons(date, s.id).length > 0);
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
          <>
            {/* Mobile: single day */}
            <div className="mobile-day">
              <div className="day-col">
                {renderDaySlots(activeDay)}
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
                        {date.toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })}
                      </span>
                    </div>
                    {renderDaySlots(i)}
                  </div>
                );
              })}
            </div>
          </>
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
              {modal.student.parentPhone && (
                <div className="modal-row">
                  <span className="modal-label">Phone</span>
                  <a href={`tel:${modal.student.parentPhone}`}>{modal.student.parentPhone}</a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
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

/* ── Day tabs ── */
.day-tabs {
  display: flex;
  background: white;
  border-bottom: 1px solid #e2e8f0;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  position: sticky;
  top: 57px;
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
    grid-template-columns: repeat(7, 1fr);
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
`;
