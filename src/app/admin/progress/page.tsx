'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import topicLists from '@/lib/topic-lists.json';
import { mergeTopics } from '@/lib/topicMerge';

// ── Types ─────────────────────────────────────────────────────────────────────

type Subject = 'Math' | 'E Math' | 'A Math' | 'H2 Math';
type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';
type ExamType = 'WA1' | 'WA2' | 'WA3' | 'EOY';

interface ExamInfoStatus {
  complete: boolean;
  activeType: ExamType | null;
  missing: { hasNoRecord: boolean; missingDate: boolean; missingTopics: boolean };
}

interface ExamSeason {
  override: ExamType | null;
  active: ExamType | null;
  source: 'manual' | 'auto' | 'none';
}

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
  rescheduledToDate: string;
  examStatus: ExamInfoStatus;
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
  examNotes: string;
  noExam: boolean;
}

interface FormState {
  homeworkCompletion: string;
  selectedTopics: Record<string, string[]>;
  masteryRatings: Record<string, Record<string, number>>;
  homeworkAssigned: string;
  mood: string;
  lessonNotes: string;
}

const EXAM_TYPES = ['WA1', 'WA2', 'WA3', 'EOY'] as const;
const MOOD_OPTIONS = ['😄 Engaged', '🙂 Fine', '😐 Flat', '😟 Struggling', '😤 Frustrated'];
const HW_OPTIONS = ['Fully Done', 'Partially Done', 'Not Done', 'Not Set'] as const;

// ── Autosave hook ─────────────────────────────────────────────────────────────

function useAutosave(saveFn: (fields: Record<string, any>) => Promise<void>) {
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<Record<string, any> | null>(null);
  const inFlightRef = useRef(false);
  const saveFnRef = useRef(saveFn);
  saveFnRef.current = saveFn;

  useEffect(() => {
    // On unmount: cancel any pending debounce timer (flush() should be called first if needed)
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  async function doSave(fields: Record<string, any>): Promise<void> {
    if (inFlightRef.current) { pendingRef.current = fields; return; }
    inFlightRef.current = true;
    setStatus('saving');
    try {
      await saveFnRef.current(fields);
      setSavedAt(new Date());
      setStatus('saved');
    } catch {
      setStatus('error');
      inFlightRef.current = false;
      return;
    }
    inFlightRef.current = false;
    const pending = pendingRef.current;
    if (pending) { pendingRef.current = null; await doSave(pending); }
  }

  function schedule(fields: Record<string, any>, immediate = false) {
    if (timerRef.current) clearTimeout(timerRef.current);
    pendingRef.current = fields; // always track latest fields
    if (immediate) { pendingRef.current = null; doSave(fields); }
    else { timerRef.current = setTimeout(() => { pendingRef.current = null; doSave(fields); }, 400); }
  }

  // Call before unmounting to fire any queued debounced save immediately
  function flush() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const pending = pendingRef.current;
    if (pending) { pendingRef.current = null; doSave(pending); }
  }

  return { status, savedAt, schedule, flush };
}

// ── Cookie helpers ────────────────────────────────────────────────────────────

function getCookie(name: string): string {
  if (typeof document === 'undefined') return '';
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : '';
}

function setCookie(name: string, value: string, days: number) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Strict`;
}

// ── Date helpers ──────────────────────────────────────────────────────────────

function todayISO(): string {
  const d = new Date();
  const result = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  console.log('[todayISO] result:', result, '| new Date():', d.toString());
  return result;
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  const result = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  console.log('[addDays] input:', iso, 'n:', n, '→ output:', result, '| Date obj:', d.toString());
  return result;
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

function formatSavedAt(d: Date): string {
  return d.toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit', hour12: false });
}

// ── Topic + serialization helpers ─────────────────────────────────────────────

function topicsForSubject(subject: string, level?: string): string[] {
  const lists = topicLists as Record<string, string[]>;
  if (subject === 'Math') {
    const isS1 = level?.includes('Sec 1') || level?.includes('S1');
    const isS2 = level?.includes('Sec 2') || level?.includes('S2');
    if (isS1) return mergeTopics(lists['S1 Math'] ?? []);
    if (isS2) return mergeTopics([...(lists['S2 Math'] ?? []), ...(lists['S1 Math'] ?? [])]);
    // fallback: show all
    return mergeTopics([...(lists['S2 Math'] ?? []), ...(lists['S1 Math'] ?? [])]);
  }
  return mergeTopics(lists[subject] ?? []);
}

function hasTopics(subject: string, level?: string): boolean {
  return topicsForSubject(subject, level).length > 0;
}

function parseTopicsCovered(raw: string): Record<string, string[]> {
  if (!raw) return {};
  const result: Record<string, string[]> = {};
  raw.split(',').map(s => s.trim()).filter(Boolean).forEach(entry => {
    const colon = entry.indexOf(':');
    if (colon === -1) return;
    const subj = entry.slice(0, colon).trim();
    const base = entry.slice(colon + 1).trim().replace(/\s*\([^)]*\)\s*$/, '').trim();
    if (!result[subj]) result[subj] = [];
    if (!result[subj].includes(base)) result[subj].push(base);
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
      const base = topic.replace(/\s*\([^)]*\)\s*$/, '').trim();
      result[subject][base] = rating;
    });
    return result;
  } catch { return {}; }
}

function serializeMasteryRatings(ratings: Record<string, Record<string, number>>): string {
  const arr: MasteryRating[] = [];
  Object.entries(ratings).forEach(([subject, topics]) => {
    Object.entries(topics).forEach(([topic, rating]) => arr.push({ subject, topic, rating }));
  });
  return JSON.stringify(arr);
}

// ── SaveIndicator ─────────────────────────────────────────────────────────────

function SaveIndicator({
  status, savedAt, onRetry,
}: { status: SaveStatus; savedAt: Date | null; onRetry?: () => void }) {
  if (status === 'idle') return null;
  if (status === 'saving') return (
    <span className="font-mono text-[11px] text-neutral-400 animate-pulse">Saving…</span>
  );
  if (status === 'saved' && savedAt) return (
    <span className="font-mono text-[11px] text-neutral-400">Saved {formatSavedAt(savedAt)}</span>
  );
  if (status === 'error') return (
    <button onClick={onRetry} className="font-mono text-[11px] text-red-500 underline">
      Not saved — retry
    </button>
  );
  return null;
}

// ── TopicDropdown (lesson log) ────────────────────────────────────────────────

function TopicDropdown({
  subject, topics, selected, onToggle,
}: { subject: string; topics: string[]; selected: string[]; onToggle: (t: string) => void }) {
  const [open, setOpen] = useState(false);
  const label = selected.length === 0 ? 'None' : selected.length === 1 ? selected[0] : `${selected.length} topics`;

  return (
    <div className="mb-1.5">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between bg-white border border-neutral-200 rounded-md px-3 py-2.5 min-h-[44px] active:bg-neutral-50"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 shrink-0">{subject}</span>
          <span className="text-[13px] text-neutral-700 truncate">{label}</span>
        </div>
        <svg className={`w-4 h-4 text-neutral-300 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="mt-0.5 bg-white border border-neutral-200 rounded-md overflow-hidden">
          {topics.map((topic, i) => {
            const checked = selected.includes(topic);
            return (
              <button key={topic} onClick={() => onToggle(topic)}
                className={`w-full flex items-center justify-between px-3 py-2.5 min-h-[44px] active:bg-neutral-50 text-left ${
                  i > 0 ? 'border-t border-neutral-100' : ''
                } ${checked ? 'bg-neutral-50' : ''}`}>
                <span className={`text-[13px] ${checked ? 'text-neutral-900 font-medium' : 'text-neutral-600'}`}>{topic}</span>
                {checked && (
                  <svg className="w-4 h-4 text-neutral-700 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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

// ── TopicGrid (exam form) ─────────────────────────────────────────────────────

function TopicGrid({
  topics, selected, onToggle,
}: { topics: string[]; selected: string[]; onToggle: (t: string) => void }) {
  const [filter, setFilter] = useState('');
  const showFilter = topics.length > 15;
  const visible = filter ? topics.filter(t => t.toLowerCase().includes(filter.toLowerCase())) : topics;

  return (
    <div>
      {showFilter && (
        <input type="text" value={filter} onChange={e => setFilter(e.target.value)}
          placeholder="Filter topics…"
          className="w-full border border-neutral-200 rounded-md px-3 py-2 text-[13px] mb-2 focus:outline-none focus:ring-1 focus:ring-neutral-900" />
      )}
      <div className="flex flex-wrap gap-2">
        {visible.map(topic => {
          const checked = selected.includes(topic);
          return (
            <button key={topic} onClick={() => onToggle(topic)}
              className={`px-3 py-1.5 rounded-full text-[13px] border transition-colors ${
                checked
                  ? 'bg-neutral-800 text-white border-neutral-800'
                  : 'bg-white border-neutral-200 text-neutral-600 active:bg-neutral-50'
              }`}>
              {topic}
            </button>
          );
        })}
      </div>
      {visible.length === 0 && (
        <p className="text-[13px] text-neutral-400 text-center py-3">No topics match</p>
      )}
    </div>
  );
}

// ── ExamForm ──────────────────────────────────────────────────────────────────

function ExamForm({
  initial, subjects, level, studentId, pw, onCreated, onUpdated, onDeleted, onClose,
}: {
  initial?: Exam;
  subjects: Subject[];
  level: string;
  studentId: string;
  pw: string;
  onCreated: (exam: Exam) => void;
  onUpdated: (exam: Exam) => void;
  onDeleted: (id: string) => void;
  onClose: () => void;
}) {
  const [examType, setExamType] = useState(initial?.examType ?? 'WA1');
  const [subject, setSubject] = useState<Subject | ''>(
    (initial?.subject as Subject) ?? (subjects.length === 1 ? subjects[0] : '')
  );
  const [examDate, setExamDate] = useState(initial?.examDate ?? '');
  const [selectedTopics, setSelectedTopics] = useState<string[]>(
    initial?.testedTopics ? initial.testedTopics.split(',').map(s => s.trim()).filter(Boolean) : []
  );
  const [examNotes, setExamNotes] = useState(initial?.examNotes ?? '');
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const examIdRef = useRef<string | null>(initial?.id ?? null);
  const [examId, setExamId] = useState<string | null>(initial?.id ?? null);
  const isCreated = examId !== null;

  const topics = subject ? topicsForSubject(subject, level) : [];

  // Auto-create when single-subject form opens (subject already set, no initial)
  useEffect(() => {
    if (!initial && subject && !examIdRef.current) {
      doCreate(examType, subject);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const saveFn = useCallback(async (fields: Record<string, any>) => {
    const id = examIdRef.current;
    if (!id) throw new Error('exam not yet created');
    const res = await fetch(`/api/admin/progress/exams/${id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${pw}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    });
    if (!res.ok) throw new Error();
    const updated = await res.json();
    onUpdated(updated);
  }, [pw, onUpdated]);

  const { status: saveStatus, savedAt, schedule, flush } = useAutosave(saveFn);

  function buildExamFields(overrides: Partial<{
    examType: string; subject: string; examDate: string;
    selectedTopics: string[]; examNotes: string;
  }> = {}): Record<string, any> {
    return {
      examType: overrides.examType ?? examType,
      subject: overrides.subject ?? subject,
      examDate: (overrides.examDate ?? examDate) || null,
      testedTopics: (overrides.selectedTopics ?? selectedTopics).join(', '),
      examNotes: overrides.examNotes ?? examNotes,
    };
  }

  async function doCreate(type: string, subj: string) {
    if (examIdRef.current) return;
    setCreating(true);
    setCreateError('');
    try {
      const res = await fetch(`/api/admin/progress/students/${studentId}/exams`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${pw}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ examType: type, subject: subj }),
      });
      if (!res.ok) throw new Error();
      const created: Exam = await res.json();
      examIdRef.current = created.id;
      setExamId(created.id);
      onCreated(created);
    } catch {
      setCreateError('Failed to create — try again');
    } finally {
      setCreating(false);
    }
  }

  function handleExamTypeChange(t: string) {
    setExamType(t);
    if (isCreated) schedule(buildExamFields({ examType: t }), true);
  }

  async function handleSubjectChange(s: Subject) {
    setSubject(s);
    setSelectedTopics([]);
    if (!isCreated) {
      await doCreate(examType, s);
    } else {
      schedule(buildExamFields({ subject: s, selectedTopics: [] }), true);
    }
  }

  function toggleTopic(topic: string) {
    const next = selectedTopics.includes(topic)
      ? selectedTopics.filter(t => t !== topic)
      : [...selectedTopics, topic];
    setSelectedTopics(next);
    if (isCreated) schedule(buildExamFields({ selectedTopics: next }), true);
  }

  function handleDateChange(v: string) {
    setExamDate(v);
    if (isCreated) schedule(buildExamFields({ examDate: v }), true);
  }

  async function handleDelete() {
    const id = examIdRef.current;
    if (!id) { onClose(); return; }
    await fetch(`/api/admin/progress/exams/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${pw}` },
    });
    onDeleted(id);
  }

  return (
    <div className="bg-white border border-neutral-200 rounded-xl p-3 space-y-3">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400">
            {initial ? 'Edit Exam' : 'Add Exam'}
          </span>
          <SaveIndicator status={saveStatus} savedAt={savedAt}
            onRetry={() => isCreated && schedule(buildExamFields(), true)} />
        </div>
        {deleteConfirm ? (
          <div className="flex items-center gap-2">
            <button onClick={handleDelete} className="text-[13px] text-red-500 font-medium">Delete</button>
            <button onClick={() => setDeleteConfirm(false)} className="text-[13px] text-neutral-400">cancel</button>
          </div>
        ) : (
          <button onClick={() => setDeleteConfirm(true)} className="text-neutral-300 text-xl leading-none px-1">×</button>
        )}
      </div>

      {/* Exam type */}
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 mb-1.5">Type</div>
        <div className="flex gap-1.5 flex-wrap">
          {EXAM_TYPES.map(t => (
            <button key={t} onClick={() => handleExamTypeChange(t)}
              className={`px-3 py-2 rounded-md text-[13px] font-medium border min-h-[40px] transition-colors ${
                examType === t
                  ? 'bg-neutral-950 border-neutral-950 text-white'
                  : 'bg-white border-neutral-200 text-neutral-700 active:bg-neutral-50'
              }`}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Subject (multi-subject only) */}
      {subjects.length > 1 && (
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 mb-1.5">Subject</div>
          <div className="flex gap-1.5 flex-wrap">
            {subjects.map(s => (
              <button key={s} onClick={() => handleSubjectChange(s)}
                className={`px-3 py-2 rounded-md text-[13px] font-medium border min-h-[40px] transition-colors ${
                  subject === s
                    ? 'bg-neutral-950 border-neutral-950 text-white'
                    : 'bg-white border-neutral-200 text-neutral-700 active:bg-neutral-50'
                }`}>
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Add button (multi-subject: fires POST once subject is picked via handleSubjectChange) */}
      {!isCreated && subjects.length > 1 && !creating && !createError && (
        <p className="text-[13px] text-neutral-400 italic">Select a subject to begin</p>
      )}

      {/* For single-subject, show "Creating…" while POST is in flight */}
      {creating && <p className="text-[13px] text-neutral-400">Creating…</p>}
      {createError && <p className="text-[13px] text-red-500">{createError}</p>}

      {/* Fields shown only after exam is created */}
      {isCreated && (
        <>
          {/* Exam Date (optional) */}
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 mb-1.5">
              Exam Date <span className="normal-case font-normal text-neutral-400">(optional)</span>
            </div>
            <input type="date" value={examDate} onChange={e => handleDateChange(e.target.value)}
              className="w-full border border-neutral-200 rounded-md px-3 py-2 text-[13px] bg-white focus:outline-none focus:ring-1 focus:ring-neutral-900" />
          </div>

          {/* Tested Topics */}
          {subject && topics.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 mb-1.5">
                Tested Topics
                {selectedTopics.length > 0 && (
                  <span className="ml-1 normal-case font-normal">({selectedTopics.length})</span>
                )}
              </div>
              <TopicGrid topics={topics} selected={selectedTopics} onToggle={toggleTopic} />
            </div>
          )}

          {/* Exam Notes */}
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 mb-1.5">Exam Notes</div>
            <textarea
              value={examNotes}
              onChange={e => {
                const v = e.target.value;
                setExamNotes(v);
                schedule(buildExamFields({ examNotes: v }));
              }}
              placeholder="e.g. Focus on integration by parts…"
              rows={2}
              className="w-full border border-neutral-200 rounded-md px-3 py-2 text-[13px] resize-none focus:outline-none focus:ring-1 focus:ring-neutral-900 bg-white"
              style={{ minHeight: '52px' }}
              onInput={e => {
                const el = e.currentTarget;
                el.style.height = 'auto';
                el.style.height = el.scrollHeight + 'px';
              }}
            />
          </div>

          <button onClick={() => { flush(); onClose(); }}
            className="w-full py-2.5 border border-neutral-200 rounded-md text-[13px] text-neutral-600 bg-white active:bg-neutral-50 min-h-[44px]">
            Done
          </button>
        </>
      )}
    </div>
  );
}

// ── UpcomingExams ─────────────────────────────────────────────────────────────

function sortExams(exams: Exam[]): Exam[] {
  return [...exams].sort((a, b) => {
    if (!a.examDate && !b.examDate) return 0;
    if (!a.examDate) return 1;
    if (!b.examDate) return -1;
    return a.examDate.localeCompare(b.examDate);
  });
}

function UpcomingExams({
  studentId, subjects, level, pw, activeType, onExamCompleteChange,
}: {
  studentId: string; subjects: Subject[]; level: string; pw: string;
  activeType: ExamType | null;
  onExamCompleteChange?: (complete: boolean) => void;
}) {
  const [open, setOpen] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [noExamSaving, setNoExamSaving] = useState(false);

  async function handleNoExamToggle() {
    if (!activeType || noExamSaving) return;
    const currentNoExam = exams.some(e => e.examType === activeType && e.noExam);
    const turningOn = !currentNoExam;
    setNoExamSaving(true);
    try {
      if (turningOn) {
        // Find existing exam record for activeType to patch, or create a new one
        const existing = exams.find(e => e.examType === activeType);
        if (existing) {
          const res = await fetch(`/api/admin/progress/exams/${existing.id}`, {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${pw}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ noExam: true }),
          });
          if (!res.ok) throw new Error();
          const updated: Exam = await res.json();
          setExams(prev => sortExams(prev.map(e => e.id === updated.id ? { ...e, ...updated } : e)));
        } else {
          // Create a minimal exam record with noExam=true
          const res = await fetch(`/api/admin/progress/students/${studentId}/exams`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${pw}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ examType: activeType, noExam: true }),
          });
          if (!res.ok) throw new Error();
          const created: Exam = await res.json();
          setExams(prev => sortExams([...prev, created]));
        }
        onExamCompleteChange?.(true);
      } else {
        // Turn off: find the record that has noExam=true and patch it to false
        const record = exams.find(e => e.examType === activeType && e.noExam);
        if (record) {
          const res = await fetch(`/api/admin/progress/exams/${record.id}`, {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${pw}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ noExam: false }),
          });
          if (!res.ok) throw new Error();
          const updated: Exam = await res.json();
          setExams(prev => sortExams(prev.map(e => e.id === updated.id ? { ...e, ...updated } : e)));
        }
        onExamCompleteChange?.(false);
      }
    } catch {
      // silently fail — exam state stays as-is
    } finally {
      setNoExamSaving(false);
    }
  }

  async function loadExams() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/progress/students/${studentId}/exams`, {
        headers: { Authorization: `Bearer ${pw}` },
      });
      const json = await res.json();
      setExams(sortExams(json.exams ?? []));
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }

  useEffect(() => { loadExams(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleToggle() {
    setOpen(o => !o);
  }

  function handleCreated(exam: Exam) {
    setExams(prev => sortExams([...prev.filter(e => e.id !== exam.id), exam]));
  }

  function handleUpdated(exam: Exam) {
    setExams(prev => sortExams(prev.map(e => e.id === exam.id ? { ...e, ...exam } : e)));
  }

  function handleDeleted(id: string) {
    setExams(prev => prev.filter(e => e.id !== id));
    if (editingId === id) setEditingId(null);
    if (addOpen) setAddOpen(false);
  }

  const headerLabel = !loaded
    ? 'Exams'
    : exams.length === 0 ? 'Exams' : `Exams (${exams.length})`;

  return (
    <div className="border border-neutral-200 rounded-xl overflow-hidden bg-white">
      <button onClick={handleToggle}
        className="w-full flex items-center justify-between px-4 py-3 min-h-[48px] active:bg-neutral-50">
        <span className="text-[13px] font-medium text-neutral-700">{headerLabel}</span>
        <svg className={`w-4 h-4 text-neutral-300 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="border-t border-neutral-100 bg-neutral-50 px-3 py-3 space-y-2">
          {/* No-exam toggle — shown only during an active exam season */}
          {activeType && !loading && (
            <button
              onClick={handleNoExamToggle}
              disabled={noExamSaving}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 min-h-[44px] rounded-md bg-white border border-neutral-200 active:bg-neutral-50 disabled:opacity-50"
            >
              {/* Checkbox visual */}
              <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                exams.some(e => e.examType === activeType && e.noExam)
                  ? 'bg-neutral-800 border-neutral-800'
                  : 'bg-white border-neutral-300'
              }`}>
                {exams.some(e => e.examType === activeType && e.noExam) && (
                  <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </span>
              <span className="text-[13px] text-neutral-600">
                {noExamSaving ? 'Saving…' : `No ${activeType} exam this season`}
              </span>
            </button>
          )}

          {loading && <p className="text-[13px] text-neutral-400 py-2 text-center">Loading…</p>}

          {!loading && exams.map(exam => (
            <div key={exam.id}>
              {editingId === exam.id ? (
                <ExamForm
                  initial={exam}
                  subjects={subjects}
                  level={level}
                  studentId={studentId}
                  pw={pw}
                  onCreated={handleCreated}
                  onUpdated={handleUpdated}
                  onDeleted={handleDeleted}
                  onClose={() => setEditingId(null)}
                />
              ) : (
                <button
                  className="w-full flex items-center gap-2 bg-white border border-neutral-200 rounded-md px-3 py-2.5 min-h-[44px] text-left active:bg-neutral-50"
                  onClick={() => { setEditingId(exam.id); setAddOpen(false); }}
                >
                  <span className="text-[11px] font-bold bg-neutral-100 text-neutral-700 px-1.5 py-0.5 rounded">{exam.examType}</span>
                  <span className="text-[11px] bg-neutral-100 text-neutral-600 px-1.5 py-0.5 rounded">{exam.subject}</span>
                  {exam.examDate
                    ? <span className="text-[13px] text-neutral-500">{formatShortDate(exam.examDate)}</span>
                    : <span className="text-[13px] text-neutral-400">No date</span>
                  }
                  {exam.testedTopics && (
                    <span className="text-[13px] text-neutral-400 ml-auto shrink-0">
                      {exam.testedTopics.split(',').filter(Boolean).length}T
                    </span>
                  )}
                </button>
              )}
            </div>
          ))}

          {!loading && !addOpen && editingId === null && (
            <button
              onClick={() => setAddOpen(true)}
              className="w-full py-3 border border-dashed border-neutral-300 rounded-md text-[13px] text-neutral-400 active:bg-white min-h-[44px]">
              + Add Exam
            </button>
          )}

          {addOpen && (
            <ExamForm
              subjects={subjects}
              level={level}
              studentId={studentId}
              pw={pw}
              onCreated={exam => { handleCreated(exam); }}
              onUpdated={handleUpdated}
              onDeleted={id => { handleDeleted(id); setAddOpen(false); }}
              onClose={() => setAddOpen(false)}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ── LogForm ───────────────────────────────────────────────────────────────────

function LogForm({
  lesson, pw, onSaved, onStatusChange, activeType, onExamCompleteChange,
}: {
  lesson: LessonCard;
  pw: string;
  onSaved: (updated: Partial<LessonCard>) => void;
  onStatusChange: (status: SaveStatus, savedAt: Date | null) => void;
  activeType: ExamType | null;
  onExamCompleteChange?: (complete: boolean) => void;
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

  const isFirstSaveRef = useRef(!lesson.progressLogged);
  const onStatusChangeRef = useRef(onStatusChange);
  onStatusChangeRef.current = onStatusChange;

  useEffect(() => {
    fetch(`/api/admin/progress/students/${lesson.studentId}/previous-lesson?before=${lesson.date}`, {
      headers: { Authorization: `Bearer ${pw}` },
    }).then(r => r.json()).then(d => setPrevLesson(d.lesson)).catch(() => {});
  }, [lesson.studentId, lesson.date, pw]);

  function buildFields(f: FormState): Record<string, any> {
    const fields: Record<string, any> = {
      'Homework Completion': f.homeworkCompletion,
      'Topics Covered': serializeTopicsCovered(f.selectedTopics),
      'Mastery Ratings': serializeMasteryRatings(f.masteryRatings),
      'Homework Assigned': f.homeworkAssigned,
      'Mood': f.mood,
      'Lesson Notes': f.lessonNotes,
    };
    if (isFirstSaveRef.current) fields['Progress Logged'] = true;
    return fields;
  }

  const saveFn = useCallback(async (fields: Record<string, any>) => {
    const res = await fetch(`/api/admin/progress/lessons?id=${lesson.id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${pw}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    });
    if (!res.ok) throw new Error();
    if (fields['Progress Logged']) isFirstSaveRef.current = false;
    onSaved({
      homeworkCompletion: fields['Homework Completion'],
      topicsCovered: fields['Topics Covered'],
      masteryRatings: fields['Mastery Ratings'],
      homeworkAssigned: fields['Homework Assigned'],
      mood: fields['Mood'],
      lessonNotes: fields['Lesson Notes'],
      progressLogged: true,
    });
  }, [lesson.id, pw, onSaved]);

  const { status: saveStatus, savedAt, schedule } = useAutosave(saveFn);

  useEffect(() => {
    onStatusChangeRef.current(saveStatus, savedAt);
  }, [saveStatus, savedAt]);

  function updateForm(patch: Partial<FormState>, immediate = false) {
    setForm(f => {
      const next = { ...f, ...patch };
      schedule(buildFields(next), immediate);
      return next;
    });
  }

  function toggleTopic(subject: string, topic: string) {
    setForm(f => {
      const current = f.selectedTopics[subject] ?? [];
      const next = current.includes(topic) ? current.filter(t => t !== topic) : [...current, topic];
      const updatedTopics = { ...f.selectedTopics, [subject]: next };
      const newRatings = { ...f.masteryRatings };
      if (!next.includes(topic) && newRatings[subject]) {
        const sub = { ...newRatings[subject] };
        delete sub[topic];
        newRatings[subject] = sub;
      }
      const nextForm = { ...f, selectedTopics: updatedTopics, masteryRatings: newRatings };
      schedule(buildFields(nextForm), true);
      return nextForm;
    });
  }

  function setRating(subject: string, topic: string, rating: number) {
    setForm(f => {
      const nextForm = {
        ...f,
        masteryRatings: {
          ...f.masteryRatings,
          [subject]: { ...(f.masteryRatings[subject] ?? {}), [topic]: rating },
        },
      };
      schedule(buildFields(nextForm), true);
      return nextForm;
    });
  }

  const subjects = lesson.subjects.filter(Boolean);

  return (
    <div className="border-t border-neutral-100 bg-neutral-50 px-4 py-4 space-y-5">

      {/* 1. Last homework + completion */}
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 mb-1.5">Last Homework</div>
        {prevLesson?.homeworkAssigned
          ? <p className="text-[13px] text-neutral-700 bg-white border border-neutral-200 rounded-md px-3 py-2 mb-2">{prevLesson.homeworkAssigned}</p>
          : <p className="text-[13px] text-neutral-400 italic mb-2">No previous homework recorded</p>
        }
        <div className="flex flex-wrap gap-1.5">
          {HW_OPTIONS.map(opt => (
            <button key={opt} onClick={() => updateForm({ homeworkCompletion: opt }, true)}
              className={`px-3 py-2 rounded-md text-[13px] font-medium border transition-colors min-h-[40px] ${
                form.homeworkCompletion === opt
                  ? 'bg-neutral-950 border-neutral-950 text-white'
                  : 'bg-white border-neutral-200 text-neutral-700 active:bg-neutral-50'
              }`}>
              {opt}
            </button>
          ))}
        </div>
      </div>

      {/* 2. Topics covered */}
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 mb-1.5">Topics Covered</div>
        {subjects.length === 0 && <p className="text-[13px] text-neutral-400 italic">No subjects assigned</p>}
        {subjects.map(subj => {
          const topics = topicsForSubject(subj, lesson.level);
          if (topics.length === 0) {
            return (
              <div key={subj} className="mb-1.5">
                <p className="text-[13px] text-neutral-400 italic">{subj}: topics coming soon — use Lesson Notes</p>
              </div>
            );
          }
          return (
            <TopicDropdown
              key={subj}
              subject={subj}
              topics={topics}
              selected={form.selectedTopics[subj] ?? []}
              onToggle={(topic) => toggleTopic(subj, topic)}
            />
          );
        })}
      </div>

      {/* 3. Mastery */}
      {subjects.some(s => hasTopics(s, lesson.level)) && (
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 mb-2">Mastery</div>
          {subjects.map(subj => {
            const selected = form.selectedTopics[subj] ?? [];
            if (!hasTopics(subj, lesson.level) || selected.length === 0) return null;
            return (
              <div key={subj} className="mb-3">
                {subjects.length > 1 && (
                  <div className="text-[11px] font-semibold text-neutral-400 mb-1.5">{subj}</div>
                )}
                <div className="space-y-2">
                  {selected.map(topic => {
                    const current = form.masteryRatings[subj]?.[topic] ?? 0;
                    return (
                      <div key={topic} className="flex items-center gap-2">
                        <span className="text-[13px] text-neutral-600 flex-1 min-w-0 truncate">{topic}</span>
                        <div className="flex gap-1 shrink-0">
                          {[1, 2, 3, 4, 5].map(n => (
                            <button key={n} onClick={() => setRating(subj, topic, n)}
                              className={`w-8 h-8 rounded-full text-[13px] font-bold border transition-colors ${
                                current >= n
                                  ? n <= 2 ? 'bg-red-500 border-red-500 text-white'
                                    : n === 3 ? 'bg-yellow-400 border-yellow-400 text-white'
                                    : 'bg-emerald-500 border-emerald-500 text-white'
                                  : 'bg-white border-neutral-200 text-neutral-400'
                              }`}>{n}</button>
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
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 mb-1.5">Homework Assigned</div>
        <textarea
          value={form.homeworkAssigned}
          onChange={e => {
            const v = e.target.value;
            setForm(f => {
              const next = { ...f, homeworkAssigned: v };
              schedule(buildFields(next));
              return next;
            });
          }}
          placeholder="e.g. Differentiation worksheet pg 3–5"
          rows={2}
          className="w-full border border-neutral-200 rounded-md px-3 py-2 text-[13px] resize-none focus:outline-none focus:ring-1 focus:ring-neutral-900 bg-white"
          style={{ minHeight: '56px' }}
          onInput={e => {
            const el = e.currentTarget;
            el.style.height = 'auto';
            el.style.height = el.scrollHeight + 'px';
          }}
        />
      </div>

      {/* 5. Mood */}
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 mb-2">Mood</div>
        <div className="flex flex-wrap gap-1.5">
          {MOOD_OPTIONS.map(m => (
            <button key={m} onClick={() => updateForm({ mood: m }, true)}
              className={`px-3 py-2 rounded-md text-[13px] border transition-colors min-h-[40px] ${
                form.mood === m
                  ? 'bg-neutral-950 border-neutral-950 text-white'
                  : 'bg-white border-neutral-200 text-neutral-700 active:bg-neutral-50'
              }`}>
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* 6. Lesson notes */}
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 mb-1.5">Lesson Notes</div>
        <textarea
          value={form.lessonNotes}
          onChange={e => {
            const v = e.target.value;
            setForm(f => {
              const next = { ...f, lessonNotes: v };
              schedule(buildFields(next));
              return next;
            });
          }}
          placeholder="Anything notable from today's lesson…"
          rows={3}
          className="w-full border border-neutral-200 rounded-md px-3 py-2 text-[13px] resize-none focus:outline-none focus:ring-1 focus:ring-neutral-900 bg-white"
          style={{ minHeight: '72px' }}
          onInput={e => {
            const el = e.currentTarget;
            el.style.height = 'auto';
            el.style.height = el.scrollHeight + 'px';
          }}
        />
      </div>

      {/* 7. Exams */}
      <UpcomingExams
        studentId={lesson.studentId}
        subjects={lesson.subjects.filter(Boolean) as Subject[]}
        level={lesson.level}
        pw={pw}
        activeType={activeType}
        onExamCompleteChange={onExamCompleteChange}
      />

      {/* Retry if error */}
      {saveStatus === 'error' && (
        <p className="text-[13px] text-red-500 text-center">
          Failed to save —{' '}
          <button className="underline" onClick={() => schedule(buildFields(form), true)}>retry</button>
        </p>
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildExamPillTooltip(s: ExamInfoStatus): string {
  if (!s.activeType) return '';
  if (s.missing.hasNoRecord) return `No ${s.activeType} exam record`;
  const parts: string[] = [];
  if (s.missing.missingDate) parts.push('exam date');
  if (s.missing.missingTopics) parts.push('tested topics');
  return `Missing ${parts.join(' & ')}`;
}

// ── LessonCardRow ─────────────────────────────────────────────────────────────

function LessonCardRow({
  lesson, pw, onUpdate, activeType,
}: { lesson: LessonCard; pw: string; onUpdate: (id: string, updated: Partial<LessonCard>) => void; activeType: ExamType | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(lesson);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  function handleSaved(updated: Partial<LessonCard>) {
    setData(d => ({ ...d, ...updated }));
    onUpdate(lesson.id, updated);
  }

  function handleStatusChange(status: SaveStatus, at: Date | null) {
    setSaveStatus(status);
    if (at) setSavedAt(at);
  }

  function handleExamCompleteChange(complete: boolean) {
    setData(d => ({
      ...d,
      examStatus: { ...d.examStatus, complete },
    }));
  }

  const subjectBadges = (data.subjects ?? []).filter(Boolean);
  const isRescheduled = data.status === 'Rescheduled';
  const isDimmed = isRescheduled || data.status === 'Absent' || data.status === 'Cancelled';
  const rescheduledDatePast = isRescheduled && data.rescheduledToDate && data.rescheduledToDate < todayISO();

  return (
    <div className={`rounded-xl border overflow-hidden transition-shadow ${
      isDimmed
        ? 'bg-neutral-50 border-neutral-100'
        : open
          ? 'bg-white border-neutral-800 shadow-lg'
          : 'bg-white border-neutral-200 shadow-sm'
    }`}>
      {/* Card header */}
      <div
        className={`flex items-start gap-3 px-4 py-3 cursor-pointer ${open && !isDimmed ? 'bg-neutral-950' : 'active:bg-neutral-100'}`}
        onClick={() => setOpen(o => !o)}
      >
        {/* Status dot */}
        <div className="mt-0.5 shrink-0 text-base leading-none">
          {isDimmed
            ? <span className="text-neutral-200">●</span>
            : open
              ? <span className={data.progressLogged ? 'text-emerald-400' : 'text-neutral-600'}>●</span>
              : <span className={data.progressLogged ? 'text-emerald-500' : 'text-neutral-300'}>●</span>
          }
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              className={`font-semibold text-[15px] hover:underline ${isDimmed ? 'text-neutral-400' : open ? 'text-white' : 'text-neutral-900'}`}
              onClick={e => { e.stopPropagation(); router.push(`/admin/progress/student/${data.studentId}`); }}
            >
              {data.studentName || 'Unknown Student'}
            </button>
            {data.examStatus?.activeType && !data.examStatus.complete && (
              <span
                title={buildExamPillTooltip(data.examStatus)}
                className={`px-1.5 py-0.5 rounded-md text-[11px] font-semibold cursor-default ${open ? 'bg-red-900/60 text-red-300' : 'bg-red-50 text-red-500'}`}
              >
                ⚠ {data.examStatus.activeType}
              </span>
            )}
            <span className={`text-[13px] ${open ? 'text-neutral-400' : 'text-neutral-300'}`}>{data.slotTime}</span>
            {open && !isDimmed && <SaveIndicator status={saveStatus} savedAt={savedAt} />}
          </div>
          <div className="flex flex-wrap gap-1 mt-1">
            {data.level && (
              <span className={`px-1.5 py-0.5 rounded-md text-[11px] font-medium ${isDimmed ? 'bg-neutral-100 text-neutral-300' : open ? 'bg-neutral-800 text-neutral-300' : 'bg-neutral-100 text-neutral-600'}`}>{data.level}</span>
            )}
            {subjectBadges.map(s => (
              <span key={s} className={`px-1.5 py-0.5 rounded-md text-[11px] font-medium ${isDimmed ? 'bg-neutral-100 text-neutral-300' : open ? 'bg-neutral-800 text-neutral-300' : 'bg-neutral-100 text-neutral-600'}`}>{s}</span>
            ))}
            {isRescheduled && (
              <span className={`px-1.5 py-0.5 rounded-md text-[11px] font-medium ${rescheduledDatePast ? 'bg-neutral-100 text-neutral-300' : 'bg-blue-50 text-blue-400'}`}>
                → {data.rescheduledToDate ? formatShortDate(data.rescheduledToDate) : '?'}
              </span>
            )}
            {data.status === 'Absent' && (
              <span className="px-1.5 py-0.5 rounded-md text-[11px] font-medium bg-neutral-100 text-neutral-300">Absent</span>
            )}
            {data.status === 'Cancelled' && (
              <span className="px-1.5 py-0.5 rounded-md text-[11px] font-medium bg-neutral-100 text-neutral-300">Cancelled</span>
            )}
          </div>
        </div>

        {/* Chevron */}
        <div className={`shrink-0 mt-1 ${isDimmed ? 'text-neutral-200' : 'text-neutral-300'}`}>
          <svg className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {open && (
        <LogForm
          lesson={data}
          pw={pw}
          onSaved={handleSaved}
          onStatusChange={handleStatusChange}
          activeType={activeType}
          onExamCompleteChange={handleExamCompleteChange}
        />
      )}
    </div>
  );
}

// ── StudentSearchCard ─────────────────────────────────────────────────────────

interface StudentRecord {
  id: string;
  name: string;
  level: string;
  subjects: Subject[];
  subjectLevel: string;
}

function StudentSearchCard({ student, pw, activeType }: { student: StudentRecord; pw: string; activeType: ExamType | null }) {
  const [open, setOpen] = useState(false);

  const subjectBadges = (student.subjects ?? []).filter(Boolean);

  return (
    <div className={`rounded-xl border overflow-hidden transition-shadow ${
      open ? 'bg-white border-neutral-800 shadow-lg' : 'bg-white border-neutral-200 shadow-sm'
    }`}>
      <div
        className={`flex items-start gap-3 px-4 py-3 cursor-pointer ${open ? 'bg-neutral-950' : 'active:bg-neutral-100'}`}
        onClick={() => setOpen(o => !o)}
      >
        {/* Indicator dot */}
        <div className="mt-0.5 shrink-0 text-base leading-none">
          <span className={open ? 'text-neutral-600' : 'text-neutral-300'}>●</span>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`font-semibold text-[15px] ${open ? 'text-white' : 'text-neutral-900'}`}>
              {student.name}
            </span>
            <span className={`text-[11px] px-1.5 py-0.5 rounded-md ${open ? 'bg-neutral-800 text-neutral-400' : 'bg-neutral-100 text-neutral-400'}`}>
              no lesson today
            </span>
          </div>
          <div className="flex flex-wrap gap-1 mt-1">
            {student.level && (
              <span className={`px-1.5 py-0.5 rounded-md text-[11px] font-medium ${open ? 'bg-neutral-800 text-neutral-300' : 'bg-neutral-100 text-neutral-600'}`}>
                {student.level}
              </span>
            )}
            {subjectBadges.map(s => (
              <span key={s} className={`px-1.5 py-0.5 rounded-md text-[11px] font-medium ${open ? 'bg-neutral-800 text-neutral-300' : 'bg-neutral-100 text-neutral-600'}`}>
                {s}
              </span>
            ))}
          </div>
        </div>

        {/* Chevron */}
        <div className={`shrink-0 mt-1 ${open ? 'text-neutral-400' : 'text-neutral-300'}`}>
          <svg className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {open && (
        <div className="border-t border-neutral-100 bg-neutral-50 px-4 py-4">
          <UpcomingExams
            studentId={student.id}
            subjects={student.subjects.filter(Boolean) as Subject[]}
            level={student.level}
            pw={pw}
            activeType={activeType}
          />
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

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
  const [examSeason, setExamSeason] = useState<ExamSeason | null>(null);
  const [examSeasonMenu, setExamSeasonMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [allStudents, setAllStudents] = useState<StudentRecord[]>([]);
  const touchStartY = useRef(0);
  const [pullDistance, setPullDistance] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const PULL_THRESHOLD = 80;
  const MAX_PULL = 120;

  useEffect(() => {
    const pw = getCookie('progress_pw') || getCookie('admin_pw');
    if (pw) { savedPw.current = pw; verifyAndLogin(pw); }
  }, []);

  async function fetchExamSeason(pw: string) {
    try {
      const res = await fetch('/api/admin/exam-season', { headers: { Authorization: `Bearer ${pw}` } });
      if (res.ok) setExamSeason(await res.json());
    } catch {}
  }

  async function updateExamSeason(forceOn: ExamType | null) {
    setExamSeasonMenu(false);
    try {
      const res = await fetch('/api/admin/exam-season', {
        method: 'POST',
        headers: { Authorization: `Bearer ${savedPw.current}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ forceOn }),
      });
      if (res.ok) setExamSeason(await res.json());
    } catch {}
  }

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
        fetchExamSeason(pw);
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
    console.log('[effect] fetchLessons called with date:', d);
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
    console.log('[effect] date changed to:', date, '| authed:', authed);
    if (authed && savedPw.current) fetchLessons(date, savedPw.current);
  }, [authed, date, fetchLessons]);

  useEffect(() => {
    if (!authed || !savedPw.current) return;
    fetch('/api/admin/progress/students', { headers: { Authorization: `Bearer ${savedPw.current}` } })
      .then(r => r.json())
      .then(json => setAllStudents(json.students ?? []))
      .catch(() => {});
  }, [authed]);

  useEffect(() => {
    console.log('[mount] userAgent:', navigator.userAgent);
    console.log('[mount] new Date():', new Date().toString());
    console.log('[mount] timezone:', Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, []);

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
      if (res.ok) setLessons((await res.json()).lessons ?? []);
    } finally {
      setRefreshing(false);
    }
  }

  function onTouchStart(e: React.TouchEvent) {
    if (window.scrollY > 0) return;
    touchStartY.current = e.touches[0].clientY;
    setIsPulling(true);
  }

  function onTouchMove(e: React.TouchEvent) {
    if (!isPulling) return;
    const delta = e.touches[0].clientY - touchStartY.current;
    if (delta <= 0 || window.scrollY > 0) { setPullDistance(0); return; }
    setPullDistance(Math.min(delta * 0.5, MAX_PULL));
  }

  function onTouchEnd() {
    if (pullDistance >= PULL_THRESHOLD) triggerRefresh();
    setPullDistance(0);
    setIsPulling(false);
  }

  useEffect(() => {
    if (!examSeasonMenu) return;
    const close = () => setExamSeasonMenu(false);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [examSeasonMenu]);

  const loggedCount = lessons.filter(l => l.progressLogged).length;

  const trimmedSearch = searchQuery.trim().toLowerCase();
  const filteredLessons = trimmedSearch
    ? lessons.filter(l => l.studentName.toLowerCase().includes(trimmedSearch))
    : lessons;

  // Group filteredLessons by slot time (already sorted earliest→latest)
  const lessonGroups = filteredLessons.reduce<{ time: string; lessons: LessonCard[] }[]>((acc, lesson) => {
    const last = acc[acc.length - 1];
    if (last && last.time === lesson.slotTime) {
      last.lessons.push(lesson);
    } else {
      acc.push({ time: lesson.slotTime, lessons: [lesson] });
    }
    return acc;
  }, []);

  const lessonStudentIds = new Set(lessons.map(l => l.studentId));
  const extraStudents = trimmedSearch
    ? allStudents.filter(s =>
        s.name.toLowerCase().includes(trimmedSearch) &&
        !lessonStudentIds.has(s.id)
      )
    : [];

  // ── Auth screen ──
  if (!authed) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-white rounded-2xl border border-neutral-200 p-6">
          <h1 className="text-[15px] font-semibold text-neutral-900 mb-1">Student Progress</h1>
          <p className="text-[13px] text-neutral-400 mb-5">Enter admin password to continue.</p>
          <form onSubmit={handleLogin} className="space-y-3">
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="Password" autoFocus
              className="w-full border border-neutral-200 rounded-md px-4 py-3 text-[13px] focus:outline-none focus:ring-1 focus:ring-neutral-900" />
            {authError && <p className="text-[13px] text-red-500">{authError}</p>}
            <button type="submit" disabled={authLoading}
              className="w-full bg-neutral-950 text-white font-semibold py-3 rounded-md text-[13px] disabled:opacity-50">
              {authLoading ? 'Checking…' : 'Login'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ── Main ──
  return (
    <div className="min-h-screen bg-neutral-50 pb-20" style={{ overscrollBehaviorY: 'contain' }} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      {(pullDistance > 0 || refreshing) && (
        <div
          className="fixed top-0 left-0 right-0 z-50 flex justify-center pointer-events-none transition-transform"
          style={{ transform: `translateY(${refreshing ? 8 : Math.min(pullDistance - 20, 20)}px)` }}
        >
          <div className="bg-neutral-900 text-white text-[11px] font-medium px-3 py-1 rounded-full flex items-center gap-1.5">
            {refreshing ? (
              <>
                <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Refreshing…
              </>
            ) : pullDistance >= PULL_THRESHOLD ? (
              'Release to refresh'
            ) : (
              'Pull to refresh'
            )}
          </div>
        </div>
      )}

      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-white border-b border-neutral-100">
        <div className="max-w-lg mx-auto px-4 pt-3 pb-2">
          {/* Row 1: back + title + counter */}
          <div className="flex items-center gap-2 mb-2">
            <a href="/admin"
              className="text-neutral-400 hover:text-neutral-600 shrink-0 p-1 min-h-[36px] min-w-[36px] flex items-center justify-center">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </a>
            <span className="flex-1 text-[15px] font-semibold text-neutral-900">Progress</span>
            <button
              onClick={triggerRefresh}
              disabled={refreshing || loading}
              aria-label="Refresh lessons"
              className="shrink-0 p-1 min-h-[36px] min-w-[36px] flex items-center justify-center text-neutral-400 hover:text-neutral-600 active:bg-neutral-100 rounded-md disabled:opacity-40"
            >
              <svg className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
            <span className="shrink-0 text-[13px] font-semibold text-neutral-600">
              {loggedCount}<span className="text-neutral-300"> / </span>{lessons.length}
            </span>
          </div>
          {/* Row 2: date navigation */}
          <div className="flex items-center gap-1">
            <button onClick={() => { console.log('[back] current date:', date); setDate(d => { const next = addDays(d, -1); console.log('[back] d arg:', d, '→ next:', next); return next; }); }}
              className="p-2 rounded-md text-neutral-400 active:bg-neutral-100 min-h-[44px] min-w-[44px] flex items-center justify-center text-lg">
              ‹
            </button>
            <div className="flex-1 flex items-center justify-center gap-2">
              <span className="text-[13px] font-medium text-neutral-900">{formatDate(date)}</span>
              {date !== todayISO() && (
                <button onClick={() => setDate(todayISO())}
                  className="text-[11px] font-semibold text-neutral-600 bg-neutral-100 px-2 py-1 rounded-md active:bg-neutral-200">
                  Today
                </button>
              )}
            </div>
            <button onClick={() => { console.log('[fwd] current date:', date); setDate(d => { const next = addDays(d, 1); console.log('[fwd] d arg:', d, '→ next:', next); return next; }); }}
              className="p-2 rounded-md text-neutral-400 active:bg-neutral-100 min-h-[44px] min-w-[44px] flex items-center justify-center text-lg">
              ›
            </button>
          </div>
          {/* Row 3: search */}
          <div className="mt-2">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search students…"
                className="w-full border border-neutral-200 rounded-md pl-8 pr-8 py-2 text-[13px] bg-white focus:outline-none focus:ring-1 focus:ring-neutral-900"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 text-lg leading-none"
                >
                  ×
                </button>
              )}
            </div>
          </div>
          {/* Row 4: exam season toggle */}
          <div className="flex items-center justify-between pt-2 pb-1 border-t border-neutral-100 mt-2 relative">
            <span className="text-[12px] text-neutral-500">
              Exam season
              {examSeason?.active
                ? <> · <span className="font-semibold text-neutral-700">{examSeason.active}</span> · <span className="text-neutral-400">{examSeason.source}</span></>
                : <> · <span className="text-neutral-400">OFF</span></>
              }
            </span>
            <button
              onClick={() => setExamSeasonMenu(v => !v)}
              className="text-[11px] font-semibold text-neutral-600 bg-neutral-100 px-2.5 py-1 rounded-md active:bg-neutral-200 flex items-center gap-1"
            >
              {examSeason?.active ? 'Change' : 'Force on'} <span className="text-[10px]">▾</span>
            </button>
            {examSeasonMenu && (
              <div
                className="absolute right-0 top-full mt-1 bg-white border border-neutral-200 rounded-xl shadow-lg z-20 py-1 min-w-[140px]"
                onClick={e => e.stopPropagation()}
              >
                {(['WA1', 'WA2', 'WA3', 'EOY'] as ExamType[]).map(t => (
                  <button key={t}
                    onClick={() => updateExamSeason(t)}
                    className={`w-full text-left px-4 py-2 text-[13px] hover:bg-neutral-50 ${examSeason?.override === t ? 'font-semibold text-neutral-900' : 'text-neutral-700'}`}>
                    {t}
                  </button>
                ))}
                <div className="border-t border-neutral-100 my-1" />
                <button
                  onClick={() => updateExamSeason(null)}
                  className="w-full text-left px-4 py-2 text-[13px] text-neutral-500 hover:bg-neutral-50">
                  Auto (clear override)
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Lesson cards */}
      <div className="max-w-lg mx-auto px-4 pt-4">
        {loading && <div className="text-center text-[13px] text-neutral-400 py-12">Loading…</div>}
        {!loading && fetchError && <div className="text-center text-[13px] text-red-500 py-12">{fetchError}</div>}
        {!loading && !fetchError && filteredLessons.length === 0 && extraStudents.length === 0 && (
          <div className="text-center text-[13px] text-neutral-400 py-12">
            {trimmedSearch ? 'No students match your search' : 'No lessons on this day'}
          </div>
        )}
        {!loading && (
          <div className="space-y-4">
            {lessonGroups.map(group => (
              <div key={group.time || 'no-time'}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 mb-2 px-1">
                  {group.time || '—'}
                </p>
                <div className="space-y-2">
                  {group.lessons.map(lesson => (
                    <LessonCardRow key={lesson.id} lesson={lesson} pw={savedPw.current} onUpdate={updateLesson} activeType={examSeason?.active ?? null} />
                  ))}
                </div>
              </div>
            ))}
            {extraStudents.length > 0 && (
              <div>
                {filteredLessons.length > 0 && (
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 mb-2 px-1">Other students</p>
                )}
                <div className="space-y-2">
                  {extraStudents.map(student => (
                    <StudentSearchCard key={student.id} student={student} pw={savedPw.current} activeType={examSeason?.active ?? null} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
