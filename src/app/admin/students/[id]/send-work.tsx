'use client';
// "From Adrian" — Send-work card on the student profile (SPEC-ASSIGN.md v1).
//
// Two kinds: a bank QUESTION (student answers it in the in-browser practice
// grader — instant marks, feeds mastery) or a WORKSHEET PDF (uploaded here or
// picked from the Dropbox practice/prelim library — student photographs their
// working via /app/submit → 🌙 queue → auto-release). Optional due date and a
// note. Existing assignments list below with a revoke action.
//
// ?send=<topic> on the profile URL (the 📬 Send follow-up links in marking
// triage + the papers library) pre-selects the topic and opens the question
// picker, so a flagged weakness becomes an assignment in three taps.
//
// Calls carry the admin cookie (same as every other /admin/* fetch here).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import 'katex/dist/katex.min.css';
import { uploadStudentFile } from '@/lib/student-files-client';
import { fileHref } from '@/lib/student-files-url';
import { ALL_QB_LEVELS, qbLevelsFor } from '@/lib/qb-levels';
import { dueLabel, isPending, statusLabel, type AssignmentRow } from '@/lib/assignments';

type Candidate = {
  id: string; markdown: string; marks: number | null; figureUrl: string | null;
  difficulty: string | null; source: string; hasSolution: boolean;
};
type LibraryEntry = { id: string; title: string; pdfUrl: string; uploadedAt: string };

// QB level key → Dropbox notes slug (lib/notes-list NOTE_SLUG_TO_LEVELS).
function dbxSlugFor(levelKey: string): string {
  if (levelKey === 'S1') return 's1';
  if (levelKey === 'S2') return 's2';
  if (levelKey.startsWith('JC')) return 'jc';
  if (levelKey.includes('AM')) return 'am';
  return 'em';
}

const card: React.CSSProperties = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 };
const input: React.CSSProperties = { width: '100%', minWidth: 0, border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 10px', fontSize: 14, outline: 'none', boxSizing: 'border-box', background: '#fff' };
const label: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 4 };
const btnPrimary: React.CSSProperties = { fontSize: 14, fontWeight: 600, color: '#fff', background: '#1e3a5f', border: 'none', borderRadius: 8, padding: '9px 16px', cursor: 'pointer' };
const btnGhost: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: '#1e3a5f', background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' };
const pill = (on: boolean): React.CSSProperties => ({
  fontSize: 13, fontWeight: 600, padding: '6px 12px', borderRadius: 999, cursor: 'pointer',
  border: on ? '1px solid #1e3a5f' : '1px solid #e5e7eb', background: on ? '#1e3a5f' : '#fff', color: on ? '#fff' : '#374151',
});

export default function SendWorkCard({ studentId, studentName, studentLevel, subjects, prefillTopic, prefillTopics }: {
  studentId: string; studentName: string; studentLevel: string; subjects: string[]; prefillTopic?: string | null;
  /** The other weak topics from the same paper, offered as one-click switches
   *  (31 Aug 2026). A paper rarely fails on one thing, and sending three
   *  follow-ups used to mean three trips back to triage. */
  prefillTopics?: string[];
}) {
  const levels = useMemo(() => {
    const own = qbLevelsFor(studentLevel, subjects);
    return own.length ? own : ALL_QB_LEVELS;
  }, [studentLevel, subjects]);

  const [open, setOpen] = useState(!!prefillTopic);
  const [kind, setKind] = useState<'question' | 'worksheet'>('question');
  const [level, setLevel] = useState(levels[0]?.key || 'AM');
  const [topics, setTopics] = useState<{ topic: string; questionCount: number; advancedCount: number }[]>([]);
  const [topic, setTopic] = useState(prefillTopic || '');
  const [sentTopics, setSentTopics] = useState<string[]>([]);
  const queue = (prefillTopics || []).filter(t => t && t !== topic);
  const [tier, setTier] = useState<'' | 'Standard' | 'Advanced'>('');
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [loadingCands, setLoadingCands] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [dueOn, setDueOn] = useState('');
  const [title, setTitle] = useState('');
  // worksheet source
  const [wsSource, setWsSource] = useState<'upload' | 'library'>('library');
  const [libKind, setLibKind] = useState<'practice' | 'prelim'>('practice');
  const [library, setLibrary] = useState<LibraryEntry[] | null>(null);
  const [libPick, setLibPick] = useState<LibraryEntry | null>(null);
  const [uploaded, setUploaded] = useState<{ url: string; name: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  // send + list
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [list, setList] = useState<AssignmentRow[]>([]);

  // The prefill can arrive a tick after mount (the page reads it from window).
  useEffect(() => {
    if (prefillTopic) { setTopic(prefillTopic); setKind('question'); setOpen(true); }
  }, [prefillTopic]);

  const loadList = useCallback(async () => {
    try {
      const r = await fetch(`/api/admin/assignments?studentId=${encodeURIComponent(studentId)}`);
      if (r.ok) setList(((await r.json()).assignments || []) as AssignmentRow[]);
    } catch { /* non-fatal */ }
  }, [studentId]);
  useEffect(() => { loadList(); }, [loadList]);

  // Topics for the chosen level (admin path of the practice topics route).
  useEffect(() => {
    let dead = false;
    setTopics([]);
    fetch(`/api/portal/practice/topics?level=${encodeURIComponent(level)}`)
      .then(r => r.ok ? r.json() : { topics: [] })
      .then(j => {
        if (dead) return;
        const ts = ((j.topics || []) as { topic: string; n?: number; questionCount?: number; advanced_count?: number; advancedCount?: number }[])
          .map(t => ({ topic: t.topic, questionCount: Number(t.questionCount ?? t.n ?? 0), advancedCount: Number(t.advancedCount ?? t.advanced_count ?? 0) }));
        setTopics(ts);
      })
      .catch(() => { if (!dead) setTopics([]); });
    return () => { dead = true; };
  }, [level]);

  // If the prefilled topic doesn't exist at this level, try the other levels the
  // student has (a follow-up from an A-Math paper on an E-Math-default student).
  useEffect(() => {
    if (!prefillTopic || !topics.length) return;
    if (topics.some(t => t.topic.toLowerCase() === prefillTopic.toLowerCase())) return;
    const next = levels.find(l => l.key !== level);
    if (next && levels.length > 1 && level === levels[0].key) setLevel(next.key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topics]);

  const loadCandidates = useCallback(async () => {
    if (!topic) return;
    setLoadingCands(true); setCandidates(null); setPicked(null);
    try {
      const qs = new URLSearchParams({ level, topic, limit: '12' });
      if (tier) qs.set('tier', tier);
      const r = await fetch(`/api/admin/assignments/candidates?${qs}`);
      const j = await r.json();
      setCandidates((j.questions || []) as Candidate[]);
    } catch { setCandidates([]); }
    finally { setLoadingCands(false); }
  }, [level, topic, tier]);
  useEffect(() => { if (kind === 'question' && topic) loadCandidates(); }, [kind, topic, tier, level, loadCandidates]);

  // Dropbox library for the worksheet picker.
  useEffect(() => {
    if (kind !== 'worksheet' || wsSource !== 'library') return;
    let dead = false;
    setLibrary(null);
    fetch(`/api/admin-notes?level=${dbxSlugFor(level)}&kind=${libKind}`)
      .then(r => r.ok ? r.json() : [])
      .then(j => { if (!dead) setLibrary((Array.isArray(j) ? j : []) as LibraryEntry[]); })
      .catch(() => { if (!dead) setLibrary([]); });
    return () => { dead = true; };
  }, [kind, wsSource, libKind, level]);

  const onFile = async (f: File | null) => {
    if (!f) return;
    if (f.type && f.type !== 'application/pdf' && !/\.pdf$/i.test(f.name)) { setMsg({ ok: false, text: 'Worksheets must be PDFs.' }); return; }
    setUploading(true); setMsg(null);
    try {
      const blob = await uploadStudentFile(
        `/api/admin/assignments/upload-token?studentId=${encodeURIComponent(studentId)}&filename=${encodeURIComponent(f.name)}`,
        f,
        { contentType: 'application/pdf' },
      );
      setUploaded({ url: blob.url, name: f.name });
      if (!title) setTitle(f.name.replace(/\.pdf$/i, '').replace(/[-_]+/g, ' ').trim());
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally { setUploading(false); }
  };

  const canSend = kind === 'question'
    ? !!picked
    : (wsSource === 'upload' ? !!uploaded : !!libPick) && !!(title.trim() || libPick?.title);

  const send = async () => {
    if (!canSend || sending) return;
    setSending(true); setMsg(null);
    const body: Record<string, unknown> = { studentId, kind, level, topic: topic || null, tier: tier || null, note: note.trim() || null, dueOn: dueOn || null };
    if (kind === 'question') {
      body.questionId = picked;
      if (title.trim()) body.title = title.trim();
    } else if (wsSource === 'upload' && uploaded) {
      body.pdfUrl = uploaded.url; body.pdfSource = 'upload'; body.title = title.trim();
    } else if (libPick) {
      // The library's pdfUrl is a relative admin proxy; the server copies the
      // Dropbox bytes to Blob and overwrites pdf_url with the stable URL.
      const path = libPick.id.startsWith('dbx:') ? libPick.id.slice(4) : '';
      body.pdfSource = path ? `dropbox:${path}` : 'library';
      body.pdfUrl = path ? `https://www.adrianmathtuition.com/api/admin-notes/dropbox-open?path=${encodeURIComponent(path)}` : libPick.pdfUrl;
      body.title = title.trim() || libPick.title;
    }
    try {
      const r = await fetch('/api/admin/assignments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setMsg({ ok: true, text: `Sent to ${studentName.split(' ')[0]}${j.notified ? ' — Telegram nudge delivered' : ' — shows on their Home next visit'}.` });
      // Strike the topic off the paper's list so the next one is obvious.
      if (topic) setSentTopics(prev => prev.includes(topic) ? prev : [...prev, topic]);
      setPicked(null); setNote(''); setDueOn(''); setTitle(''); setUploaded(null); setLibPick(null);
      loadList();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally { setSending(false); }
  };

  const revoke = async (id: string) => {
    if (!confirm('Take this back? The student will no longer see it.')) return;
    const r = await fetch('/api/admin/assignments', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action: 'revoke' }) });
    if (!r.ok) { const j = await r.json().catch(() => ({})); setMsg({ ok: false, text: j.error || 'Could not revoke' }); }
    loadList();
  };

  const pending = list.filter(a => isPending(a.status));
  const done = list.filter(a => !isPending(a.status));

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {!open && (
        <button style={btnPrimary} onClick={() => setOpen(true)}>📬 Send {studentName.split(' ')[0]} something to do</button>
      )}

      {open && (
        <div style={{ ...card, display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button style={pill(kind === 'question')} onClick={() => setKind('question')}>✏️ Bank question</button>
            <button style={pill(kind === 'worksheet')} onClick={() => setKind('worksheet')}>📄 Worksheet PDF</button>
            <span style={{ flex: 1 }} />
            <button style={{ ...btnGhost, padding: '4px 10px' }} onClick={() => setOpen(false)}>Close</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
            <div>
              <span style={label}>Level</span>
              <select style={input} value={level} onChange={e => { setLevel(e.target.value); setTopic(''); setCandidates(null); setPicked(null); }}>
                {levels.map(l => <option key={l.key} value={l.key}>{l.label}</option>)}
              </select>
            </div>
            <div>
              <span style={label}>Topic{kind === 'worksheet' ? ' (optional)' : ''}</span>
              <select style={input} value={topic} onChange={e => setTopic(e.target.value)}>
                <option value="">{topics.length ? '— pick a topic —' : 'Loading…'}</option>
                {topics.map(t => <option key={t.topic} value={t.topic}>{t.topic} ({t.questionCount})</option>)}
                {topic && !topics.some(t => t.topic === topic) && <option value={topic}>{topic}</option>}
              </select>
              {/* The paper's other weak topics, one tap each. Sending three
                  follow-ups from one script used to mean three trips back to
                  triage; a script rarely fails on a single thing. A topic dims
                  once you have assigned from it, so you can see what is left. */}
              {queue.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6, alignItems: 'center' }}>
                  <span style={{ fontSize: 11.5, color: '#6b7280' }}>Also weak on this paper:</span>
                  {queue.map(t => (
                    <button key={t} type="button" onClick={() => { setTopic(t); setCandidates(null); setPicked(null); }}
                      style={{ fontSize: 11.5, fontWeight: 600, padding: '2px 8px', borderRadius: 999,
                        border: '1px solid #c7d2fe', cursor: 'pointer',
                        background: sentTopics.includes(t) ? '#f3f4f6' : '#eef2ff',
                        color: sentTopics.includes(t) ? '#9ca3af' : '#3730a3',
                        textDecoration: sentTopics.includes(t) ? 'line-through' : 'none' }}>
                      {t}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {kind === 'question' && (
              <div>
                <span style={label}>Tier</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  {(['', 'Standard', 'Advanced'] as const).map(t => (
                    <button key={t || 'any'} style={pill(tier === t)} onClick={() => setTier(t)}>{t || 'Any'}</button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {kind === 'question' && (
            <div>
              {!topic && <div style={{ color: '#9ca3af', fontSize: 13 }}>Pick a topic to see questions.</div>}
              {topic && loadingCands && <div style={{ color: '#9ca3af', fontSize: 13 }}>Finding questions…</div>}
              {topic && !loadingCands && candidates && candidates.length === 0 && (
                <div style={{ color: '#b45309', fontSize: 13 }}>No gradable questions for this topic{tier ? ` at ${tier}` : ''}.</div>
              )}
              {candidates && candidates.length > 0 && (
                <div style={{ display: 'grid', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={label}>Pick one ({candidates.length} shown)</span>
                    <button style={{ ...btnGhost, padding: '3px 10px', fontSize: 12 }} onClick={loadCandidates}>↻ Shuffle</button>
                  </div>
                  {candidates.map(c => {
                    const on = picked === c.id;
                    return (
                      <div key={c.id} onClick={() => setPicked(on ? null : c.id)}
                        style={{ border: on ? '2px solid #1e3a5f' : '1px solid #e5e7eb', borderRadius: 10, padding: '10px 12px', cursor: 'pointer', background: on ? '#f0f4f8' : '#fff' }}>
                        <div style={{ display: 'flex', gap: 8, fontSize: 12, color: '#6b7280', marginBottom: 4 }}>
                          <span>{on ? '◉' : '○'}</span>
                          {c.marks != null && <span>[{c.marks} marks]</span>}
                          {c.difficulty && <span>{c.difficulty}</span>}
                          <span>{c.source}</span>
                        </div>
                        <div className="send-work-md" style={{ fontSize: 14, lineHeight: 1.5, color: '#111' }}>
                          <ReactMarkdown remarkPlugins={[remarkMath, remarkGfm]} rehypePlugins={[rehypeRaw, rehypeKatex]}>{c.markdown}</ReactMarkdown>
                        </div>
                        {c.figureUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={c.figureUrl} alt="" style={{ maxWidth: 260, maxHeight: 180, marginTop: 6, borderRadius: 6, border: '1px solid #eee' }} />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {kind === 'worksheet' && (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button style={pill(wsSource === 'library')} onClick={() => setWsSource('library')}>From Dropbox library</button>
                <button style={pill(wsSource === 'upload')} onClick={() => setWsSource('upload')}>Upload a PDF</button>
              </div>
              {wsSource === 'library' && (
                <div style={{ display: 'grid', gap: 8 }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button style={pill(libKind === 'practice')} onClick={() => { setLibKind('practice'); setLibPick(null); }}>Practice</button>
                    <button style={pill(libKind === 'prelim')} onClick={() => { setLibKind('prelim'); setLibPick(null); }}>Prelim</button>
                  </div>
                  {library === null && <div style={{ color: '#9ca3af', fontSize: 13 }}>Loading library…</div>}
                  {library && library.length === 0 && <div style={{ color: '#9ca3af', fontSize: 13 }}>Nothing in this folder.</div>}
                  {library && library.length > 0 && (
                    <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: 8 }}>
                      {library.map(e => {
                        const on = libPick?.id === e.id;
                        return (
                          <div key={e.id} onClick={() => { setLibPick(on ? null : e); if (!on && !title) setTitle(e.title); }}
                            style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 10px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', background: on ? '#f0f4f8' : '#fff', fontSize: 14 }}>
                            <span>{on ? '◉' : '○'}</span>
                            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.title}</span>
                            <a href={e.pdfUrl} target="_blank" rel="noopener noreferrer" onClick={ev => ev.stopPropagation()} style={{ fontSize: 12, color: '#2563eb' }}>Preview ↗</a>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
              {wsSource === 'upload' && (
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <input ref={fileRef} type="file" accept="application/pdf,.pdf" style={{ display: 'none' }} onChange={e => onFile(e.target.files?.[0] || null)} />
                  <button style={btnGhost} disabled={uploading} onClick={() => fileRef.current?.click()}>{uploading ? 'Uploading…' : (uploaded ? 'Replace PDF' : 'Choose PDF')}</button>
                  {uploaded && <span style={{ fontSize: 13, color: '#166534' }}>✓ {uploaded.name}</span>}
                </div>
              )}
              <div>
                <span style={label}>Title the student sees</span>
                <input style={input} value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Differentiation worksheet 2" maxLength={120} />
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <span style={label}>Note (optional)</span>
              <input style={input} value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Same idea as Q7 you dropped marks on — show the discriminant step." maxLength={600} />
            </div>
            <div>
              <span style={label}>Due (optional)</span>
              <input style={input} type="date" value={dueOn} onChange={e => setDueOn(e.target.value)} />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
              <button style={{ ...btnPrimary, opacity: canSend && !sending ? 1 : 0.5 }} disabled={!canSend || sending} onClick={send}>
                {sending ? 'Sending…' : `📬 Send to ${studentName.split(' ')[0]}`}
              </button>
            </div>
          </div>
          {msg && <div style={{ fontSize: 13, color: msg.ok ? '#166534' : '#b91c1c' }}>{msg.text}</div>}
        </div>
      )}

      {list.length === 0 && open === false && (
        <div style={{ color: '#9ca3af', fontSize: 14 }}>Nothing assigned yet.</div>
      )}
      {pending.length > 0 && (
        <div>
          <div style={label}>To do ({pending.length})</div>
          {pending.map(a => <Row key={a.id} a={a} onRevoke={revoke} />)}
        </div>
      )}
      {done.length > 0 && (
        <div>
          <div style={label}>Done</div>
          {done.slice(0, 10).map(a => <Row key={a.id} a={a} />)}
        </div>
      )}
    </div>
  );
}

function Row({ a, onRevoke }: { a: AssignmentRow; onRevoke?: (id: string) => void }) {
  const due = dueLabel(a.due_on);
  const d = new Date(a.created_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' });
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '8px 0', borderBottom: '1px solid #f1f5f9', fontSize: 14 }}>
      <span style={{ width: 56, color: '#6b7280', fontSize: 13 }}>{d}</span>
      <span aria-hidden>{a.kind === 'question' ? '✏️' : '📄'}</span>
      <span style={{ flex: 1, minWidth: 140, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {a.title}{a.topic && a.kind === 'worksheet' ? <span style={{ color: '#6b7280' }}> · {a.topic}</span> : null}
      </span>
      {due && <span style={{ fontSize: 12, color: '#6b7280' }}>{due}</span>}
      <span style={{ fontSize: 12, fontWeight: 600, color: a.status === 'marked' ? '#166534' : a.status === 'submitted' ? '#92400e' : '#1e3a5f' }}>
        {statusLabel(a)}
      </span>
      {a.kind === 'worksheet' && a.pdf_url && <a href={fileHref(a.pdf_url)} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: '#2563eb' }}>PDF ↗</a>}
      {onRevoke && <button style={{ ...btnGhost, padding: '2px 8px', fontSize: 12, color: '#b91c1c', borderColor: '#fecaca' }} onClick={() => onRevoke(a.id)}>Take back</button>}
    </div>
  );
}
