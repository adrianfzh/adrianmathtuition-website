'use client';

// /admin/prep — the two-minute walk-in card.
//
// One student at a time: what was planned for today, what happened last lesson,
// homework due back, upcoming exams, where recent papers bled marks, and a few
// bank questions aimed at exactly those topics. Reads /api/admin/prep and owns
// no writes — logging stays on /admin/log, marking on /admin/mark-paper.
//
// Print is a first-class path (🖨 → one clean sheet to have beside the desk),
// so the controls row is .no-print and the card avoids anything interactive.

import { useState, useEffect, useCallback } from 'react';
import { ensureAdminSession, loginAdminSession } from '@/lib/admin-client';
import StudentPicker from '@/components/StudentPicker';

type TodayStudent = {
  lessonId: string; studentId: string; name: string; level: string;
  time: string; slotLabel: string; type: string; status: string;
};

type Topic = { topic: string; awarded: number; max: number; lost: number; pct: number; questions: number };

type PrepCard = {
  student: { id: string; name: string; level: string; subjects: string[]; subjectLevel: string; status: string };
  nextLesson: { date: string; isToday: boolean; slotLabel: string; type: string } | null;
  lastLogged: {
    id: string; date: string; topics: string[]; mastery: string; mood: string;
    lessonNotes: string; homeworkAssigned: string; homeworkReturned: string; nextPlan: string;
  } | null;
  recent: { date: string; topics: string[]; mastery: string }[];
  exams: { id: string; examType: string; customName: string; subject: string; examDate: string; testedTopics: string }[];
  papers: {
    id: string; date: string; name: string; awarded: number; max: number;
    pct: number | null; pending: number; released: boolean; topics: Topic[];
  }[];
  focus: Topic[];
  suggestions: {
    topic: string; bankTopic: string | null;
    questions: { id: string; school: string; year: string; paper: string; questionNumber: string; marks: number | null; text: string; answer: string }[];
  }[];
};

const C = {
  border: '#e5e7eb',
  muted: '#6b7280',
  faint: '#9ca3af',
  ink: '#111827',
  link: '#2563eb',
  plan: '#92400e',
  planBg: '#fffbeb',
  planBorder: '#fcd34d',
};

function scoreColour(pct: number | null) {
  if (pct === null) return C.muted;
  if (pct >= 80) return '#15803d';
  if (pct >= 60) return '#a16207';
  return '#b91c1c';
}

function masteryBadge(m: string) {
  if (m === 'Strong') return '🟢 Strong';
  if (m === 'OK') return '🟡 OK';
  if (m === 'Slow') return '🔴 Slow';
  return m;
}

function fmtDate(iso: string) {
  if (!iso) return '';
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: '2-digit' });
}

function daysUntil(iso: string) {
  const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const target = new Date(`${iso}T00:00:00`);
  return Math.round((midnight(target) - midnight(new Date())) / 86400000);
}

function daysAwayLabel(iso: string) {
  const n = daysUntil(iso);
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  return `in ${n} days`;
}

const card: React.CSSProperties = {
  border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px',
  display: 'flex', flexDirection: 'column', gap: 8,
};
const h2: React.CSSProperties = { fontSize: 13, fontWeight: 700, margin: 0, color: C.ink };
const chip: React.CSSProperties = {
  display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 12,
  background: '#f3f4f6', color: '#374151',
};

export default function PrepPage() {
  const [password, setPassword] = useState('');
  const [authed, setAuthed] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  const [today, setToday] = useState<TodayStudent[] | null>(null);
  const [selected, setSelected] = useState('');
  const [data, setData] = useState<PrepCard | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { ensureAdminSession().then(ok => { if (ok) setAuthed(true); }); }, []);

  useEffect(() => {
    if (!authed) return;
    // Deep-linkable: /admin/prep?id=recXXX (student profile can point here).
    const id = new URLSearchParams(window.location.search).get('id');
    if (id) setSelected(id);
    fetch('/api/admin/prep')
      .then(r => r.json())
      .then(d => setToday(d.students || []))
      .catch(() => setToday([]));
  }, [authed]);

  const load = useCallback(async (id: string) => {
    if (!id) { setData(null); return; }
    setLoading(true);
    setError('');
    try {
      const r = await fetch(`/api/admin/prep?id=${encodeURIComponent(id)}`);
      const d = await r.json();
      if (!r.ok || d.error) { setError(d.error || 'Failed to load'); setData(null); return; }
      setData(d);
    } catch { setError('Connection error'); setData(null); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (authed) load(selected); }, [authed, selected, load]);

  async function verify(pw: string) {
    setAuthLoading(true);
    try {
      if (await loginAdminSession(pw)) setAuthed(true);
      else setAuthError('Incorrect password');
    } catch { setAuthError('Connection error'); }
    finally { setAuthLoading(false); }
  }

  // ── Auth gate ───────────────────────────────────────────────────────────────
  if (!authed) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        <form
          onSubmit={e => { e.preventDefault(); verify(password); }}
          style={{ width: '100%', maxWidth: 320, display: 'flex', flexDirection: 'column', gap: 10 }}
        >
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>🎯 Lesson prep</h1>
          <input
            type="password" value={password} onChange={e => setPassword(e.target.value)}
            placeholder="Admin password" autoFocus
            style={{ padding: '12px 14px', fontSize: 16, border: `1px solid ${C.border}`, borderRadius: 10 }}
          />
          <button
            type="submit" disabled={authLoading || !password}
            style={{ padding: '12px 14px', fontSize: 16, fontWeight: 600, border: 'none', borderRadius: 10, background: C.ink, color: '#fff', opacity: authLoading || !password ? 0.6 : 1 }}
          >
            {authLoading ? 'Checking…' : 'Enter'}
          </button>
          {authError && <div style={{ color: '#b91c1c', fontSize: 14 }}>{authError}</div>}
        </form>
      </div>
    );
  }

  const s = data?.student;
  const last = data?.lastLogged ?? null;
  // `Homework Returned` is written onto a lesson only when the NEXT one gets
  // logged — so on the latest logged lesson, empty + assigned = due back today.
  const hwDueBack = !!last?.homeworkAssigned && !last?.homeworkReturned;

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '16px 14px 60px', fontFamily: 'system-ui, -apple-system, sans-serif', color: C.ink }}>
      <style>{`@media print { .no-print { display: none !important; } body { background: #fff; } }`}</style>

      {/* ── Controls (never printed) ── */}
      <div className="no-print" style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, flex: 1 }}>🎯 Lesson prep</h1>
          <StudentPicker
            value={selected}
            onChange={id => setSelected(id)}
            placeholder="Pick a student…"
            style={{ padding: '8px 10px', fontSize: 15, border: `1px solid ${C.border}`, borderRadius: 10, maxWidth: 230 }}
          />
          {data && (
            <button
              onClick={() => window.print()}
              style={{ padding: '8px 12px', fontSize: 14, border: `1px solid ${C.border}`, borderRadius: 10, background: '#fff', cursor: 'pointer' }}
            >
              🖨 Print
            </button>
          )}
        </div>
        {today === null ? (
          <div style={{ fontSize: 13, color: C.faint }}>Loading today…</div>
        ) : today.length === 0 ? (
          <div style={{ fontSize: 13, color: C.faint }}>No lessons today.</div>
        ) : (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: C.muted }}>Today:</span>
            {today.map(t => (
              <button
                key={t.lessonId}
                onClick={() => setSelected(t.studentId)}
                style={{
                  padding: '6px 12px', borderRadius: 999, fontSize: 13, cursor: 'pointer',
                  border: `1px solid ${t.studentId === selected ? C.ink : C.border}`,
                  background: t.studentId === selected ? C.ink : '#fff',
                  color: t.studentId === selected ? '#fff' : C.ink,
                }}
              >
                {t.name}
                <span style={{ marginLeft: 6, fontSize: 11, color: t.studentId === selected ? '#d1d5db' : C.faint }}>{t.time || t.type}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {error && <div style={{ color: '#b91c1c', fontSize: 14, marginBottom: 12 }}>{error}</div>}
      {loading && <div style={{ color: C.faint, fontSize: 14 }}>Loading card…</div>}
      {!loading && !data && !error && (
        <div style={{ color: C.faint, fontSize: 14 }}>Pick a student to see their prep card.</div>
      )}

      {!loading && data && s && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* ── Who + when ── */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{s.name}</h2>
            <span style={{ fontSize: 13, color: C.muted }}>
              {s.level}{s.subjectLevel ? ` · ${s.subjectLevel}` : ''}{s.subjects.length ? ` · ${s.subjects.join(', ')}` : ''}
              {s.status === 'Trial' ? ' · 🌱 Trial' : ''}
            </span>
            <span style={{ fontSize: 13, color: data.nextLesson?.isToday ? '#15803d' : C.muted, fontWeight: data.nextLesson?.isToday ? 600 : 400 }}>
              {data.nextLesson
                ? `${data.nextLesson.isToday ? 'Today' : fmtDate(data.nextLesson.date)} · ${data.nextLesson.slotLabel}${data.nextLesson.type !== 'Regular' ? ` · ${data.nextLesson.type}` : ''}`
                : 'No upcoming lesson'}
            </span>
          </div>

          {/* ── Planned for today ── */}
          <div style={{ ...card, background: C.planBg, borderColor: C.planBorder }}>
            <h3 style={{ ...h2, color: C.plan }}>📌 Planned for this lesson</h3>
            {last?.nextPlan ? (
              <div style={{ fontSize: 15, whiteSpace: 'pre-wrap' }}>{last.nextPlan}</div>
            ) : (
              <div style={{ fontSize: 13, color: C.muted }}>No plan was written at the last lesson.</div>
            )}
            {hwDueBack && (
              <div style={{ fontSize: 13, color: C.plan }}>📥 Homework due back: {last!.homeworkAssigned}</div>
            )}
          </div>

          {/* ── Last lesson ── */}
          <div style={card}>
            <h3 style={h2}>⏪ Last lesson{last ? ` · ${fmtDate(last.date)}` : ''}</h3>
            {!last ? (
              <div style={{ fontSize: 13, color: C.faint }}>Nothing logged yet.</div>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  {last.topics.map((t, i) => <span key={i} style={chip}>{t}</span>)}
                  {last.mastery && <span style={{ fontSize: 13 }}>{masteryBadge(last.mastery)}</span>}
                  {last.mood && <span style={{ fontSize: 13, color: C.muted }}>{last.mood}</span>}
                </div>
                {last.homeworkAssigned && (
                  <div style={{ fontSize: 13 }}>
                    📚 Set: {last.homeworkAssigned}
                    {last.homeworkReturned && <span style={{ color: C.muted }}> · returned: {last.homeworkReturned}</span>}
                  </div>
                )}
                {last.lessonNotes && <div style={{ fontSize: 13, color: C.muted, whiteSpace: 'pre-wrap' }}>{last.lessonNotes}</div>}
              </>
            )}
            {data.recent.length > 0 && (
              <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
                {data.recent.map((r, i) => (
                  <div key={i} style={{ fontSize: 12, color: C.muted }}>
                    {fmtDate(r.date)} — {r.topics.join(', ') || '(no topics)'}
                    {r.mastery ? ` · ${masteryBadge(r.mastery)}` : ''}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Upcoming exams ── */}
          {data.exams.length > 0 && (
            <div style={card}>
              <h3 style={h2}>🗓 Upcoming exams</h3>
              {data.exams.map(e => (
                <div key={e.id} style={{ fontSize: 13 }}>
                  <strong>{daysAwayLabel(e.examDate)}</strong> · {fmtDate(e.examDate)} — {e.customName || e.examType}{e.subject ? ` (${e.subject})` : ''}
                  {e.testedTopics && <div style={{ color: C.muted, marginTop: 2 }}>{e.testedTopics}</div>}
                </div>
              ))}
            </div>
          )}

          {/* ── Focus topics + papers ── */}
          <div style={card}>
            <h3 style={h2}>🎯 Focus topics <span style={{ fontWeight: 400, color: C.faint }}>(from marked papers)</span></h3>
            {data.focus.length === 0 ? (
              <div style={{ fontSize: 13, color: C.faint }}>
                {data.papers.length === 0 ? 'No marked papers yet.' : 'No weak topics across recent papers 🎉'}
              </div>
            ) : (
              data.focus.map(t => (
                <div key={t.topic} style={{ fontSize: 13 }}>
                  <strong>{t.topic}</strong>
                  <span style={{ color: scoreColour(t.pct) }}> · {t.pct}%</span>
                  <span style={{ color: C.muted }}> · {t.lost} mark{t.lost === 1 ? '' : 's'} lost over {t.questions} question{t.questions === 1 ? '' : 's'}</span>
                </div>
              ))
            )}
            {data.papers.length > 0 && (
              <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {data.papers.map(p => (
                  <div key={p.id} style={{ fontSize: 12, color: C.muted, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
                    <span style={{ color: scoreColour(p.pct), fontWeight: 600 }}>{p.awarded}/{p.max}{p.pct !== null ? ` (${p.pct}%)` : ''}</span>
                    <span>{p.name}</span>
                    <span style={{ color: C.faint }}>{fmtDate(p.date)}</span>
                    {p.pending > 0 && <span style={{ color: '#a16207' }}>⚠ {p.pending} to review</span>}
                    {!p.released && <span style={{ color: C.faint }}>unreleased</span>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Suggested practice ── */}
          {data.suggestions.some(sg => sg.questions.length > 0) && (
            <div style={card}>
              <h3 style={h2}>✏️ Suggested practice</h3>
              {data.suggestions.map(sg => (
                <div key={sg.topic} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                    {sg.topic}
                    {sg.bankTopic && sg.bankTopic !== sg.topic && <span style={{ fontWeight: 400 }}> (bank: {sg.bankTopic})</span>}
                  </div>
                  {sg.questions.length === 0 ? (
                    <div style={{ fontSize: 12, color: C.faint }}>No matching bank questions.</div>
                  ) : (
                    sg.questions.map(q => (
                      <div key={q.id} style={{ fontSize: 13, borderLeft: `3px solid ${C.border}`, paddingLeft: 10 }}>
                        <div style={{ color: C.faint, fontSize: 11, marginBottom: 2 }}>
                          {[q.school, q.year, q.paper, q.questionNumber ? `Q${q.questionNumber}` : ''].filter(Boolean).join(' · ')}
                          {q.marks ? ` · ${q.marks} marks` : ''}
                        </div>
                        <div style={{ whiteSpace: 'pre-wrap' }}>{q.text}</div>
                        {q.answer && <div style={{ color: C.muted, fontSize: 12, marginTop: 2, fontStyle: 'italic' }}>Ans: {q.answer}</div>}
                      </div>
                    ))
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
