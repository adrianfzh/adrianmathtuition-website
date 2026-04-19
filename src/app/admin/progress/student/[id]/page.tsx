'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Student {
  id: string;
  name: string;
  level: string;
  subjects: string[];
  subjectLevel: string;
  parentEmail: string;
  parentName: string;
}

interface Lesson {
  id: string;
  date: string;
  status: string;
  type: string;
  topicsCovered: string;
  homeworkAssigned: string;
  homeworkCompletion: string;
  masteryRatings: string;
  mood: string;
  lessonNotes: string;
  progressLogged: boolean;
}

interface MasteryRating { subject: string; topic: string; rating: number }

// ─── Cookie helper ─────────────────────────────────────────────────────────────

function getCookie(name: string): string {
  if (typeof document === 'undefined') return '';
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : '';
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' });
}

function parseMasteryRatings(raw: string): MasteryRating[] {
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

function parseTopicsCovered(raw: string): string[] {
  if (!raw) return [];
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

const HW_BADGE: Record<string, { label: string; cls: string }> = {
  'Fully Done':     { label: '✓ Done',     cls: 'bg-green-100 text-green-700' },
  'Partially Done': { label: '~ Partial',  cls: 'bg-yellow-100 text-yellow-700' },
  'Not Done':       { label: '✗ Not Done', cls: 'bg-red-100 text-red-700' },
  'Not Set':        { label: '— N/A',      cls: 'bg-slate-100 text-slate-500' },
};

function moodEmoji(mood: string): string {
  return mood.split(' ')[0] || '';
}

// ─── Timeline tab ──────────────────────────────────────────────────────────────

function TimelineTab({ lessons }: { lessons: Lesson[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (lessons.length === 0) {
    return <p className="text-sm text-slate-400 text-center py-12">No lessons recorded yet</p>;
  }

  return (
    <div className="space-y-2">
      {lessons.map(lesson => {
        const expanded = expandedId === lesson.id;
        const hw = HW_BADGE[lesson.homeworkCompletion] ?? HW_BADGE['Not Set'];
        const topics = parseTopicsCovered(lesson.topicsCovered);

        return (
          <div key={lesson.id} className="bg-white rounded-xl border border-slate-100 overflow-hidden">
            <button
              className="w-full text-left px-4 py-3 active:bg-slate-50"
              onClick={() => setExpandedId(expanded ? null : lesson.id)}
            >
              <div className="flex items-center gap-3">
                <span className="text-lg">{moodEmoji(lesson.mood)}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-slate-900">{formatDate(lesson.date)}</span>
                    {lesson.homeworkCompletion && lesson.homeworkCompletion !== 'Not Set' && (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${hw.cls}`}>{hw.label}</span>
                    )}
                    {!lesson.progressLogged && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-400">not logged</span>
                    )}
                  </div>
                  {topics.length > 0 && (
                    <p className="text-xs text-slate-500 mt-0.5 truncate">
                      {topics.slice(0, 3).join(', ')}{topics.length > 3 ? ` +${topics.length - 3}` : ''}
                    </p>
                  )}
                </div>
                <svg className={`w-4 h-4 text-slate-300 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </button>

            {expanded && (
              <div className="border-t border-slate-100 px-4 py-3 space-y-3 bg-slate-50">
                {lesson.mood && (
                  <div>
                    <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-0.5">Mood</div>
                    <p className="text-sm text-slate-700">{lesson.mood}</p>
                  </div>
                )}
                {topics.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Topics</div>
                    <div className="flex flex-wrap gap-1.5">
                      {topics.map(t => (
                        <span key={t} className="px-2 py-1 text-xs rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">{t}</span>
                      ))}
                    </div>
                  </div>
                )}
                {lesson.masteryRatings && (
                  <div>
                    <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Mastery</div>
                    <div className="space-y-1">
                      {parseMasteryRatings(lesson.masteryRatings).map((r, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <span className="text-xs text-slate-600 flex-1 min-w-0 truncate">{r.topic}</span>
                          <div className="flex gap-0.5 shrink-0">
                            {[1,2,3,4,5].map(n => (
                              <span key={n} className={`w-5 h-5 rounded-full text-xs flex items-center justify-center font-bold ${
                                n <= r.rating
                                  ? n <= 2 ? 'bg-red-400 text-white' : n === 3 ? 'bg-yellow-400 text-white' : 'bg-green-500 text-white'
                                  : 'bg-slate-100 text-slate-300'
                              }`}>{n}</span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {lesson.homeworkAssigned && (
                  <div>
                    <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-0.5">Homework Set</div>
                    <p className="text-sm text-slate-700">{lesson.homeworkAssigned}</p>
                  </div>
                )}
                {lesson.homeworkCompletion && (
                  <div>
                    <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-0.5">Homework Completion</div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${hw.cls}`}>{hw.label}</span>
                  </div>
                )}
                {lesson.lessonNotes && (
                  <div>
                    <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-0.5">Notes</div>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">{lesson.lessonNotes}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function StudentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const savedPw = useRef('');

  const [id, setId] = useState('');
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  const [student, setStudent] = useState<Student | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    params.then(p => setId(p.id));
  }, [params]);

  useEffect(() => {
    const pw = getCookie('progress_pw') || getCookie('admin_pw');
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

  useEffect(() => {
    if (!authed || !id || !savedPw.current) return;
    setLoading(true);
    const headers = { Authorization: `Bearer ${savedPw.current}` };
    Promise.all([
      fetch(`/api/admin/progress/students`, { headers }).then(r => r.json()),
      fetch(`/api/admin/progress/students/${id}/lessons`, { headers }).then(r => r.json()),
    ]).then(([studentsJson, lessonsJson]) => {
      setStudent(studentsJson.students?.find((s: Student) => s.id === id) ?? null);
      setLessons(lessonsJson.lessons ?? []);
    }).finally(() => setLoading(false));
  }, [authed, id]);

  // ── Auth ──
  if (!authed) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
          <h1 className="text-lg font-semibold text-slate-900 mb-4">Student Progress</h1>
          <form onSubmit={handleLogin} className="space-y-3">
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="Password" autoFocus
              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            {authError && <p className="text-sm text-red-500">{authError}</p>}
            <button type="submit" disabled={authLoading}
              className="w-full bg-indigo-600 text-white font-semibold py-3 rounded-xl text-sm disabled:opacity-60">
              {authLoading ? 'Checking…' : 'Login'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 shadow-sm">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => router.back()}
            className="p-2 text-slate-400 hover:text-slate-600 min-h-[44px] min-w-[44px] flex items-center justify-center">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex-1 min-w-0">
            {loading ? (
              <div className="h-5 bg-slate-100 rounded w-32 animate-pulse" />
            ) : (
              <>
                <h1 className="text-lg font-semibold text-slate-900 truncate">{student?.name ?? 'Student'}</h1>
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {student?.level && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">{student.level}</span>
                  )}
                  {student?.subjects.map(s => (
                    <span key={s} className="px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700">{s}</span>
                  ))}
                </div>
              </>
            )}
          </div>
          {student?.parentEmail && (
            <div className="flex gap-1 shrink-0">
              <a href={`mailto:${student.parentEmail}`}
                className="p-2 text-slate-400 hover:text-indigo-600 min-h-[44px] min-w-[44px] flex items-center justify-center">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Timeline */}
      <div className="max-w-lg mx-auto px-4 pt-4">
        {loading
          ? <p className="text-sm text-slate-400 text-center py-12">Loading…</p>
          : <TimelineTab lessons={lessons} />
        }
      </div>
    </div>
  );
}
