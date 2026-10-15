'use client';
// 📝 School exam papers — inside the Exams box on Overview (SPEC-EXAM-TRACKER.md; Adrian,
// 15 Oct 2026: "why don't we put the exams information in overview … then don't build the
// fifth tab"). Upload the school-marked paper → the school's marks are read → Adrian checks
// the table → the report (marks lost by topic, since last exam, next lessons, parent note).
// Only the latest paper is open; older ones show their score until tapped.

import { useCallback, useEffect, useRef, useState } from 'react';
import { uploadStudentFile } from '@/lib/student-files-client';
import { fileHref } from '@/lib/student-files-url';
import { EXAM_TYPES } from '@/lib/exam-grade';
import { examLabel, lossByTopic, totalMismatch, totals, SCHOOL_EXAM_MAX_PAGES, type ExamPart } from '@/lib/school-exam';
import type { ScanRow } from '@/lib/school-exam-store';

type ExamLite = { id: string; examType: string; examDate: string; subject: string };

const MATH_SUBJECTS = ['E Math', 'A Math', 'H2 Math', 'Math'];

export default function SchoolExams({ studentId, level, firstName, subjects, exams }: {
  studentId: string; level: string; firstName: string; subjects: string[]; exams: ExamLite[];
}) {
  const [scans, setScans] = useState<ScanRow[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch(`/api/admin/school-exams?studentId=${studentId}`);
    if (r.ok) setScans(((await r.json()).scans || []) as ScanRow[]);
  }, [studentId]);
  useEffect(() => { load(); }, [load]);

  // Poll while a paper is being read.
  const reading = (scans || []).some(s => s.status === 'reading');
  useEffect(() => {
    if (!reading) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [reading, load]);

  const put = (row: ScanRow) => setScans(prev => (prev || []).map(s => (s.id === row.id ? row : s)));
  const latestId = scans?.[0]?.id ?? null;

  return (
    <div style={{ marginTop: 14, borderTop: '1px solid #e5e7eb', paddingTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#111' }}>📝 School exam papers</div>
        {!adding && <button style={btn} onClick={() => setAdding(true)}>📷 Upload a marked paper</button>}
      </div>
      {adding && (
        <UploadForm studentId={studentId} level={level} subjects={subjects} exams={exams}
          onCancel={() => setAdding(false)}
          onDone={row => { setAdding(false); setScans(prev => [row, ...(prev || [])]); setOpen(row.id); }} />
      )}
      {scans === null && <div style={muted}>Loading…</div>}
      {scans && scans.length === 0 && !adding && (
        <div style={muted}>After each school exam, photograph the marked paper and upload it here. You get the marks lost by topic, what changed since the last exam, and a note for the parent.</div>
      )}
      {(scans || []).map(s => {
        const isOpen = open ? open === s.id : s.id === latestId;
        return (
          <div key={s.id} style={{ border: '1px solid #e5e7eb', borderRadius: 10, marginBottom: 8, background: '#fff' }}>
            <button onClick={() => setOpen(isOpen ? '__none__' : s.id)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#111', flex: 1 }}>{examLabel(s.exam_type, s.exam_date, s.subject)}</span>
              <StatusChip s={s} />
              <span style={{ color: '#94a3b8', fontSize: 12 }}>{isOpen ? '▾' : '▸'}</span>
            </button>
            {isOpen && (
              <div style={{ padding: '0 12px 12px' }}>
                <ScanBody scan={s} level={level} firstName={firstName} onChange={put}
                  onDelete={() => setScans(prev => (prev || []).filter(x => x.id !== s.id))} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function StatusChip({ s }: { s: ScanRow }) {
  if (s.status === 'reading') return <span style={chip('#92400e', '#fef3c7')}>reading…</span>;
  if (s.status === 'failed') return <span style={chip('#991b1b', '#fee2e2')}>could not read</span>;
  if (s.status === 'check') return <span style={chip('#1e40af', '#dbeafe')}>check the marks</span>;
  const pct = s.total_max ? Math.round((Number(s.total_got) / Number(s.total_max)) * 1000) / 10 : null;
  const ch = s.report?.comparison?.change;
  return (
    <span style={{ fontSize: 12.5, fontWeight: 700, color: '#111' }}>
      {s.total_got}/{s.total_max}{pct != null ? ` · ${pct}%` : ''}
      {ch != null && <span style={{ color: ch >= 0 ? '#15803d' : '#dc2626', marginLeft: 6 }}>{ch >= 0 ? '+' : ''}{ch}</span>}
    </span>
  );
}

// ── upload ───────────────────────────────────────────────────────────────────

function UploadForm({ studentId, level, subjects, exams, onCancel, onDone }: {
  studentId: string; level: string; subjects: string[]; exams: ExamLite[];
  onCancel: () => void; onDone: (row: ScanRow) => void;
}) {
  const mathSubjects = subjects.filter(x => MATH_SUBJECTS.includes(x));
  const subjOpts = mathSubjects.length ? mathSubjects : (level.toLowerCase().startsWith('jc') ? ['H2 Math'] : ['Math']);
  const [examType, setExamType] = useState(EXAM_TYPES[0]);
  const [subject, setSubject] = useState(subjOpts[0]);
  const ex = exams.find(e => e.examType === examType);
  const [date, setDate] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { setDate(ex?.examDate || ''); }, [ex?.examDate]);

  const go = async () => {
    if (!files.length) { setErr('Add the pages first.'); return; }
    if (files.length > SCHOOL_EXAM_MAX_PAGES) { setErr(`At most ${SCHOOL_EXAM_MAX_PAGES} pages.`); return; }
    setErr(null);
    try {
      const urls: string[] = [];
      for (let i = 0; i < files.length; i++) {
        setBusy(`Uploading page ${i + 1} of ${files.length}…`);
        const f = files[i];
        const up = await uploadStudentFile(`/api/admin/school-exams/upload-token?studentId=${studentId}&filename=${encodeURIComponent(f.name)}`, f, { contentType: f.type || undefined });
        urls.push(up.url);
      }
      setBusy('Starting the read…');
      const r = await fetch('/api/admin/school-exams', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId, level, examType, subject, examDate: date, airtableExamId: ex?.id || null, files: urls }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `upload failed (${r.status})`);
      onDone(j.scan as ScanRow);
    } catch (e) {
      setErr((e as Error).message);
    } finally { setBusy(null); }
  };

  return (
    <div style={{ border: '1px solid #bfdbfe', background: '#f8fbff', borderRadius: 10, padding: 12, marginBottom: 10 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <select value={examType} onChange={e => setExamType(e.target.value)} style={field}>
          {EXAM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          <option value="MYE">MYE</option><option value="Prelim">Prelim</option><option value="Other">Other</option>
        </select>
        <select value={subject} onChange={e => setSubject(e.target.value)} style={field}>
          {subjOpts.map(x => <option key={x} value={x}>{x}</option>)}
        </select>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} style={field} />
      </div>
      <input ref={inputRef} type="file" multiple accept="image/*,application/pdf" style={{ display: 'none' }}
        onChange={e => setFiles(prev => [...prev, ...Array.from(e.target.files || [])])} />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button style={btn} onClick={() => inputRef.current?.click()}>＋ Add pages (photos or PDF)</button>
        <span style={muted}>{files.length ? `${files.length} file${files.length === 1 ? '' : 's'}` : 'every page, in order'}</span>
        {files.length > 0 && <button style={linkBtn} onClick={() => setFiles([])}>clear</button>}
      </div>
      {err && <div style={{ color: '#dc2626', fontSize: 12.5, marginTop: 6 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button style={primary} disabled={!!busy} onClick={go}>{busy || 'Read the marks'}</button>
        <button style={btn} disabled={!!busy} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

// ── one scan ─────────────────────────────────────────────────────────────────

function ScanBody({ scan, level, firstName, onChange, onDelete }: {
  scan: ScanRow; level: string; firstName: string; onChange: (r: ScanRow) => void; onDelete: () => void;
}) {
  const [editing, setEditing] = useState(scan.status === 'check');
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (scan.status === 'check') setEditing(true); }, [scan.status]);

  const call = async (label: string, init: RequestInit) => {
    setBusy(label); setErr(null);
    try {
      const r = await fetch(`/api/admin/school-exams/${scan.id}`, { headers: { 'Content-Type': 'application/json' }, ...init });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `failed (${r.status})`);
      if (j.scan) onChange(j.scan as ScanRow);
      if (j.reportFailed) setErr('The marks are saved, but the next lessons and parent note could not be written. Tap "Looks right" again.');
      return j;
    } catch (e) { setErr((e as Error).message); return null; } finally { setBusy(null); }
  };
  const remove = async () => {
    if (!confirm('Delete this exam paper and its pages?')) return;
    const j = await call('Deleting…', { method: 'DELETE' });
    if (j) onDelete();
  };
  const reread = () => call('Starting…', { method: 'POST', body: JSON.stringify({ action: 'reread', level }) });

  const pages = (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
      {scan.files.map((u, i) => (
        <a key={u} href={fileHref(u)} target="_blank" rel="noreferrer" style={{ fontSize: 11.5, color: '#1d4ed8' }}>page {i + 1}</a>
      ))}
      <span style={{ flex: 1 }} />
      <button style={linkBtn} onClick={reread} disabled={!!busy}>read again</button>
      <button style={{ ...linkBtn, color: '#dc2626' }} onClick={remove} disabled={!!busy}>delete</button>
    </div>
  );

  if (scan.status === 'reading') return <div style={muted}>Reading the school&apos;s marks… this takes a minute or two. You can leave this page.{pages}</div>;
  if (scan.status === 'failed') return (
    <div>
      <div style={{ color: '#991b1b', fontSize: 13 }}>Could not read this paper: {scan.error || 'unknown error'}</div>
      {err && <div style={{ color: '#dc2626', fontSize: 12.5 }}>{err}</div>}
      {pages}
    </div>
  );

  return (
    <div>
      {scan.status === 'done' && !editing && <Report scan={scan} />}
      {(editing || scan.status === 'check') ? (
        <CheckTable scan={scan} busy={busy}
          onSave={parts => call('Saving…', { method: 'PATCH', body: JSON.stringify({ parts }) })}
          onConfirm={async parts => {
            const saved = await call('Saving…', { method: 'PATCH', body: JSON.stringify({ parts }) });
            if (!saved) return;
            const done = await call('Writing the report…', { method: 'POST', body: JSON.stringify({ action: 'confirm', firstName }) });
            if (done) setEditing(false);
          }} />
      ) : (
        <button style={{ ...linkBtn, marginTop: 8 }} onClick={() => setEditing(true)}>✏️ Edit the marks</button>
      )}
      {err && <div style={{ color: '#dc2626', fontSize: 12.5, marginTop: 6 }}>{err}</div>}
      {pages}
    </div>
  );
}

function CheckTable({ scan, busy, onSave, onConfirm }: {
  scan: ScanRow; busy: string | null;
  onSave: (parts: ExamPart[]) => void; onConfirm: (parts: ExamPart[]) => void;
}) {
  const [parts, setParts] = useState<ExamPart[]>(scan.read?.parts || []);
  useEffect(() => { setParts(scan.read?.parts || []); }, [scan.read]);
  const set = (i: number, patch: Partial<ExamPart>) => setParts(prev => prev.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const t = totals(parts);
  const mismatch = scan.read ? totalMismatch({ parts, written_total: scan.read.written_total }) : null;
  const unsure = parts.filter(p => p.unsure).length;
  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ fontSize: 12.5, color: '#475569', marginBottom: 6 }}>
        Check the marks against the paper and fix anything read wrongly. Total <b>{t.got}/{t.max}</b>.
        {unsure > 0 && <span style={{ color: '#92400e' }}> {unsure} mark{unsure === 1 ? '' : 's'} hard to read (yellow).</span>}
      </div>
      {mismatch && <div style={{ background: '#fee2e2', color: '#991b1b', borderRadius: 8, padding: '6px 10px', fontSize: 12.5, marginBottom: 6 }}>Check this first: {mismatch}.</div>}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12.5 }}>
          <thead><tr style={{ color: '#64748b', textAlign: 'left' }}>
            <th style={th}>Q</th><th style={th}>Marks</th><th style={th}>Topic</th><th style={th}>What went wrong</th>
          </tr></thead>
          <tbody>
            {parts.map((p, i) => (
              <tr key={`${p.q}-${p.part}-${i}`} style={{ borderTop: '1px solid #f1f5f9', background: p.unsure ? '#fffbeb' : 'transparent' }}>
                <td style={td}>{p.q}{p.part ? `(${p.part})` : ''}</td>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>
                  <input type="number" step="0.5" value={p.got} onChange={e => set(i, { got: Number(e.target.value), unsure: false })} style={{ ...cell, width: 46 }} />
                  <span style={{ color: '#94a3b8' }}> / </span>
                  <input type="number" step="0.5" value={p.max} onChange={e => set(i, { max: Number(e.target.value) })} style={{ ...cell, width: 46 }} />
                </td>
                <td style={td}><input value={p.topic} onChange={e => set(i, { topic: e.target.value })} style={{ ...cell, width: 150 }} /></td>
                <td style={td}>{p.got < p.max
                  ? <input value={p.why} onChange={e => set(i, { why: e.target.value })} style={{ ...cell, width: '100%', minWidth: 160 }} />
                  : <span style={{ color: '#15803d' }}>✓</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button style={primary} disabled={!!busy} onClick={() => onConfirm(parts)}>{busy || 'Looks right'}</button>
        <button style={btn} disabled={!!busy} onClick={() => onSave(parts)}>Save for later</button>
      </div>
    </div>
  );
}

function Report({ scan }: { scan: ScanRow }) {
  const parts = scan.read?.parts || [];
  const losses = (scan.report?.loss_by_topic || lossByTopic(parts)).filter(t => t.lost > 0);
  const top = Math.max(1, ...losses.map(t => t.lost));
  const c = scan.report?.comparison;
  const [copied, setCopied] = useState(false);
  const pct = scan.total_max ? Math.round((Number(scan.total_got) / Number(scan.total_max)) * 1000) / 10 : null;
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8, marginBottom: 12 }}>
        <Tile label="Score" value={`${scan.total_got} / ${scan.total_max}`} />
        <Tile label="Percent" value={pct != null ? `${pct}%` : '—'} />
        <Tile label={scan.report?.prev_label ? `Since ${scan.report.prev_label.split(' · ')[0]}` : 'Since last exam'}
          value={c?.change != null ? `${c.change >= 0 ? '+' : ''}${c.change}%` : 'first one'}
          color={c?.change != null ? (c.change >= 0 ? '#15803d' : '#dc2626') : '#64748b'} />
      </div>

      <div style={h}>Marks lost by topic</div>
      {losses.length === 0 && <div style={muted}>Full marks.</div>}
      {losses.map(t => (
        <div key={t.topic} style={{ display: 'grid', gridTemplateColumns: '140px 1fr 48px', gap: 8, alignItems: 'center', fontSize: 12.5, marginBottom: 5 }}>
          <span>{t.topic}</span>
          <div style={{ height: 10, borderRadius: 3, background: '#ef4444', width: `${Math.max(4, (t.lost / top) * 100)}%` }} />
          <span style={{ color: '#64748b', textAlign: 'right' }}>{t.lost}/{t.max}</span>
        </div>
      ))}

      {c && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, margin: '12px 0' }}>
          <Box title="Better" tone={['#166534', '#dcfce7']} items={c.better.map(b => `${b.topic} (lost ${b.before} → ${b.now})`)} />
          <Box title="Still weak" tone={['#991b1b', '#fee2e2']} items={c.stillWeak.map(b => `${b.topic} (lost ${b.before} → ${b.now})`)} />
          <Box title="New" tone={['#92400e', '#fef3c7']} items={c.newWeak.map(b => `${b.topic} (lost ${b.now})`)} />
        </div>
      )}

      {!!scan.report?.next_steps?.length && (
        <>
          <div style={{ ...h, marginTop: 12 }}>Next lessons</div>
          {scan.report.next_steps.map((s, i) => (
            <div key={i} style={{ fontSize: 13, padding: '6px 0', borderTop: '1px solid #f1f5f9' }}><b>{s.topic}:</b> {s.action}</div>
          ))}
        </>
      )}

      {scan.report?.parent_note && (
        <>
          <div style={{ ...h, marginTop: 12 }}>Note for the parent <span style={{ fontWeight: 400, color: '#64748b' }}>(you send it)</span></div>
          <div style={{ background: '#f8fafc', borderRadius: 8, padding: 10, fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{scan.report.parent_note}</div>
          <button style={{ ...btn, marginTop: 6 }} onClick={async () => {
            try { await navigator.clipboard.writeText(scan.report?.parent_note || ''); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
          }}>{copied ? '✓ Copied' : '📋 Copy'}</button>
        </>
      )}
    </div>
  );
}

function Tile({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ background: '#f8fafc', borderRadius: 8, padding: '8px 10px' }}>
      <div style={{ fontSize: 11.5, color: '#64748b' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: color || '#111' }}>{value}</div>
    </div>
  );
}
function Box({ title, tone, items }: { title: string; tone: [string, string]; items: string[] }) {
  return (
    <div style={{ background: tone[1], color: tone[0], borderRadius: 8, padding: '8px 10px', fontSize: 12.5 }}>
      <div style={{ fontWeight: 700, marginBottom: 2 }}>{title}</div>
      {items.length ? items.map(x => <div key={x}>{x}</div>) : <div style={{ opacity: 0.7 }}>none</div>}
    </div>
  );
}

const muted: React.CSSProperties = { fontSize: 12.5, color: '#64748b' };
const h: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: '#111', marginBottom: 6 };
const btn: React.CSSProperties = { fontSize: 12.5, fontWeight: 600, color: '#1e3a5f', background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8, padding: '6px 10px', cursor: 'pointer' };
const primary: React.CSSProperties = { ...btn, color: '#fff', background: '#1d4ed8', border: '1px solid #1d4ed8' };
const linkBtn: React.CSSProperties = { fontSize: 12, color: '#1d4ed8', background: 'none', border: 'none', cursor: 'pointer', padding: 0 };
const field: React.CSSProperties = { border: '1px solid #e5e7eb', borderRadius: 7, padding: '6px 9px', fontSize: 13, background: '#fff' };
const cell: React.CSSProperties = { border: '1px solid #e5e7eb', borderRadius: 6, padding: '4px 6px', fontSize: 12.5, boxSizing: 'border-box' };
const th: React.CSSProperties = { padding: '4px 6px', fontWeight: 600, fontSize: 11.5 };
const td: React.CSSProperties = { padding: '4px 6px', verticalAlign: 'middle' };
function chip(fg: string, bg: string): React.CSSProperties {
  return { fontSize: 11.5, fontWeight: 700, color: fg, background: bg, padding: '2px 8px', borderRadius: 999 };
}
