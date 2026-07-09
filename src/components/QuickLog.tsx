'use client';
// Fast in-class progress capture for /admin/schedule.
//
// Two modes, both writing the EXISTING Lessons progress fields through the
// existing routes (14-day edit window enforced server-side there):
//   - QuickLogSheet — tap-log bottom sheet opened from a chip's 📝 pill:
//     three big mastery buttons, editable topic chips (pre-filled from this
//     lesson's Topics Covered or the student's last lesson), quick-note chips
//     appended to Lesson Notes. One POST to /api/admin-schedule/lesson-update
//     (+ optional lesson-prev-update for Homework Returned).
//   - VoiceLog — 🎙 header button: MediaRecorder → POST /api/admin/voice-log
//     (Gemini transcribe + Claude parse, audio never stored) → editable
//     confirm sheet → batch writes via the same two routes.

import React, { useState, useEffect, useRef, useCallback } from 'react';

// ─── Shared bits ──────────────────────────────────────────────────────────────

export interface QuickLogLessonRef {
  id: string;
  studentName: string;
  date: string;
}

export interface VoiceRosterEntry {
  lessonId: string;
  studentName: string;
  slotTime?: string;
}

type ToastFn = (type: 'success' | 'error', message: string) => void;

const MASTERY_OPTS = [
  { value: 'Strong', label: '🟢 Strong', sel: { background: '#dcfce7', color: '#166534', borderColor: '#86efac' } },
  { value: 'OK',     label: '🟡 OK',     sel: { background: '#fef9c3', color: '#854d0e', borderColor: '#fde047' } },
  { value: 'Slow',   label: '🔴 Slow',   sel: { background: '#fee2e2', color: '#991b1b', borderColor: '#fca5a5' } },
] as const;

const QUICK_NOTES = ['HW not done', 'Careless slips', 'Great today'];
const HW_OPTS = ['Yes', 'Partial', 'No'] as const;

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
  display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
  zIndex: 400, padding: '0 0 8px',
};
const cardStyle: React.CSSProperties = {
  background: 'white', borderRadius: '20px 20px 12px 12px',
  width: '100%', maxWidth: 520, boxShadow: '0 -4px 32px rgba(0,0,0,0.15)',
  maxHeight: '85vh', overflowY: 'auto',
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};
const sectionLabel: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4,
};
const chipBase: React.CSSProperties = {
  fontSize: 13, padding: '5px 11px', borderRadius: 999, border: '1px solid #cbd5e1',
  background: '#f8fafc', color: '#334155', cursor: 'pointer', fontFamily: 'inherit',
};
const primaryBtn: React.CSSProperties = {
  flex: 1, padding: 12, borderRadius: 10, border: 'none', background: '#1a365d',
  color: '#FFF8E7', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
};
const cancelBtn: React.CSSProperties = {
  flex: 1, padding: 12, borderRadius: 10, border: 'none', background: '#f1f5f9',
  color: '#64748b', fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
};

function splitTopics(s: string): string[] {
  return (s || '').split(',').map(t => t.trim()).filter(Boolean);
}

/** Union-merge topics, case-insensitive, preserving existing order. */
function mergeTopics(existing: string[], added: string[]): string[] {
  const out = [...existing];
  for (const t of added) {
    if (!out.some(e => e.toLowerCase() === t.toLowerCase())) out.push(t);
  }
  return out;
}

interface LessonCtxLite {
  current?: { topicsCovered?: string; mastery?: string; lessonNotes?: string };
  prev?: { id: string; date: string; topicsCovered?: string; homeworkReturned?: string } | null;
  isEditable?: boolean;
  isFuture?: boolean;
}

async function fetchLessonCtx(lessonId: string): Promise<LessonCtxLite> {
  const res = await fetch(`/api/admin-schedule/lesson-context?id=${lessonId}`);
  if (!res.ok) throw new Error('context fetch failed');
  return res.json();
}

async function postLessonUpdate(lessonId: string, fields: Record<string, string>): Promise<void> {
  const res = await fetch('/api/admin-schedule/lesson-update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lessonId, fields }),
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json.error || `HTTP ${res.status}`);
  }
}

async function postPrevHw(prevLessonId: string, homeworkReturned: string): Promise<void> {
  const res = await fetch('/api/admin-schedule/lesson-prev-update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lessonId: prevLessonId, homeworkReturned }),
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json.error || `HTTP ${res.status}`);
  }
}

// ─── A. Tap-log bottom sheet ──────────────────────────────────────────────────

export function QuickLogSheet({ lesson, onClose, onLogged, onToast }: {
  lesson: QuickLogLessonRef;
  onClose: () => void;
  /** Called after a successful save so the page can flip the green progress dot. */
  onLogged: (lessonId: string) => void;
  onToast: ToastFn;
}) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [editable, setEditable] = useState(true);
  const [mastery, setMastery] = useState('');
  const [topics, setTopics] = useState<string[]>([]);
  const [topicInput, setTopicInput] = useState('');
  const [notes, setNotes] = useState<string[]>([]);
  const [freeNote, setFreeNote] = useState('');
  const [hwPrev, setHwPrev] = useState('');
  const [saving, setSaving] = useState(false);
  // Loaded baseline — used to append (not clobber) notes and to skip no-op writes.
  const baseRef = useRef({ mastery: '', topics: [] as string[], notes: '', prevId: null as string | null, prevHw: '', prevDate: '' });

  useEffect(() => {
    let cancelled = false;
    fetchLessonCtx(lesson.id)
      .then(ctx => {
        if (cancelled) return;
        const cur = ctx.current ?? {};
        const curTopics = splitTopics(cur.topicsCovered ?? '');
        // Pre-fill: this lesson's topics, else the student's last lesson's topics.
        const prefill = curTopics.length ? curTopics : splitTopics(ctx.prev?.topicsCovered ?? '');
        baseRef.current = {
          mastery: cur.mastery ?? '',
          topics: curTopics,
          notes: cur.lessonNotes ?? '',
          prevId: ctx.prev?.id ?? null,
          prevHw: ctx.prev?.homeworkReturned ?? '',
          prevDate: ctx.prev?.date ?? '',
        };
        setMastery(cur.mastery ?? '');
        setTopics(prefill);
        setHwPrev(ctx.prev?.homeworkReturned ?? '');
        setEditable(ctx.isEditable !== false);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoadError('Could not load lesson context');
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [lesson.id]);

  function addTopicFromInput() {
    const parts = splitTopics(topicInput);
    if (!parts.length) return;
    setTopics(t => mergeTopics(t, parts));
    setTopicInput('');
  }

  async function handleSave() {
    if (saving) return;
    const base = baseRef.current;
    const fields: Record<string, string> = {};
    if (mastery && mastery !== base.mastery) fields.mastery = mastery;
    const topicsStr = topics.join(', ');
    if (topicsStr !== base.topics.join(', ')) fields.topicsCovered = topicsStr;
    const appendParts = [...notes, freeNote.trim()].filter(Boolean);
    if (appendParts.length) {
      const appended = appendParts.join('; ');
      fields.lessonNotes = base.notes ? `${base.notes}\n${appended}` : appended;
    }
    const writeHw = hwPrev && hwPrev !== base.prevHw && base.prevId;

    if (Object.keys(fields).length === 0 && !writeHw) { onClose(); return; }

    // Optimistic: close immediately, toast on outcome.
    setSaving(true);
    onClose();
    try {
      const tasks: Promise<void>[] = [];
      if (Object.keys(fields).length) tasks.push(postLessonUpdate(lesson.id, fields));
      if (writeHw) tasks.push(postPrevHw(base.prevId!, hwPrev));
      await Promise.all(tasks);
      if (Object.keys(fields).length) onLogged(lesson.id);
      onToast('success', `✓ Logged — ${lesson.studentName}`);
    } catch (e) {
      onToast('error', e instanceof Error ? e.message.slice(0, 80) : 'Save failed');
    }
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={cardStyle} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: '#0f172a' }}>📝 {lesson.studentName}</div>
          <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>Quick log · {lesson.date}</div>
        </div>
        <div style={{ padding: '14px 20px 18px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {loading ? (
            <div style={{ color: '#94a3b8', fontSize: 14, textAlign: 'center', padding: '18px 0' }}>Loading…</div>
          ) : loadError ? (
            <div style={{ color: '#dc2626', fontSize: 14 }}>{loadError}</div>
          ) : !editable ? (
            <div style={{ color: '#92400e', fontSize: 14, background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 12px' }}>
              Editing locked — outside the 14-day window (or lesson is in the future).
            </div>
          ) : (
            <>
              {/* Mastery — three big buttons */}
              <div>
                <div style={{ ...sectionLabel, marginBottom: 8 }}>Mastery</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {MASTERY_OPTS.map(o => {
                    const active = mastery === o.value;
                    return (
                      <button
                        key={o.value}
                        onClick={() => setMastery(m => m === o.value ? '' : o.value)}
                        style={{
                          flex: 1, padding: '14px 4px', borderRadius: 12, fontSize: 15, fontWeight: 700,
                          fontFamily: 'inherit', cursor: 'pointer',
                          border: active ? `1.5px solid ${o.sel.borderColor}` : '1.5px solid #e2e8f0',
                          background: active ? o.sel.background : '#f8fafc',
                          color: active ? o.sel.color : '#475569',
                        }}
                      >{o.label}</button>
                    );
                  })}
                </div>
              </div>

              {/* Topics — editable chips, pre-filled */}
              <div>
                <div style={{ ...sectionLabel, marginBottom: 8 }}>Topics covered</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: topics.length ? 8 : 0 }}>
                  {topics.map(t => (
                    <button key={t} onClick={() => setTopics(cur => cur.filter(x => x !== t))}
                      title="Tap to remove"
                      style={{ ...chipBase, background: '#eff6ff', borderColor: '#bfdbfe', color: '#1d4ed8' }}>
                      {t} ✕
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    value={topicInput}
                    onChange={e => setTopicInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTopicFromInput(); } }}
                    placeholder="Add topic…"
                    style={{ flex: 1, padding: '8px 10px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 14, fontFamily: 'inherit' }}
                  />
                  <button onClick={addTopicFromInput} style={{ ...chipBase, padding: '8px 14px' }}>＋</button>
                </div>
              </div>

              {/* Quick notes — appended to Lesson Notes */}
              <div>
                <div style={{ ...sectionLabel, marginBottom: 8 }}>Quick note</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                  {QUICK_NOTES.map(n => {
                    const active = notes.includes(n);
                    return (
                      <button key={n} onClick={() => setNotes(cur => active ? cur.filter(x => x !== n) : [...cur, n])}
                        style={{ ...chipBase, ...(active ? { background: '#1a365d', borderColor: '#1a365d', color: '#FFF8E7' } : {}) }}>
                        {n}
                      </button>
                    );
                  })}
                </div>
                <input
                  value={freeNote}
                  onChange={e => setFreeNote(e.target.value)}
                  placeholder="Anything else… (appended to lesson notes)"
                  style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box' }}
                />
              </div>

              {/* Previous-lesson homework — optional */}
              {baseRef.current.prevId && (
                <div>
                  <div style={{ ...sectionLabel, marginBottom: 8 }}>
                    HW returned{baseRef.current.prevDate ? ` (prev lesson ${baseRef.current.prevDate})` : ''}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {HW_OPTS.map(v => {
                      const active = hwPrev === v;
                      return (
                        <button key={v} onClick={() => setHwPrev(h => h === v ? '' : v)}
                          style={{ ...chipBase, flex: 1, textAlign: 'center', ...(active ? { background: '#1a365d', borderColor: '#1a365d', color: '#FFF8E7' } : {}) }}>
                          {v}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: 10 }}>
                <button style={cancelBtn} onClick={onClose}>Cancel</button>
                <button style={primaryBtn} onClick={handleSave} disabled={saving}>Save</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── B. Voice log ─────────────────────────────────────────────────────────────

interface VoiceRow {
  lessonId: string;
  studentName: string;
  include: boolean;
  mastery: '' | 'Strong' | 'OK' | 'Slow';
  topicsText: string;
  homeworkPrev: '' | 'Yes' | 'Partial' | 'No';
  note: string;
}

type VoicePhase = 'idle' | 'recording' | 'processing' | 'confirm';

export function VoiceLog({ getRoster, onApplied, onToast }: {
  /** Lessons with linked students for the currently viewed day. */
  getRoster: () => VoiceRosterEntry[];
  /** Lesson ids whose progress was written — page flips the green dots. */
  onApplied: (lessonIds: string[]) => void;
  onToast: ToastFn;
}) {
  const [phase, setPhase] = useState<VoicePhase>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [rows, setRows] = useState<VoiceRow[]>([]);
  const [transcript, setTranscript] = useState('');
  const [unassigned, setUnassigned] = useState<string[]>([]);
  const [applying, setApplying] = useState(false);

  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const cancelledRef = useRef(false);
  const rosterRef = useRef<VoiceRosterEntry[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cleanupMedia = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    recRef.current = null;
    chunksRef.current = [];
  }, []);

  useEffect(() => cleanupMedia, [cleanupMedia]);

  async function startRecording() {
    const roster = getRoster();
    if (!roster.length) { onToast('error', 'No lessons with students on this day'); return; }
    rosterRef.current = roster;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      onToast('error', 'Microphone access denied');
      return;
    }
    const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
      .find(m => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) || '';
    const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    streamRef.current = stream;
    recRef.current = rec;
    chunksRef.current = [];
    cancelledRef.current = false;
    rec.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    rec.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' });
      const wasCancelled = cancelledRef.current;
      cleanupMedia();
      if (wasCancelled) { setPhase('idle'); return; }
      if (blob.size < 1000) { setPhase('idle'); onToast('error', 'Recording too short'); return; }
      void processAudio(blob);
    };
    rec.start(1000); // 1 s timeslice so chunks flush during long recordings
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000);
    setPhase('recording');
  }

  function stopRecording(cancel: boolean) {
    cancelledRef.current = cancel;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    try { recRef.current?.stop(); } catch { cleanupMedia(); setPhase('idle'); }
  }

  async function processAudio(blob: Blob) {
    setPhase('processing');
    try {
      const form = new FormData();
      const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
      form.append('audio', blob, `voice-log.${ext}`);
      form.append('lessons', JSON.stringify(rosterRef.current));
      const res = await fetch('/api/admin/voice-log', { method: 'POST', body: form });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      const updates: VoiceRow[] = (json.updates ?? []).map((u: {
        lessonId: string; studentName: string; mastery?: string; topics?: string[]; homeworkPrev?: string; note?: string;
      }) => ({
        lessonId: u.lessonId,
        studentName: u.studentName,
        include: true,
        mastery: (u.mastery ?? '') as VoiceRow['mastery'],
        topicsText: (u.topics ?? []).join(', '),
        homeworkPrev: (u.homeworkPrev ?? '') as VoiceRow['homeworkPrev'],
        note: u.note ?? '',
      }));
      setTranscript(json.transcript ?? '');
      setUnassigned(json.unassigned ?? []);
      setRows(updates);
      setPhase('confirm');
      if (!updates.length) onToast('error', 'No student updates recognised — check the transcript');
    } catch (e) {
      setPhase('idle');
      onToast('error', e instanceof Error ? e.message.slice(0, 100) : 'Voice log failed');
    }
  }

  function patchRow(i: number, patch: Partial<VoiceRow>) {
    setRows(rs => rs.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  }

  async function applyRow(r: VoiceRow): Promise<string> {
    // Context fetch only when we must append notes / merge topics / find the prev lesson.
    const needsCtx = !!r.note.trim() || !!r.homeworkPrev || !!r.topicsText.trim();
    let existingNotes = '', existingTopics: string[] = [], prevId: string | null = null;
    if (needsCtx) {
      const ctx = await fetchLessonCtx(r.lessonId);
      existingNotes = ctx.current?.lessonNotes ?? '';
      existingTopics = splitTopics(ctx.current?.topicsCovered ?? '');
      prevId = ctx.prev?.id ?? null;
    }
    const fields: Record<string, string> = {};
    if (r.mastery) fields.mastery = r.mastery;
    const newTopics = splitTopics(r.topicsText);
    if (newTopics.length) fields.topicsCovered = mergeTopics(existingTopics, newTopics).join(', ');
    if (r.note.trim()) {
      const line = `🎙 ${r.note.trim()}`;
      fields.lessonNotes = existingNotes ? `${existingNotes}\n${line}` : line;
    }
    const tasks: Promise<void>[] = [];
    if (Object.keys(fields).length) tasks.push(postLessonUpdate(r.lessonId, fields));
    if (r.homeworkPrev && prevId) tasks.push(postPrevHw(prevId, r.homeworkPrev));
    if (!tasks.length) throw new Error('nothing to write');
    await Promise.all(tasks);
    return r.lessonId;
  }

  async function handleApply() {
    const included = rows.filter(r => r.include);
    if (!included.length) { setPhase('idle'); return; }
    setApplying(true);
    const results = await Promise.allSettled(included.map(r => applyRow(r)));
    setApplying(false);
    const okIds = results.filter((x): x is PromiseFulfilledResult<string> => x.status === 'fulfilled').map(x => x.value);
    const failed = included.length - okIds.length;
    if (okIds.length) onApplied(okIds);
    if (failed === 0) {
      onToast('success', `✓ Logged ${okIds.length} student${okIds.length !== 1 ? 's' : ''}`);
      setPhase('idle');
      setRows([]); setTranscript(''); setUnassigned([]);
    } else {
      onToast('error', `${failed} of ${included.length} failed — failed rows kept`);
      setRows(rs => rs.filter(r => r.include && !okIds.includes(r.lessonId)));
    }
  }

  const mm = String(Math.floor(elapsed / 60)).padStart(1, '0');
  const ss = String(elapsed % 60).padStart(2, '0');

  const selectStyle: React.CSSProperties = {
    padding: '6px 8px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', background: 'white',
  };
  const inputStyle: React.CSSProperties = {
    padding: '6px 8px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box', width: '100%',
  };

  return (
    <>
      <button
        onClick={startRecording}
        title="Voice log — dictate progress for today's students"
        style={{
          display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px',
          border: '1px solid #cbd5e1', borderRadius: 999, background: 'white',
          fontSize: 13, fontWeight: 600, color: '#1a365d', cursor: 'pointer', fontFamily: 'inherit',
          whiteSpace: 'nowrap',
        }}
      >🎙<span className="voice-log-label"> Voice log</span></button>

      {/* Recording sheet */}
      {phase === 'recording' && (
        <div style={overlayStyle}>
          <div style={{ ...cardStyle, maxWidth: 440 }}>
            <div style={{ padding: '22px 20px 18px', textAlign: 'center' }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#dc2626', animation: 'vlPulse 1.2s ease-in-out infinite' }} />
                Recording… {mm}:{ss}
              </div>
              <style>{`@keyframes vlPulse { 0%,100% { opacity: 1; } 50% { opacity: 0.25; } }`}</style>
              <div style={{ fontSize: 13, color: '#64748b', marginTop: 8, lineHeight: 1.5 }}>
                e.g. &ldquo;Jayden strong today, covered vectors, homework not done.
                Wei Ling okay, still slow on integration by parts.&rdquo;
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
                <button style={cancelBtn} onClick={() => stopRecording(true)}>Cancel</button>
                <button style={{ ...primaryBtn, background: '#dc2626', color: 'white' }} onClick={() => stopRecording(false)}>■ Stop &amp; process</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Processing sheet */}
      {phase === 'processing' && (
        <div style={overlayStyle}>
          <div style={{ ...cardStyle, maxWidth: 440 }}>
            <div style={{ padding: '26px 20px', textAlign: 'center', color: '#475569', fontSize: 15, fontWeight: 600 }}>
              🎙 Transcribing &amp; matching students…
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 6, fontWeight: 400 }}>Audio is processed in memory and never stored.</div>
            </div>
          </div>
        </div>
      )}

      {/* Confirm sheet */}
      {phase === 'confirm' && (
        <div style={overlayStyle} onClick={() => !applying && setPhase('idle')}>
          <div style={{ ...cardStyle, maxWidth: 560 }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid #f1f5f9' }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: '#0f172a' }}>🎙 Confirm voice log</div>
              <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>Review and edit before saving</div>
            </div>
            <div style={{ padding: '12px 20px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {rows.length === 0 && (
                <div style={{ fontSize: 14, color: '#94a3b8' }}>No per-student updates recognised.</div>
              )}
              {rows.map((r, i) => (
                <div key={r.lessonId} style={{
                  border: '1px solid #e2e8f0', borderRadius: 12, padding: '10px 12px',
                  opacity: r.include ? 1 : 0.45, display: 'flex', flexDirection: 'column', gap: 8,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="checkbox" checked={r.include} onChange={e => patchRow(i, { include: e.target.checked })} />
                    <span style={{ fontWeight: 700, fontSize: 14, color: '#0f172a', flex: 1 }}>{r.studentName}</span>
                    <select value={r.mastery} onChange={e => patchRow(i, { mastery: e.target.value as VoiceRow['mastery'] })} style={selectStyle}>
                      <option value="">Mastery —</option>
                      <option value="Strong">🟢 Strong</option>
                      <option value="OK">🟡 OK</option>
                      <option value="Slow">🔴 Slow</option>
                    </select>
                    <select value={r.homeworkPrev} onChange={e => patchRow(i, { homeworkPrev: e.target.value as VoiceRow['homeworkPrev'] })} style={selectStyle}>
                      <option value="">HW —</option>
                      <option value="Yes">HW Yes</option>
                      <option value="Partial">HW Partial</option>
                      <option value="No">HW No</option>
                    </select>
                  </div>
                  <input value={r.topicsText} onChange={e => patchRow(i, { topicsText: e.target.value })}
                    placeholder="Topics (comma-separated)" style={inputStyle} />
                  <input value={r.note} onChange={e => patchRow(i, { note: e.target.value })}
                    placeholder="Note (appended to lesson notes)" style={inputStyle} />
                </div>
              ))}
              {unassigned.length > 0 && (
                <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '8px 12px', fontSize: 13, color: '#92400e' }}>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>⚠ Couldn&apos;t match to a student:</div>
                  {unassigned.map((u, idx) => <div key={idx}>• {u}</div>)}
                </div>
              )}
              {transcript && (
                <details style={{ fontSize: 13, color: '#475569' }}>
                  <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Transcript</summary>
                  <div style={{ marginTop: 6, whiteSpace: 'pre-wrap', background: '#f8fafc', borderRadius: 8, padding: '8px 10px' }}>{transcript}</div>
                </details>
              )}
              <div style={{ display: 'flex', gap: 10 }}>
                <button style={cancelBtn} disabled={applying} onClick={() => setPhase('idle')}>Discard</button>
                <button style={primaryBtn} disabled={applying || rows.every(r => !r.include)} onClick={handleApply}>
                  {applying ? 'Saving…' : `Save ${rows.filter(r => r.include).length} update${rows.filter(r => r.include).length !== 1 ? 's' : ''}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
