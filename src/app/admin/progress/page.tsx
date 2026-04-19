'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import topicLists from '@/lib/topic-lists.json';

// ─── Types ────────────────────────────────────────────────────────────────────

type Subject = 'Math' | 'E Math' | 'A Math' | 'H2 Math';

interface LessonCard {
  id: string;
  date: string;
  status: string;
  type: string;
  studentId: string;
  studentName: string;
  level: string;
  subjects: Subject[];
  subjectLevel: string;
  slotTime: string;
  topicsCovered: string;
  homeworkAssigned: string;
  homeworkCompletion: string;
  masteryRatings: string;
  mood: string;
  lessonNotes: string;
  progressLogged: boolean;
}

interface MasteryRating { subject: string; topic: string; rating: number }

interface Exam {
  id: string;
  examType: string;
  subject: string;
  examDate: string;
  testedTopics: string;
}

const EXAM_TYPES = ['WA1', 'WA2', 'WA3', 'EOY'] as const;

interface FormState {
  homeworkCompletion: string;
  selectedTopics: Record<string, string[]>; // subject → topics[]
  masteryRatings: Record<string, Record<string, number>>; // subject → topic → rating
  homeworkAssigned: string;
  mood: string;
  lessonNotes: string;
}

const MOOD_OPTIONS = ['😄 Engaged', '🙂 Fine', '😐 Flat', '😟 Struggling', '😤 Frustrated'];
const HW_OPTIONS = ['Fully Done', 'Partially Done', 'Not Done', 'Not Set'] as const;

// ─── Cookie helpers ────────────────────────────────────────────────────────────

function getCookie(name: string): string {
  if (typeof document === 'undefined') return '';
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : '';
}

function setCookie(name: string, value: string, days: number) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Strict`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function formatShortDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-SG', { day: 'numeric', month: 'short' });
}

function topicsForSubject(subject: string): string[] {
  return (topicLists as Record<string, string[]>)[subject] ?? [];
}

function hasTopics(subject: string): boolean {
  return topicsForSubject(subject).length > 0;
}

function parseTopicsCovered(raw: string): Record<string, string[]> {
  if (!raw) return {};
  const result: Record<string, string[]> = {};
  raw.split(',').map(s => s.trim()).filter(Boolean).forEach(entry => {
    const colon = entry.indexOf(':');
    if (colon === -1) return;
    const subj = entry.slice(0, colon).trim();
    const topic = entry.slice(colon + 1).trim();
    if (!result[subj]) result[subj] = [];
    result[subj].push(topic);
  });
  return result;
}

function serializeTopicsCovered(selected: Record<string, string[]>): string {
  return Object.entries(selected)
    .flatMap(([subj, topics]) => topics.map(t => `${subj}: ${t}`))
    .join(', ');
}

function parseMasteryRatings(raw: string): Record<string, Record<string, number>> {
  if (!raw) return {};
  try {
    const arr: MasteryRating[] = JSON.parse(raw);
    const result: Record<string, Record<string, number>> = {};
    arr.forEach(({ subject, topic, rating }) => {
      if (!result[subject]) result[subject] = {};
      result[subject][topic] = rating;
    });
    return result;
  } catch { return {}; }
}

function serializeMasteryRatings(ratings: Record<string, Record<string, number>>): string {
  const arr: MasteryRating[] = [];
  Object.entries(ratings).forEach(([subject, topics]) => {
    Object.entries(topics).forEach(([topic, rating]) => {
      arr.push({ subject, topic, rating });
    });
  });
  return JSON.stringify(arr);
}

// ─── LogForm component ─────────────────────────────────────────────────────────

function TopicDropdown({
  subject,
  topics,
  selected,
  onToggle,
}: {
  subject: string;
  topics: string[];
  selected: string[];
  onToggle: (topic: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const label = selected.length === 0
    ? 'None selected'
    : selected.length === 1
      ? selected[0]
      : `${selected.length} topics`;

  return (
    <div className="mb-2">
      {/* Trigger */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between bg-white border border-slate-200 rounded-xl px-4 py-3 min-h-[48px] active:bg-slate-50"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-semibold text-slate-500">{subject}</span>
          <span className="text-sm text-slate-800 truncate">{label}</span>
        </div>
        <svg
          className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown list */}
      {open && (
        <div className="mt-1 bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          {topics.map((topic, i) => {
            const checked = selected.includes(topic);
            return (
              <button
                key={topic}
                onClick={() => onToggle(topic)}
                className={`w-full flex items-center justify-between px-4 py-3 min-h-[48px] active:bg-slate-50 text-left ${
                  i > 0 ? 'border-t border-slate-100' : ''
                } ${checked ? 'bg-indigo-50' : ''}`}
              >
                <span className={`text-sm ${checked ? 'text-indigo-700 font-medium' : 'text-slate-700'}`}>
                  {topic}
                </span>
                {checked && (
                  <svg className="w-4 h-4 text-indigo-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── ExamForm (add / edit inline) ─────────────────────────────────────────────

function ExamForm({
  initial,
  subjects,
  pw,
  onSave,
  onCancel,
  onUnsavedChange,
}: {
  initial?: Exam;
  subjects: Subject[];
  pw: string;
  onSave: (data: Omit<Exam, 'id'>) => Promise<void>;
  onCancel: () => void;
  onUnsavedChange?: (dirty: boolean) => void;
}) {
  const [examType, setExamType] = useState<string>(initial?.examType ?? 'WA1');
  const [subject, setSubject] = useState<Subject | ''>(
    (initial?.subject as Subject) ?? (subjects.length === 1 ? subjects[0] : '')
  );
  const [examDate, setExamDate] = useState(initial?.examDate ?? '');
  const [selectedTopics, setSelectedTopics] = useState<string[]>(
    initial?.testedTopics ? initial.testedTopics.split(',').map(s => s.trim()).filter(Boolean) : []
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const topics = subject ? topicsForSubject(subject) : [];

  // Notify parent when form becomes dirty
  useEffect(() => {
    const dirty = !!(examDate || selectedTopics.length > 0);
    onUnsavedChange?.(dirty);
    return () => onUnsavedChange?.(false);
  }, [examDate, selectedTopics.length]);

  function handleSubjectChange(s: Subject) {
    setSubject(s);
    setSelectedTopics([]);
  }

  function toggleTopic(topic: string) {
    setSelectedTopics(ts =>
      ts.includes(topic) ? ts.filter(t => t !== topic) : [...ts, topic]
    );
  }

  async function handleSave() {
    if (!subject) { setError('Select a subject'); return; }
    if (!examDate) { setError('Select a date'); return; }
    setSaving(true);
    setError('');
    try {
      await onSave({ examType, subject, examDate, testedTopics: selectedTopics.join(', ') });
    } catch {
      setError('Save failed');
      setSaving(false);
    }
  }

  return (
    <div className="bg-white border border-indigo-200 rounded-xl p-3 space-y-3">
      {/* Exam type */}
      <div>
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Exam Type</div>
        <div className="flex gap-2 flex-wrap">
          {EXAM_TYPES.map(t => (
            <button key={t} onClick={() => setExamType(t)}
              className={`px-3 py-2 rounded-lg text-sm font-medium border min-h-[44px] transition-colors ${
                examType === t ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-700 active:bg-slate-100'
              }`}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Subject */}
      {subjects.length > 1 && (
        <div>
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Subject</div>
          <div className="flex gap-2 flex-wrap">
            {subjects.map(s => (
              <button key={s} onClick={() => handleSubjectChange(s as Subject)}
                className={`px-3 py-2 rounded-lg text-sm font-medium border min-h-[44px] transition-colors ${
                  subject === s ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-700 active:bg-slate-100'
                }`}>
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Date */}
      <div>
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Exam Date</div>
        <input type="date" value={examDate} onChange={e => setExamDate(e.target.value)}
          className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
      </div>

      {/* Topics */}
      {subject && topics.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Tested Topics</div>
          <TopicDropdown subject={subject} topics={topics} selected={selectedTopics} onToggle={toggleTopic} />
        </div>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="flex gap-2 pt-1">
        <button onClick={onCancel}
          className="flex-1 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-600 bg-white active:bg-slate-50 min-h-[44px]">
          Cancel
        </button>
        <button onClick={handleSave} disabled={saving}
          className="flex-1 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-semibold disabled:opacity-60 active:bg-indigo-700 min-h-[44px]">
          {saving ? 'Saving…' : initial ? 'Update' : 'Add Exam'}
        </button>
      </div>
    </div>
  );
}

// ─── UpcomingExams accordion ───────────────────────────────────────────────────

function UpcomingExams({
  studentId,
  subjects,
  pw,
  onUnsavedChange,
}: {
  studentId: string;
  subjects: Subject[];
  pw: string;
  onUnsavedChange: (dirty: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const today = todayISO();

  async function loadExams() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/progress/students/${studentId}/exams`, {
        headers: { Authorization: `Bearer ${pw}` },
      });
      const json = await res.json();
      const upcoming = (json.exams ?? [])
        .filter((e: Exam) => e.examDate >= today)
        .sort((a: Exam, b: Exam) => a.examDate.localeCompare(b.examDate));
      setExams(upcoming);
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }

  function handleToggle() {
    if (!open && !loaded) loadExams();
    setOpen(o => !o);
  }

  async function handleAdd(data: Omit<Exam, 'id'>) {
    const res = await fetch(`/api/admin/progress/students/${studentId}/exams`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${pw}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed');
    const created = await res.json();
    setExams(prev =>
      [...prev, created]
        .filter(e => e.examDate >= today)
        .sort((a, b) => a.examDate.localeCompare(b.examDate))
    );
    setAddOpen(false);
  }

  async function handleEdit(id: string, data: Omit<Exam, 'id'>) {
    const res = await fetch(`/api/admin/progress/exams/${id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${pw}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed');
    const updated = await res.json();
    setExams(prev =>
      prev.map(e => e.id === id ? { ...e, ...updated } : e)
        .filter(e => e.examDate >= today)
        .sort((a, b) => a.examDate.localeCompare(b.examDate))
    );
    setEditingId(null);
  }

  async function handleDelete(id: string) {
    await fetch(`/api/admin/progress/exams/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${pw}` },
    });
    setExams(prev => prev.filter(e => e.id !== id));
    setDeleteConfirmId(null);
  }

  const headerLabel = !loaded
    ? 'Upcoming Exams'
    : exams.length === 0
      ? 'Upcoming Exams (none)'
      : `Upcoming Exams (${exams.length})`;

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
      {/* Accordion header */}
      <button
        onClick={handleToggle}
        className="w-full flex items-center justify-between px-4 py-3 min-h-[48px] active:bg-slate-50"
      >
        <span className="text-sm font-medium text-slate-700">{headerLabel}</span>
        <svg className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="border-t border-slate-100 bg-slate-50 px-3 py-3 space-y-2">
          {loading && <p className="text-sm text-slate-400 py-2 text-center">Loading…</p>}

          {/* Exam rows */}
          {!loading && exams.map(exam => (
            <div key={exam.id}>
              {editingId === exam.id ? (
                <ExamForm
                  initial={exam}
                  subjects={subjects}
                  pw={pw}
                  onSave={data => handleEdit(exam.id, data)}
                  onCancel={() => setEditingId(null)}
                  onUnsavedChange={onUnsavedChange}
                />
              ) : (
                <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2.5 min-h-[48px]">
                  <button
                    className="flex-1 text-left min-w-0"
                    onClick={() => { setEditingId(exam.id); setAddOpen(false); }}
                  >
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-bold bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">{exam.examType}</span>
                      <span className="text-xs bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded">{exam.subject}</span>
                      <span className="text-xs text-slate-500">{formatShortDate(exam.examDate)}</span>
                      {exam.testedTopics && (
                        <span className="text-xs text-slate-400">
                          {exam.testedTopics.split(',').map(s => s.trim()).filter(Boolean).length} topics
                        </span>
                      )}
                    </div>
                  </button>
                  {deleteConfirmId === exam.id ? (
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => setDeleteConfirmId(null)}
                        className="text-xs px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-600 min-h-[36px]">
                        Cancel
                      </button>
                      <button onClick={() => handleDelete(exam.id)}
                        className="text-xs px-2.5 py-1.5 rounded-lg bg-red-100 text-red-600 min-h-[36px]">
                        Delete
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeleteConfirmId(exam.id)}
                      className="text-slate-300 active:text-red-400 p-1 min-h-[44px] min-w-[44px] flex items-center justify-center text-lg leading-none"
                    >
                      ×
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}

          {/* Add new exam */}
          {!loading && !addOpen && (
            <button
              onClick={() => { setAddOpen(true); setEditingId(null); }}
              className="w-full py-3 border border-dashed border-slate-300 rounded-lg text-sm text-slate-500 active:bg-white min-h-[48px]"
            >
              + Add Exam
            </button>
          )}

          {addOpen && (
            <ExamForm
              subjects={subjects}
              pw={pw}
              onSave={handleAdd}
              onCancel={() => setAddOpen(false)}
              onUnsavedChange={onUnsavedChange}
            />
          )}
        </div>
      )}
    </div>
  );
}

function LogForm({
  lesson,
  pw,
  onSaved,
}: {
  lesson: LessonCard;
  pw: string;
  onSaved: (updated: Partial<LessonCard>) => void;
}) {
  const [prevLesson, setPrevLesson] = useState<{ homeworkAssigned: string } | null>(null);
  const [form, setForm] = useState<FormState>(() => ({
    homeworkCompletion: lesson.homeworkCompletion || 'Not Set',
    selectedTopics: parseTopicsCovered(lesson.topicsCovered),
    masteryRatings: parseMasteryRatings(lesson.masteryRatings),
    homeworkAssigned: lesson.homeworkAssigned || '',
    mood: lesson.mood || '',
    lessonNotes: lesson.lessonNotes || '',
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [examUnsaved, setExamUnsaved] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/progress/students/${lesson.studentId}/previous-lesson?before=${lesson.date}`, {
      headers: { Authorization: `Bearer ${pw}` },
    })
      .then(r => r.json())
      .then(d => setPrevLesson(d.lesson))
      .catch(() => {});
  }, [lesson.studentId, lesson.date, pw]);

  function toggleTopic(subject: string, topic: string) {
    setForm(f => {
      const current = f.selectedTopics[subject] ?? [];
      const next = current.includes(topic)
        ? current.filter(t => t !== topic)
        : [...current, topic];
      const updated = { ...f.selectedTopics, [subject]: next };
      // Remove mastery for deselected topics
      const newRatings = { ...f.masteryRatings };
      if (!next.includes(topic) && newRatings[subject]) {
        const subjectRatings = { ...newRatings[subject] };
        delete subjectRatings[topic];
        newRatings[subject] = subjectRatings;
      }
      return { ...f, selectedTopics: updated, masteryRatings: newRatings };
    });
  }

  function setRating(subject: string, topic: string, rating: number) {
    setForm(f => ({
      ...f,
      masteryRatings: {
        ...f.masteryRatings,
        [subject]: { ...(f.masteryRatings[subject] ?? {}), [topic]: rating },
      },
    }));
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const fields: Record<string, any> = {
        'Homework Completion': form.homeworkCompletion,
        'Topics Covered': serializeTopicsCovered(form.selectedTopics),
        'Mastery Ratings': serializeMasteryRatings(form.masteryRatings),
        'Homework Assigned': form.homeworkAssigned,
        'Mood': form.mood,
        'Lesson Notes': form.lessonNotes,
        'Progress Logged': true,
      };
      const res = await fetch(`/api/admin/progress/lessons?id=${lesson.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${pw}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields }),
      });
      if (!res.ok) throw new Error('Save failed');
      onSaved({
        homeworkCompletion: form.homeworkCompletion,
        topicsCovered: fields['Topics Covered'],
        masteryRatings: fields['Mastery Ratings'],
        homeworkAssigned: form.homeworkAssigned,
        mood: form.mood,
        lessonNotes: form.lessonNotes,
        progressLogged: true,
      });
    } catch (e: any) {
      setError(e.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  const subjects = lesson.subjects.filter(Boolean);

  return (
    <div className="border-t border-slate-100 bg-slate-50 px-4 py-4 space-y-5">

      {/* 1. Last homework + completion */}
      <div>
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Last Homework</div>
        {prevLesson?.homeworkAssigned
          ? <p className="text-sm text-slate-700 bg-white border border-slate-200 rounded-lg px-3 py-2 mb-2">{prevLesson.homeworkAssigned}</p>
          : <p className="text-sm text-slate-400 italic mb-2">No previous homework recorded</p>
        }
        <div className="flex flex-wrap gap-2">
          {HW_OPTIONS.map(opt => (
            <button
              key={opt}
              onClick={() => setForm(f => ({ ...f, homeworkCompletion: opt }))}
              className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors min-h-[44px] ${
                form.homeworkCompletion === opt
                  ? 'bg-indigo-600 border-indigo-600 text-white'
                  : 'bg-white border-slate-200 text-slate-700 active:bg-slate-50'
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>

      {/* 2. Topics covered */}
      <div>
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Topics Covered</div>
        {subjects.length === 0 && (
          <p className="text-sm text-slate-400 italic">No subjects assigned</p>
        )}
        {subjects.map(subj => {
          const topics = topicsForSubject(subj);
          if (!hasTopics(subj)) {
            return (
              <div key={subj} className="mb-2">
                <p className="text-xs text-slate-400 italic">{subj}: topics coming soon — use Lesson Notes</p>
              </div>
            );
          }
          const selected = form.selectedTopics[subj] ?? [];
          return (
            <TopicDropdown
              key={subj}
              subject={subj}
              topics={topics}
              selected={selected}
              onToggle={(topic) => toggleTopic(subj, topic)}
            />
          );
        })}
      </div>

      {/* 3. Mastery */}
      {subjects.some(s => hasTopics(s)) && (
        <div>
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Mastery</div>
          {subjects.map(subj => {
            const selected = form.selectedTopics[subj] ?? [];
            if (!hasTopics(subj) || selected.length === 0) return null;
            return (
              <div key={subj} className="mb-3">
                <div className="text-xs font-medium text-slate-500 mb-1">{subj}</div>
                <div className="space-y-2">
                  {selected.map(topic => {
                    const current = form.masteryRatings[subj]?.[topic] ?? 0;
                    return (
                      <div key={topic} className="flex items-center gap-2">
                        <span className="text-xs text-slate-600 flex-1 min-w-0 truncate">{topic}</span>
                        <div className="flex gap-1 shrink-0">
                          {[1, 2, 3, 4, 5].map(n => (
                            <button
                              key={n}
                              onClick={() => setRating(subj, topic, n)}
                              className={`w-9 h-9 rounded-full text-sm font-bold border transition-colors ${
                                current >= n
                                  ? n <= 2 ? 'bg-red-500 border-red-500 text-white'
                                    : n === 3 ? 'bg-yellow-400 border-yellow-400 text-white'
                                    : 'bg-green-500 border-green-500 text-white'
                                  : 'bg-white border-slate-200 text-slate-400'
                              }`}
                            >
                              {n}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 4. Homework assigned */}
      <div>
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Homework Assigned</div>
        <textarea
          value={form.homeworkAssigned}
          onChange={e => setForm(f => ({ ...f, homeworkAssigned: e.target.value }))}
          placeholder="e.g. Differentiation worksheet pg 3–5"
          rows={2}
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
          style={{ minHeight: '60px' }}
          onInput={e => {
            const el = e.currentTarget;
            el.style.height = 'auto';
            el.style.height = el.scrollHeight + 'px';
          }}
        />
      </div>

      {/* 5. Mood */}
      <div>
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Mood</div>
        <div className="flex flex-wrap gap-2">
          {MOOD_OPTIONS.map(m => (
            <button
              key={m}
              onClick={() => setForm(f => ({ ...f, mood: m }))}
              className={`px-3 py-2 rounded-lg text-sm border transition-colors min-h-[44px] ${
                form.mood === m
                  ? 'bg-indigo-600 border-indigo-600 text-white'
                  : 'bg-white border-slate-200 text-slate-700 active:bg-slate-50'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* 6. Lesson notes */}
      <div>
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Lesson Notes</div>
        <textarea
          value={form.lessonNotes}
          onChange={e => setForm(f => ({ ...f, lessonNotes: e.target.value }))}
          placeholder="Anything notable from today's lesson…"
          rows={3}
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
          style={{ minHeight: '72px' }}
          onInput={e => {
            const el = e.currentTarget;
            el.style.height = 'auto';
            el.style.height = el.scrollHeight + 'px';
          }}
        />
      </div>

      {/* 7. Upcoming Exams */}
      <UpcomingExams
        studentId={lesson.studentId}
        subjects={lesson.subjects.filter(Boolean) as Subject[]}
        pw={pw}
        onUnsavedChange={setExamUnsaved}
      />

      {error && <p className="text-sm text-red-500">{error}</p>}
      {examUnsaved && (
        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          ⚠ Exam form has unsaved changes — save or cancel it before saving progress.
        </p>
      )}

      {/* 8. Save */}
      <button
        onClick={handleSave}
        disabled={saving || examUnsaved}
        className="w-full bg-indigo-600 text-white font-semibold py-3 rounded-xl text-sm disabled:opacity-40 active:bg-indigo-700 transition-colors"
      >
        {saving ? 'Saving…' : 'Save Progress'}
      </button>
    </div>
  );
}

// ─── LessonCardRow ─────────────────────────────────────────────────────────────

function LessonCardRow({
  lesson,
  pw,
  onUpdate,
}: {
  lesson: LessonCard;
  pw: string;
  onUpdate: (id: string, updated: Partial<LessonCard>) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(lesson);

  function handleSaved(updated: Partial<LessonCard>) {
    const next = { ...data, ...updated };
    setData(next);
    onUpdate(lesson.id, updated);
    setOpen(false);
  }

  const subjectBadges = (data.subjects ?? []).filter(Boolean);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
      {/* Card header */}
      <div
        className="flex items-start gap-3 px-4 py-3 active:bg-slate-50 cursor-pointer"
        onClick={() => setOpen(o => !o)}
      >
        {/* Status dot */}
        <div className="mt-1 shrink-0">
          {data.progressLogged
            ? <span className="block w-3 h-3 rounded-full bg-green-500" title="Logged" />
            : <span className="block w-3 h-3 rounded-full bg-slate-300" title="Not logged" />
          }
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              className="font-semibold text-slate-900 text-base hover:text-indigo-600 transition-colors"
              onClick={e => { e.stopPropagation(); router.push(`/admin/progress/student/${data.studentId}`); }}
            >
              {data.studentName || 'Unknown Student'}
            </button>
            <span className="text-xs text-slate-400">{data.slotTime}</span>
          </div>
          <div className="flex flex-wrap gap-1 mt-1">
            {data.level && (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">{data.level}</span>
            )}
            {subjectBadges.map(s => (
              <span key={s} className="px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700">{s}</span>
            ))}
          </div>
        </div>

        {/* Chevron */}
        <div className="shrink-0 text-slate-300 mt-1">
          <svg className={`w-5 h-5 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* Inline form */}
      {open && (
        <LogForm
          lesson={data}
          pw={pw}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function ProgressPage() {
  const [password, setPassword] = useState('');
  const [authed, setAuthed] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const savedPw = useRef('');

  const [date, setDate] = useState<string>(todayISO());
  const [lessons, setLessons] = useState<LessonCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const touchStartY = useRef(0);
  const pullDistance = useRef(0);

  // Check cookie on mount
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
        setCookie('progress_pw', pw, 30);
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

  const fetchLessons = useCallback(async (d: string, pw: string) => {
    setLoading(true);
    setFetchError('');
    try {
      const res = await fetch(`/api/admin/progress/lessons?date=${d}`, {
        headers: { Authorization: `Bearer ${pw}` },
      });
      if (!res.ok) throw new Error('Failed to load');
      const json = await res.json();
      setLessons(json.lessons ?? []);
    } catch (err: any) {
      setFetchError(err.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authed && savedPw.current) {
      fetchLessons(date, savedPw.current);
    }
  }, [authed, date, fetchLessons]);

  function updateLesson(id: string, updated: Partial<LessonCard>) {
    setLessons(ls => ls.map(l => l.id === id ? { ...l, ...updated } : l));
  }

  async function triggerRefresh() {
    if (refreshing || loading || !savedPw.current) return;
    setRefreshing(true);
    try {
      const res = await fetch(`/api/admin/progress/lessons?date=${date}`, {
        headers: { Authorization: `Bearer ${savedPw.current}` },
      });
      if (res.ok) {
        const json = await res.json();
        setLessons(json.lessons ?? []);
      }
    } finally {
      setRefreshing(false);
    }
  }

  function onTouchStart(e: React.TouchEvent) {
    touchStartY.current = e.touches[0].clientY;
    pullDistance.current = 0;
  }

  function onTouchEnd(e: React.TouchEvent) {
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    if (dy > 60 && window.scrollY === 0) {
      triggerRefresh();
    }
  }

  const loggedCount = lessons.filter(l => l.progressLogged).length;

  // ── Auth screen ──
  if (!authed) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
          <h1 className="text-lg font-semibold text-slate-900 mb-1">Student Progress</h1>
          <p className="text-sm text-slate-500 mb-5">Enter admin password to continue.</p>
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
            <button
              type="submit"
              disabled={authLoading}
              className="w-full bg-indigo-600 text-white font-semibold py-3 rounded-xl text-sm disabled:opacity-60"
            >
              {authLoading ? 'Checking…' : 'Login'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ── Main ──
  return (
    <div className="min-h-screen bg-slate-50 pb-20" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {/* Pull-to-refresh indicator */}
      {refreshing && (
        <div className="fixed top-0 left-0 right-0 z-50 flex justify-center pt-2 pointer-events-none">
          <div className="bg-indigo-600 text-white text-xs font-medium px-3 py-1 rounded-full shadow-md">
            Refreshing…
          </div>
        </div>
      )}
      {/* Sticky top bar */}
      <div className="sticky top-0 z-10 bg-white border-b border-slate-100 shadow-sm">
        <div className="max-w-lg mx-auto px-4 pt-3 pb-2">
          {/* Row 1: back + title + counter */}
          <div className="flex items-center gap-2 mb-2">
            <a href="/admin" className="text-slate-400 hover:text-slate-600 shrink-0 p-1 min-h-[36px] min-w-[36px] flex items-center justify-center">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </a>
            <span className="flex-1 text-base font-semibold text-slate-900">Progress</span>
            <span className="shrink-0 text-sm font-semibold text-slate-600">
              {loggedCount}<span className="text-slate-300"> / </span>{lessons.length}
            </span>
          </div>
          {/* Row 2: date navigation */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setDate(d => addDays(d, -1))}
              className="p-2 rounded-lg text-slate-500 active:bg-slate-100 min-h-[44px] min-w-[44px] flex items-center justify-center text-lg"
            >
              ‹
            </button>
            <div className="flex-1 flex items-center justify-center gap-2">
              <span className="text-sm font-medium text-slate-900">{formatDate(date)}</span>
              {date !== todayISO() && (
                <button
                  onClick={() => setDate(todayISO())}
                  className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-full active:bg-indigo-100"
                >
                  Today
                </button>
              )}
            </div>
            <button
              onClick={() => setDate(d => addDays(d, 1))}
              className="p-2 rounded-lg text-slate-500 active:bg-slate-100 min-h-[44px] min-w-[44px] flex items-center justify-center text-lg"
            >
              ›
            </button>
          </div>
        </div>
      </div>

      {/* Lesson cards */}
      <div className="max-w-lg mx-auto px-4 pt-4 space-y-3">
        {loading && (
          <div className="text-center text-slate-400 text-sm py-12">Loading…</div>
        )}
        {!loading && fetchError && (
          <div className="text-center text-red-500 text-sm py-12">{fetchError}</div>
        )}
        {!loading && !fetchError && lessons.length === 0 && (
          <div className="text-center text-slate-400 text-sm py-12">No lessons on this day</div>
        )}
        {!loading && lessons.map(lesson => (
          <LessonCardRow
            key={lesson.id}
            lesson={lesson}
            pw={savedPw.current}
            onUpdate={updateLesson}
          />
        ))}
      </div>
    </div>
  );
}
