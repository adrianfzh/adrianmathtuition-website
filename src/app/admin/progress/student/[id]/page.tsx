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

interface Exam {
  id: string;
  examType: string;
  customName: string;
  subject: string;
  examDate: string;
  testedTopics: string;
  resultScore: number | null;
  resultTotal: number | null;
  resultGrade: string;
  resultNotes: string;
  createdAt: string;
}

interface MasteryRating { subject: string; topic: string; rating: number }

// ─── Cookie helpers ────────────────────────────────────────────────────────────

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

function isUpcoming(iso: string): boolean {
  if (!iso) return false;
  return iso >= new Date().toISOString().split('T')[0];
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

// ─── Exam checklist computation ───────────────────────────────────────────────

type TopicState = 'Untaught' | 'Taught' | 'Weak' | 'Strong';

function computeTopicStates(
  testedTopics: string[],
  subject: string,
  lessons: Lesson[]
): Record<string, { state: TopicState; lastDate: string; lastRating: number | null }> {
  const result: Record<string, { state: TopicState; lastDate: string; lastRating: number | null }> = {};

  for (const topic of testedTopics) {
    const prefix = `${subject}: ${topic}`;
    let lastDate = '';
    let lastRating: number | null = null;
    let everTaught = false;

    // Lessons are sorted desc by date already
    for (const lesson of lessons) {
      const covered = parseTopicsCovered(lesson.topicsCovered);
      if (covered.includes(prefix)) {
        if (!lastDate) lastDate = lesson.date;
        everTaught = true;
      }
      // Find rating for this topic in this lesson
      const ratings = parseMasteryRatings(lesson.masteryRatings);
      const match = ratings.find(r => r.subject === subject && r.topic === topic);
      if (match && lastRating === null) {
        lastRating = match.rating;
      }
      if (everTaught && lastRating !== null) break;
    }

    let state: TopicState;
    if (!everTaught) {
      state = 'Untaught';
    } else if (lastRating === null) {
      state = 'Taught';
    } else if (lastRating < 3) {
      state = 'Weak';
    } else {
      state = 'Strong';
    }

    result[topic] = { state, lastDate, lastRating };
  }

  return result;
}

const STATE_STYLE: Record<TopicState, { bg: string; text: string; dot: string }> = {
  Untaught: { bg: 'bg-slate-100', text: 'text-slate-500', dot: 'bg-slate-400' },
  Taught:   { bg: 'bg-yellow-50', text: 'text-yellow-700', dot: 'bg-yellow-400' },
  Weak:     { bg: 'bg-orange-50', text: 'text-orange-700', dot: 'bg-orange-400' },
  Strong:   { bg: 'bg-green-50',  text: 'text-green-700',  dot: 'bg-green-500' },
};

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

// ─── Exam checklist card ────────────────────────────────────────────────────────

function ExamChecklist({ exam, lessons }: { exam: Exam; lessons: Lesson[] }) {
  const [expandedTopic, setExpandedTopic] = useState<string | null>(null);
  const testedTopics = exam.testedTopics.split(',').map(s => s.trim()).filter(Boolean);

  if (testedTopics.length === 0) {
    return <p className="text-sm text-slate-400 italic mt-3">No tested topics added yet</p>;
  }

  const states = computeTopicStates(testedTopics, exam.subject, lessons);
  const counts = { Strong: 0, Weak: 0, Taught: 0, Untaught: 0 };
  for (const { state } of Object.values(states)) counts[state]++;

  return (
    <div className="mt-4">
      {/* Summary */}
      <div className="flex flex-wrap gap-3 text-xs font-medium mb-3">
        {counts.Strong > 0 && <span className="text-green-600">{counts.Strong} Strong</span>}
        {counts.Weak > 0 && <span className="text-orange-600">{counts.Weak} Weak</span>}
        {counts.Taught > 0 && <span className="text-yellow-600">{counts.Taught} Taught</span>}
        {counts.Untaught > 0 && <span className="text-slate-400">{counts.Untaught} Untaught</span>}
      </div>

      {/* Topic rows */}
      <div className="space-y-1.5">
        {testedTopics.map(topic => {
          const { state, lastDate, lastRating } = states[topic] ?? { state: 'Untaught', lastDate: '', lastRating: null };
          const style = STATE_STYLE[state];
          const isExpanded = expandedTopic === topic;
          return (
            <div key={topic}>
              <button
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg ${style.bg} active:opacity-80`}
                onClick={() => setExpandedTopic(isExpanded ? null : topic)}
              >
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${style.dot}`} />
                <span className={`text-sm font-medium flex-1 text-left ${style.text}`}>{topic}</span>
                <span className={`text-xs ${style.text} opacity-70`}>{state}</span>
              </button>
              {isExpanded && (
                <div className="ml-5 mt-1 px-3 py-2 bg-white border border-slate-100 rounded-lg text-xs text-slate-500 space-y-0.5">
                  {lastDate ? <p>Last taught: {formatDate(lastDate)}</p> : <p>Never taught</p>}
                  {lastRating !== null && <p>Latest rating: {lastRating} / 5</p>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Exams tab ─────────────────────────────────────────────────────────────────

function ExamsTab({
  studentId,
  exams,
  lessons,
  onRefresh,
}: {
  studentId: string;
  exams: Exam[];
  lessons: Lesson[];
  onRefresh: () => void;
}) {
  const router = useRouter();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const upcoming = exams.filter(e => isUpcoming(e.examDate)).sort((a, b) => a.examDate.localeCompare(b.examDate));
  const past = exams.filter(e => !isUpcoming(e.examDate)).sort((a, b) => b.examDate.localeCompare(a.examDate));

  function examLabel(exam: Exam): string {
    return exam.examType === 'Custom' ? exam.customName || 'Custom' : exam.examType;
  }

  function strongCount(exam: Exam): number {
    const topics = exam.testedTopics.split(',').map(s => s.trim()).filter(Boolean);
    if (!topics.length) return 0;
    const states = computeTopicStates(topics, exam.subject, lessons);
    return Object.values(states).filter(s => s.state === 'Strong').length;
  }

  function renderExam(exam: Exam) {
    const expanded = expandedId === exam.id;
    const sc = strongCount(exam);
    const total = exam.testedTopics.split(',').map(s => s.trim()).filter(Boolean).length;

    return (
      <div key={exam.id} className="bg-white rounded-xl border border-slate-100 overflow-hidden">
        <button
          className="w-full text-left px-4 py-3 active:bg-slate-50"
          onClick={() => setExpandedId(expanded ? null : exam.id)}
        >
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-slate-900">{examLabel(exam)}</span>
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700">{exam.subject}</span>
                {exam.resultGrade && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700">{exam.resultGrade}</span>
                )}
              </div>
              <div className="flex items-center gap-3 mt-0.5">
                <span className="text-xs text-slate-400">{formatDate(exam.examDate)}</span>
                {total > 0 && (
                  <span className="text-xs text-slate-500">{sc}/{total} Strong</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={e => { e.stopPropagation(); router.push(`/admin/progress/student/${studentId}/exam/${exam.id}`); }}
                className="text-xs text-indigo-500 px-2 py-1 rounded-lg hover:bg-indigo-50 active:bg-indigo-100 min-h-[36px]"
              >
                Edit
              </button>
              <svg className={`w-4 h-4 text-slate-300 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
        </button>

        {expanded && (
          <div className="border-t border-slate-100 px-4 py-3 bg-slate-50">
            {exam.resultScore != null && exam.resultTotal != null && (
              <p className="text-sm text-slate-600 mb-2">Score: {exam.resultScore}/{exam.resultTotal}</p>
            )}
            {exam.resultNotes && (
              <p className="text-sm text-slate-600 mb-2">{exam.resultNotes}</p>
            )}
            <ExamChecklist exam={exam} lessons={lessons} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <button
        onClick={() => router.push(`/admin/progress/student/${studentId}/exam/new`)}
        className="w-full bg-indigo-600 text-white font-semibold py-3 rounded-xl text-sm active:bg-indigo-700"
      >
        + Add Exam
      </button>

      {exams.length === 0 && (
        <p className="text-sm text-slate-400 text-center py-6">No exams added yet</p>
      )}

      {upcoming.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Upcoming</div>
          <div className="space-y-2">{upcoming.map(renderExam)}</div>
        </div>
      )}

      {past.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Past</div>
          <div className="space-y-2">{past.map(renderExam)}</div>
        </div>
      )}
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function StudentDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { id } = params;
  const savedPw = useRef('');

  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  const [student, setStudent] = useState<Student | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<'timeline' | 'exams'>('timeline');

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

  async function loadData(pw: string) {
    setLoading(true);
    try {
      const headers = { Authorization: `Bearer ${pw}` };
      const [studentsRes, lessonsRes, examsRes] = await Promise.all([
        fetch(`/api/admin/progress/students`, { headers }),
        fetch(`/api/admin/progress/students/${id}/lessons`, { headers }),
        fetch(`/api/admin/progress/students/${id}/exams`, { headers }),
      ]);
      const [studentsJson, lessonsJson, examsJson] = await Promise.all([
        studentsRes.json(), lessonsRes.json(), examsRes.json(),
      ]);
      const found = studentsJson.students?.find((s: Student) => s.id === id) ?? null;
      setStudent(found);
      setLessons(lessonsJson.lessons ?? []);
      setExams(examsJson.exams ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (authed && savedPw.current) loadData(savedPw.current);
  }, [authed]);

  async function refreshExams() {
    const res = await fetch(`/api/admin/progress/students/${id}/exams`, {
      headers: { Authorization: `Bearer ${savedPw.current}` },
    });
    const json = await res.json();
    setExams(json.exams ?? []);
  }

  // ── Auth ──
  if (!authed) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
          <h1 className="text-lg font-semibold text-slate-900 mb-4">Student Progress</h1>
          <form onSubmit={handleLogin} className="space-y-3">
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Password"
              autoFocus
              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
            {authError && <p className="text-sm text-red-500">{authError}</p>}
            <button type="submit" disabled={authLoading} className="w-full bg-indigo-600 text-white font-semibold py-3 rounded-xl text-sm disabled:opacity-60">
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
        <div className="max-w-lg mx-auto px-4 py-3">
          <div className="flex items-center gap-3 mb-3">
            <button onClick={() => router.back()} className="p-2 text-slate-400 hover:text-slate-600 min-h-[44px] min-w-[44px] flex items-center justify-center">
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
              <div className="flex gap-2 shrink-0">
                <a href={`tel:${student.parentEmail}`} className="p-2 text-slate-400 hover:text-indigo-600 min-h-[44px] min-w-[44px] flex items-center justify-center" title="Call">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                </a>
                <a href={`mailto:${student.parentEmail}`} className="p-2 text-slate-400 hover:text-indigo-600 min-h-[44px] min-w-[44px] flex items-center justify-center" title="Email">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </a>
              </div>
            )}
          </div>

          {/* Tabs */}
          <div className="flex gap-1 -mb-px">
            {(['timeline', 'exams'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors capitalize min-h-[44px] ${
                  tab === t
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tab content */}
      <div className="max-w-lg mx-auto px-4 pt-4">
        {loading && <p className="text-sm text-slate-400 text-center py-12">Loading…</p>}
        {!loading && tab === 'timeline' && <TimelineTab lessons={lessons} />}
        {!loading && tab === 'exams' && (
          <ExamsTab
            studentId={id}
            exams={exams}
            lessons={lessons}
            onRefresh={refreshExams}
          />
        )}
      </div>
    </div>
  );
}
