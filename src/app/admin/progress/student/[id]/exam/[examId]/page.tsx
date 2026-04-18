'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import topicLists from '@/lib/topic-lists.json';

type Subject = 'Math' | 'E Math' | 'A Math' | 'H2 Math';
type TopicState = 'Untaught' | 'Taught' | 'Weak' | 'Strong';

const EXAM_TYPES = ['WA1', 'WA2', 'WA3', 'EOY', 'Custom'] as const;

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
  studentId: string;
}

interface Lesson {
  id: string;
  date: string;
  topicsCovered: string;
  masteryRatings: string;
}

interface MasteryRating { subject: string; topic: string; rating: number }

function getCookie(name: string): string {
  if (typeof document === 'undefined') return '';
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : '';
}

function parseMasteryRatings(raw: string): MasteryRating[] {
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

function parseTopicsCovered(raw: string): string[] {
  if (!raw) return [];
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

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
    for (const lesson of lessons) {
      const covered = parseTopicsCovered(lesson.topicsCovered);
      if (covered.includes(prefix)) {
        if (!lastDate) lastDate = lesson.date;
        everTaught = true;
      }
      const ratings = parseMasteryRatings(lesson.masteryRatings);
      const match = ratings.find(r => r.subject === subject && r.topic === topic);
      if (match && lastRating === null) lastRating = match.rating;
      if (everTaught && lastRating !== null) break;
    }
    let state: TopicState;
    if (!everTaught) state = 'Untaught';
    else if (lastRating === null) state = 'Taught';
    else if (lastRating < 3) state = 'Weak';
    else state = 'Strong';
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

function formatDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function EditExamPage({ params }: { params: { id: string; examId: string } }) {
  const router = useRouter();
  const { id, examId } = params;
  const savedPw = useRef('');

  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [studentName, setStudentName] = useState('');
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);

  const [examType, setExamType] = useState('WA1');
  const [customName, setCustomName] = useState('');
  const [subject, setSubject] = useState<Subject | ''>('');
  const [examDate, setExamDate] = useState('');
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [resultScore, setResultScore] = useState('');
  const [resultTotal, setResultTotal] = useState('');
  const [resultGrade, setResultGrade] = useState('');
  const [resultNotes, setResultNotes] = useState('');

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');
  const [expandedTopic, setExpandedTopic] = useState<string | null>(null);

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
    if (!authed || !savedPw.current) return;
    const headers = { Authorization: `Bearer ${savedPw.current}` };
    Promise.all([
      fetch(`/api/admin/progress/exams/${examId}`, { headers }).then(r => r.json()),
      fetch(`/api/admin/progress/students`, { headers }).then(r => r.json()),
      fetch(`/api/admin/progress/students/${id}/lessons`, { headers }).then(r => r.json()),
    ]).then(([examJson, studentsJson, lessonsJson]) => {
      const exam: Exam = examJson;
      setExamType(exam.examType || 'WA1');
      setCustomName(exam.customName || '');
      setSubject((exam.subject as Subject) || '');
      setExamDate(exam.examDate || '');
      setSelectedTopics(exam.testedTopics ? exam.testedTopics.split(',').map((s: string) => s.trim()).filter(Boolean) : []);
      setResultScore(exam.resultScore != null ? String(exam.resultScore) : '');
      setResultTotal(exam.resultTotal != null ? String(exam.resultTotal) : '');
      setResultGrade(exam.resultGrade || '');
      setResultNotes(exam.resultNotes || '');

      const s = studentsJson.students?.find((s: any) => s.id === id);
      if (s) { setSubjects(s.subjects ?? []); setStudentName(s.name ?? ''); }

      setLessons(lessonsJson.lessons ?? []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [authed, id, examId]);

  function toggleTopic(topic: string) {
    setSelectedTopics(ts => ts.includes(topic) ? ts.filter(t => t !== topic) : [...ts, topic]);
  }

  const topicsForSubject = subject ? (topicLists as Record<string, string[]>)[subject] ?? [] : [];

  async function handleSave() {
    if (!subject) { setError('Select a subject'); return; }
    if (!examDate) { setError('Select an exam date'); return; }
    setSaving(true);
    setError('');
    try {
      const body: Record<string, any> = {
        examType, subject, examDate,
        testedTopics: selectedTopics.join(', '),
        customName: examType === 'Custom' ? customName : '',
        resultScore: resultScore ? Number(resultScore) : null,
        resultTotal: resultTotal ? Number(resultTotal) : null,
        resultGrade, resultNotes,
      };
      const res = await fetch(`/api/admin/progress/exams/${examId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${savedPw.current}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Save failed');
      router.push(`/admin/progress/student/${id}?tab=exams`);
    } catch (e: any) {
      setError(e.message || 'Save failed');
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await fetch(`/api/admin/progress/exams/${examId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${savedPw.current}` },
      });
      router.push(`/admin/progress/student/${id}?tab=exams`);
    } catch {
      setError('Delete failed');
      setDeleting(false);
    }
  }

  const testedTopics = selectedTopics;
  const states = subject && testedTopics.length > 0 ? computeTopicStates(testedTopics, subject, lessons) : {};
  const counts = { Strong: 0, Weak: 0, Taught: 0, Untaught: 0 };
  for (const { state } of Object.values(states)) counts[state as TopicState]++;

  if (!authed) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
          <h1 className="text-lg font-semibold text-slate-900 mb-4">Student Progress</h1>
          <form onSubmit={handleLogin} className="space-y-3">
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" autoFocus className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            {authError && <p className="text-sm text-red-500">{authError}</p>}
            <button type="submit" disabled={authLoading} className="w-full bg-indigo-600 text-white font-semibold py-3 rounded-xl text-sm disabled:opacity-60">{authLoading ? 'Checking…' : 'Login'}</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-slate-100 shadow-sm">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => router.back()} className="p-2 text-slate-400 hover:text-slate-600 min-h-[44px] min-w-[44px] flex items-center justify-center">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-base font-semibold text-slate-900">Edit Exam</h1>
            {studentName && <p className="text-xs text-slate-400">{studentName}</p>}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center text-slate-400 text-sm py-20">Loading…</div>
      ) : (
        <div className="max-w-lg mx-auto px-4 pt-5 space-y-6">

          {/* Exam type */}
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Exam Type</div>
            <div className="flex flex-wrap gap-2">
              {EXAM_TYPES.map(t => (
                <button key={t} onClick={() => setExamType(t)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium border min-h-[44px] transition-colors ${examType === t ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-200 text-slate-700 active:bg-slate-50'}`}>
                  {t}
                </button>
              ))}
            </div>
            {examType === 'Custom' && (
              <input className="mt-2 w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
                placeholder="e.g. School Prelim, O-Level" value={customName} onChange={e => setCustomName(e.target.value)} />
            )}
          </div>

          {/* Subject */}
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Subject</div>
            <div className="flex flex-wrap gap-2">
              {subjects.map(s => (
                <button key={s} onClick={() => { setSubject(s); setSelectedTopics([]); }}
                  className={`px-4 py-2 rounded-xl text-sm font-medium border min-h-[44px] transition-colors ${subject === s ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-200 text-slate-700 active:bg-slate-50'}`}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Exam date */}
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Exam Date</div>
            <input type="date" value={examDate} onChange={e => setExamDate(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white" />
          </div>

          {/* Tested topics */}
          {subject && topicsForSubject.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                Tested Topics <span className="text-slate-300 font-normal ml-1">{selectedTopics.length} selected</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {topicsForSubject.map(topic => (
                  <button key={topic} onClick={() => toggleTopic(topic)}
                    className={`px-2.5 py-1.5 rounded-full text-xs font-medium border min-h-[36px] transition-colors ${selectedTopics.includes(topic) ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-200 text-slate-600 active:bg-slate-50'}`}>
                    {topic}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Checklist (live) */}
          {subject && testedTopics.length > 0 && lessons.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Readiness Checklist</div>
              <div className="flex flex-wrap gap-3 text-xs font-medium mb-3">
                {counts.Strong > 0 && <span className="text-green-600">{counts.Strong} Strong</span>}
                {counts.Weak > 0 && <span className="text-orange-600">{counts.Weak} Weak</span>}
                {counts.Taught > 0 && <span className="text-yellow-600">{counts.Taught} Taught</span>}
                {counts.Untaught > 0 && <span className="text-slate-400">{counts.Untaught} Untaught</span>}
              </div>
              <div className="space-y-1.5">
                {testedTopics.map(topic => {
                  const { state, lastDate, lastRating } = states[topic] ?? { state: 'Untaught' as TopicState, lastDate: '', lastRating: null };
                  const style = STATE_STYLE[state];
                  const isExpanded = expandedTopic === topic;
                  return (
                    <div key={topic}>
                      <button className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg ${style.bg} active:opacity-80`}
                        onClick={() => setExpandedTopic(isExpanded ? null : topic)}>
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
          )}

          {/* Results */}
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Result <span className="text-slate-300 font-normal">(optional)</span></div>
            <div className="grid grid-cols-3 gap-2 mb-2">
              <input type="number" placeholder="Score" value={resultScore} onChange={e => setResultScore(e.target.value)}
                className="border border-slate-200 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white" />
              <input type="number" placeholder="Total" value={resultTotal} onChange={e => setResultTotal(e.target.value)}
                className="border border-slate-200 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white" />
              <input type="text" placeholder="Grade" value={resultGrade} onChange={e => setResultGrade(e.target.value)}
                className="border border-slate-200 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white" />
            </div>
            <textarea value={resultNotes} onChange={e => setResultNotes(e.target.value)} placeholder="Result notes…" rows={2}
              className="w-full border border-slate-200 rounded-xl px-3 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white" />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          {/* Delete */}
          {!confirmDelete ? (
            <button onClick={() => setConfirmDelete(true)} className="w-full py-3 rounded-xl text-sm font-medium text-red-500 border border-red-200 bg-white active:bg-red-50">
              Delete Exam
            </button>
          ) : (
            <div className="border border-red-200 rounded-xl p-4 bg-red-50 space-y-3">
              <p className="text-sm text-red-700 font-medium">Delete this exam? This cannot be undone.</p>
              <div className="flex gap-2">
                <button onClick={() => setConfirmDelete(false)} className="flex-1 py-2 rounded-lg text-sm font-medium bg-white border border-slate-200 text-slate-700">Cancel</button>
                <button onClick={handleDelete} disabled={deleting} className="flex-1 py-2 rounded-lg text-sm font-medium bg-red-600 text-white disabled:opacity-60">{deleting ? 'Deleting…' : 'Confirm Delete'}</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Sticky save */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-100 px-4 py-3">
        <div className="max-w-lg mx-auto">
          <button onClick={handleSave} disabled={saving || loading}
            className="w-full bg-indigo-600 text-white font-semibold py-3 rounded-xl text-sm disabled:opacity-60 active:bg-indigo-700">
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
