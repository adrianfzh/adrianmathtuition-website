'use client';

// /admin/log — write up the day in taps, not in modals.
//
// The fields were never the problem: LessonModal has had one-tap mastery chips
// for months. The problem was the NAVIGATION around them — find the lesson on
// the calendar, open the modal, tap, close, repeat ×8. This page is the same
// taps with the navigation deleted: every unlogged lesson in the editable
// window, stacked, each tap saving on its own.
//
// It owns no write logic. Mastery/topics/notes go to `lesson-update`, homework
// to `lesson-prev-update`, attendance to `attendance` — the same routes the
// modal uses, so the 14-day edit window and the Progress Logged auto-set have
// exactly one definition.
//
// Built mobile-first: this gets used standing up, at the end of the day.

import { useState, useEffect, useCallback, useRef } from 'react';
import { ensureAdminSession, loginAdminSession } from '@/lib/admin-client';
import type { TopicCategory } from '@/lib/canonical-topics';

type Lesson = {
  lessonId: string;
  date: string;
  studentId: string;
  studentName: string;
  level: string;
  slotId: string | null;
  slotLabel: string;
  status: string;
  type: string;
  mastery: string;
  mood: string;
  topics: string[];
  homeworkAssigned: string;
  homeworkReturned: string;
  lessonNotes: string;
  nextLessonPlan: string;
  prev: { date: string; homeworkAssigned: string; nextLessonPlan: string } | null;
};

const C = {
  border: '#e5e7eb',
  muted: '#6b7280',
  faint: '#9ca3af',
  ink: '#111827',
  plan: '#7c3aed',
  planBg: '#f5f3ff',
  done: '#15803d',
  doneBg: '#f0fdf4',
  danger: '#b91c1c',
};

const MASTERY = [
  { value: 'Strong', label: '🟢 Strong', bg: '#dcfce7', fg: '#15803d' },
  { value: 'OK', label: '🟡 OK', bg: '#fef9c3', fg: '#a16207' },
  { value: 'Slow', label: '🔴 Slow', bg: '#fee2e2', fg: '#b91c1c' },
];

const HOMEWORK = [
  { value: 'Yes', label: '✅ Done' },
  { value: 'Partial', label: '🟡 Partial' },
  { value: 'No', label: '❌ Not done' },
];

// Display only — the server owns the real window (schedule-helpers.EDIT_WINDOW_DAYS)
// and rejects anything outside it, so this number can only ever be wrong in copy.
const EDIT_WINDOW_DAYS = 14;

function fmtDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-SG', {
    weekday: 'short', day: 'numeric', month: 'short',
  });
}

function addDaysIso(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dayHeading(iso: string, today: string) {
  if (iso === today) return 'Today';
  const d = new Date(`${today}T00:00:00`);
  d.setDate(d.getDate() - 1);
  const yest = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return iso === yest ? 'Yesterday' : fmtDate(iso);
}

export default function LogPage() {
  const [password, setPassword] = useState('');
  const [authed, setAuthed] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [topicsByLevel, setTopicsByLevel] = useState<Record<string, TopicCategory[]>>({});
  const [today, setToday] = useState('');
  const [cutoff, setCutoff] = useState('');
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState('');
  const [toast, setToast] = useState('');
  // Lesson ids logged in THIS session. They stay on screen (he may still want to
  // add a topic) but stop counting as outstanding.
  const [justDone, setJustDone] = useState<Set<string>>(new Set());
  const [openTopics, setOpenTopics] = useState<string | null>(null);
  const [openMore, setOpenMore] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState<Set<string>>(new Set());

  const debounceRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/admin/log-queue');
      const d = await r.json();
      if (d.error) { setApiError(d.error); return; }
      setLessons(d.lessons || []);
      setTopicsByLevel(d.topicsByLevel || {});
      setToday(d.today || '');
      setCutoff(d.cutoff || '');
      setApiError('');
    } catch { setApiError('Connection error'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { ensureAdminSession().then(ok => { if (ok) setAuthed(true); }); }, []);
  useEffect(() => { if (authed) load(); }, [authed, load]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 2600);
    return () => clearTimeout(t);
  }, [toast]);
  // Clear any pending debounced save on unmount so a half-typed note doesn't
  // fire against a torn-down page.
  useEffect(() => () => { for (const t of Object.values(debounceRef.current)) clearTimeout(t); }, []);

  async function verify(pw: string) {
    setAuthLoading(true);
    try {
      if (await loginAdminSession(pw)) setAuthed(true);
      else setAuthError('Incorrect password');
    } catch { setAuthError('Connection error'); }
    finally { setAuthLoading(false); }
  }

  function patchLocal(lessonId: string, patch: Partial<Lesson>) {
    setLessons(prev => prev.map(l => (l.lessonId === lessonId ? { ...l, ...patch } : l)));
  }

  /**
   * Optimistic write. The tap lands instantly; a server error rolls the field
   * back and says why, rather than leaving the UI claiming a save that never
   * happened.
   */
  async function save(
    lessonId: string,
    url: string,
    body: Record<string, unknown>,
    optimistic: Partial<Lesson>,
    rollback: Partial<Lesson>,
    marksLogged: boolean
  ) {
    patchLocal(lessonId, optimistic);
    setSaving(s => new Set(s).add(lessonId));
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.error) {
        patchLocal(lessonId, rollback);
        setToast(d.error || 'Save failed');
        return false;
      }
      if (d.droppedFields?.length) setToast(`Saved, but ${d.droppedFields.join(', ')} is missing from Airtable`);
      if (marksLogged) setJustDone(s => new Set(s).add(lessonId));
      return true;
    } catch {
      patchLocal(lessonId, rollback);
      setToast('Connection error');
      return false;
    } finally {
      setSaving(s => { const n = new Set(s); n.delete(lessonId); return n; });
    }
  }

  function setMastery(l: Lesson, value: string) {
    // Tapping the selected chip clears it — same gesture as LessonModal.
    const next = l.mastery === value ? '' : value;
    save(
      l.lessonId, '/api/admin-schedule/lesson-update',
      { lessonId: l.lessonId, fields: { mastery: next } },
      { mastery: next }, { mastery: l.mastery },
      next !== ''
    );
  }

  function setHomework(l: Lesson, value: string) {
    if (l.homeworkReturned === value) return; // the route rejects an empty value
    save(
      l.lessonId, '/api/admin-schedule/lesson-prev-update',
      { lessonId: l.lessonId, homeworkReturned: value },
      { homeworkReturned: value }, { homeworkReturned: l.homeworkReturned },
      false
    );
  }

  function toggleTopic(l: Lesson, topic: string) {
    const next = l.topics.includes(topic) ? l.topics.filter(t => t !== topic) : [...l.topics, topic];
    save(
      l.lessonId, '/api/admin-schedule/lesson-update',
      // Comma format — the same shape LessonModal writes, so both screens
      // round-trip each other's topics.
      { lessonId: l.lessonId, fields: { topicsCovered: next.join(', ') } },
      { topics: next }, { topics: l.topics },
      next.length > 0
    );
  }

  /** Debounced free-text save (notes, next-lesson plan). */
  function saveText(l: Lesson, key: 'lessonNotes' | 'nextLessonPlan', value: string) {
    patchLocal(l.lessonId, { [key]: value } as Partial<Lesson>);
    const tag = `${l.lessonId}:${key}`;
    clearTimeout(debounceRef.current[tag]);
    debounceRef.current[tag] = setTimeout(() => {
      save(
        l.lessonId, '/api/admin-schedule/lesson-update',
        { lessonId: l.lessonId, fields: { [key]: value } },
        {}, {},
        key === 'lessonNotes' && value.trim() !== ''
      );
    }, 700);
  }

  async function markAttendance(l: Lesson, status: 'Completed' | 'Absent') {
    if (!l.slotId) { setToast('This lesson has no slot — use the schedule page'); return; }
    setSaving(s => new Set(s).add(l.lessonId));
    try {
      const r = await fetch('/api/admin-schedule/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: l.studentId, slotId: l.slotId, date: l.date, status }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.error) { setToast(d.error || 'Save failed'); return; }
      if (status === 'Absent') {
        // Nothing to write up for an absence — it leaves the queue.
        setLessons(prev => prev.filter(x => x.lessonId !== l.lessonId));
        setToast(`${l.studentName} marked absent`);
      } else {
        patchLocal(l.lessonId, { status: 'Completed' });
      }
    } catch { setToast('Connection error'); }
    finally { setSaving(s => { const n = new Set(s); n.delete(l.lessonId); return n; }); }
  }

  // ── Auth gate ───────────────────────────────────────────────────────────────
  if (!authed) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        <form
          onSubmit={e => { e.preventDefault(); verify(password); }}
          style={{ width: '100%', maxWidth: 320, display: 'flex', flexDirection: 'column', gap: 10 }}
        >
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>✏️ Log lessons</h1>
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

  const outstanding = lessons.filter(l => !justDone.has(l.lessonId)).length;

  // Lessons within 3 days of the 14-day edit window closing. The list is
  // newest-first, so without this they'd sit at the bottom and quietly expire —
  // and an expired lesson can never be written up or reported on again.
  const expiring = cutoff ? lessons.filter(l => l.date < addDaysIso(cutoff, 3)) : [];

  // Group by date so the day breaks read like a diary.
  const groups: { date: string; items: Lesson[] }[] = [];
  for (const l of lessons) {
    let g = groups.find(x => x.date === l.date);
    if (!g) { g = { date: l.date, items: [] }; groups.push(g); }
    g.items.push(l);
  }

  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif', maxWidth: 720, margin: '0 auto', padding: '16px 14px 80px', color: C.ink }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 4 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>✏️ Log lessons</h1>
        <a href="/admin" style={{ fontSize: 13, color: '#2563eb', textDecoration: 'none' }}>← Admin</a>
      </div>
      <p style={{ fontSize: 13, color: C.muted, margin: '0 0 16px' }}>
        {loading ? 'Loading…'
          : outstanding === 0
            ? 'Nothing waiting — every lesson in the last 14 days is written up.'
            : `${outstanding} lesson${outstanding === 1 ? '' : 's'} waiting. One tap on mastery logs it.`}
      </p>

      {apiError && (
        <div style={{ padding: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, color: C.danger, fontSize: 14, marginBottom: 14 }}>
          {apiError}
        </div>
      )}

      {expiring.length > 0 && (
        <div style={{ padding: '10px 12px', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 10, fontSize: 13, color: '#92400e', marginBottom: 14 }}>
          ⏳ <b>{expiring.length}</b> lesson{expiring.length === 1 ? '' : 's'} from {fmtDate(expiring[expiring.length - 1].date)} onwards
          fall{expiring.length === 1 ? 's' : ''} out of the {EDIT_WINDOW_DAYS}-day edit window within 3 days —{' '}
          <a href={`#d-${expiring[expiring.length - 1].date}`} style={{ color: '#92400e', fontWeight: 700 }}>jump to them</a>.
        </div>
      )}

      {groups.map(g => (
        <div key={g.date} id={`d-${g.date}`} style={{ marginBottom: 22, scrollMarginTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, color: C.faint, marginBottom: 8 }}>
            {dayHeading(g.date, today)}
          </div>

          {g.items.map(l => {
            const done = justDone.has(l.lessonId) || !!l.mastery;
            const plan = (l.prev?.nextLessonPlan || '').trim();
            const hwSet = (l.prev?.homeworkAssigned || '').trim();
            const cats = topicsByLevel[l.level] || [];
            const showTopics = openTopics === l.lessonId;
            const showMore = openMore.has(l.lessonId);

            return (
              <div
                key={l.lessonId}
                style={{
                  border: `1px solid ${done ? '#bbf7d0' : C.border}`,
                  background: done ? C.doneBg : '#fff',
                  borderRadius: 14, padding: 14, marginBottom: 10,
                }}
              >
                {/* Who / when */}
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 17, fontWeight: 700 }}>
                    {l.studentName}{' '}
                    <span style={{ fontSize: 12, fontWeight: 500, color: C.faint }}>{l.level}</span>
                  </div>
                  <div style={{ fontSize: 12, color: C.muted }}>
                    {l.slotLabel || fmtDate(l.date)}
                    {l.type && l.type !== 'Regular' ? ` · ${l.type}` : ''}
                    {done ? <span style={{ color: C.done, fontWeight: 700 }}> · ✓ logged</span> : ''}
                    {saving.has(l.lessonId) ? <span style={{ color: C.faint }}> · saving…</span> : ''}
                  </div>
                </div>

                {/* What you planned to do — the reason this is one tap and not typing */}
                {plan && (
                  <div style={{ marginTop: 8, padding: '8px 10px', background: C.planBg, borderRadius: 9, fontSize: 13, color: '#5b21b6' }}>
                    📌 Planned: {plan}
                    {!l.topics.length && (
                      <button
                        onClick={() => toggleTopic(l, plan)}
                        style={{ marginLeft: 8, padding: '2px 8px', fontSize: 12, fontWeight: 700, borderRadius: 999, border: `1px solid ${C.plan}`, background: '#fff', color: C.plan, cursor: 'pointer' }}
                      >
                        Use as topic
                      </button>
                    )}
                  </div>
                )}

                {/* Attendance — only when it was never marked */}
                {l.status === 'Scheduled' && (
                  <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, color: C.muted, minWidth: 74 }}>Attendance</span>
                    <button onClick={() => markAttendance(l, 'Completed')} style={pill(false)}>✅ Attended</button>
                    <button onClick={() => markAttendance(l, 'Absent')} style={pill(false)}>🚫 Absent</button>
                  </div>
                )}

                {/* The one tap that matters */}
                <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, color: C.muted, minWidth: 74 }}>How was it</span>
                  {MASTERY.map(m => (
                    <button
                      key={m.value}
                      onClick={() => setMastery(l, m.value)}
                      style={{
                        ...pill(l.mastery === m.value),
                        ...(l.mastery === m.value ? { background: m.bg, color: m.fg, borderColor: m.fg } : {}),
                      }}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>

                {/* Homework that was set last time */}
                <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, color: C.muted, minWidth: 74 }}>Homework</span>
                  {HOMEWORK.map(h => (
                    <button key={h.value} onClick={() => setHomework(l, h.value)} style={pill(l.homeworkReturned === h.value)}>
                      {h.label}
                    </button>
                  ))}
                  {hwSet && (
                    <span style={{ fontSize: 12, color: C.faint, width: '100%' }}>
                      set {fmtDate(l.prev!.date)}: {hwSet.slice(0, 90)}
                    </span>
                  )}
                </div>

                {/* Topics */}
                <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, color: C.muted, minWidth: 74 }}>Topics</span>
                  {l.topics.map(t => (
                    <button key={t} onClick={() => toggleTopic(l, t)} style={{ ...pill(true), background: '#eff6ff', color: '#1d4ed8', borderColor: '#bfdbfe' }}>
                      {t} ✕
                    </button>
                  ))}
                  {cats.length > 0 && (
                    <button onClick={() => setOpenTopics(showTopics ? null : l.lessonId)} style={{ ...pill(false), color: C.muted }}>
                      {showTopics ? '− close' : '+ add'}
                    </button>
                  )}
                </div>

                {showTopics && (
                  <div style={{ marginTop: 8, maxHeight: 260, overflowY: 'auto', border: `1px solid ${C.border}`, borderRadius: 10, padding: 10 }}>
                    {cats.map(cat => (
                      <div key={cat.label} style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: C.faint, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5 }}>{cat.label}</div>
                        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                          {cat.topics.map(t => (
                            <button key={t} onClick={() => toggleTopic(l, t)} style={pill(l.topics.includes(t))}>{t}</button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Everything optional lives behind one tap so the card stays short */}
                <button
                  onClick={() => setOpenMore(s => { const n = new Set(s); n.has(l.lessonId) ? n.delete(l.lessonId) : n.add(l.lessonId); return n; })}
                  style={{ marginTop: 10, padding: 0, border: 'none', background: 'none', color: C.muted, fontSize: 12, cursor: 'pointer' }}
                >
                  {showMore ? '− fewer' : '+ note & next plan'}
                </button>

                {showMore && (
                  <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <textarea
                      value={l.lessonNotes}
                      onChange={e => saveText(l, 'lessonNotes', e.target.value)}
                      placeholder="Lesson note (parents never see this verbatim)"
                      rows={2}
                      style={textarea}
                    />
                    <textarea
                      value={l.nextLessonPlan}
                      onChange={e => saveText(l, 'nextLessonPlan', e.target.value)}
                      placeholder="📌 Start next lesson with… (shows on the kiosk when they arrive)"
                      rows={2}
                      style={{ ...textarea, borderColor: '#ddd6fe', background: C.planBg }}
                    />
                    <a href={`/admin/students/${l.studentId}`} style={{ fontSize: 12, color: '#2563eb', textDecoration: 'none' }}>
                      Open {l.studentName}&rsquo;s profile ↗
                    </a>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}

      {!loading && lessons.length === 0 && !apiError && (
        <div style={{ padding: '40px 16px', textAlign: 'center', color: C.faint, fontSize: 15 }}>
          🎉 All caught up.
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

// Touch targets stay ≥34px high — this is used one-handed.
function pill(active: boolean): React.CSSProperties {
  return {
    padding: '7px 12px',
    fontSize: 13,
    fontWeight: 600,
    borderRadius: 999,
    border: `1px solid ${active ? '#111827' : '#e5e7eb'}`,
    background: active ? '#111827' : '#fff',
    color: active ? '#fff' : '#374151',
    cursor: 'pointer',
    lineHeight: 1.2,
  };
}

const textarea: React.CSSProperties = {
  width: '100%',
  padding: '9px 11px',
  fontSize: 14,
  fontFamily: 'inherit',
  border: '1px solid #e5e7eb',
  borderRadius: 10,
  resize: 'vertical',
};
