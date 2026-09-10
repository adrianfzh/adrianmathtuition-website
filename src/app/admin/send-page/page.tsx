'use client';

// /admin/send-page — 📖 push ONE page to MANY students (11 Sep 2026,
// SPEC-NOTEBOOK-V2 §12, Class Notebook's move). A PDF or a picture, a title,
// an optional line, and an audience: everyone, a level, or picked names. Each
// chosen student gets a read-only "page" row under From Adrian (never "to do"),
// a band in their Notebook, a Telegram line where linked and a web push.
//
// The file goes straight to the private student-files bucket through a signed
// URL (upload-token) — the platform's 4.5MB body cap never applies — then ONE
// POST creates every row. The admin cookie authenticates both calls.
import { useEffect, useMemo, useState } from 'react';
import { uploadStudentFile } from '@/lib/student-files-client';

type Student = { id: string; sid: string; name: string; level: string | null };
type Mode = 'all' | 'levels' | 'pick';

const card: React.CSSProperties = { background: '#fff', border: '1px solid rgba(0,0,0,0.06)', borderRadius: 16, padding: 18, marginBottom: 14 };
const label: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: '#6b7280', marginBottom: 6 };
const input: React.CSSProperties = { width: '100%', border: '1px solid #d1d5db', borderRadius: 12, padding: '10px 12px', fontSize: 15 };
const chip = (on: boolean): React.CSSProperties => ({
  display: 'inline-block', padding: '7px 12px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer', marginRight: 6, marginBottom: 6,
  background: on ? '#1e2a4a' : '#f3f4f6', color: on ? '#fff' : '#1e2a4a', border: '1px solid ' + (on ? '#1e2a4a' : '#e5e7eb'),
});

export default function SendPagePage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [levels, setLevels] = useState<string[]>([]);
  const [loadErr, setLoadErr] = useState('');
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [topic, setTopic] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<Mode>('all');
  const [pickedLevels, setPickedLevels] = useState<string[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState<'' | 'uploading' | 'sending'>('');
  const [result, setResult] = useState<{ sent: number; telegram: number; students: { name: string }[] } | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    fetch('/api/admin/send-page').then(async r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      setStudents(j.students || []);
      setLevels(j.levels || []);
    }).catch(e => setLoadErr(`Could not load the roster: ${(e as Error).message}`));
  }, []);

  const audience = useMemo(() => {
    if (mode === 'all') return students;
    if (mode === 'levels') return students.filter(s => s.level && pickedLevels.includes(s.level));
    return students.filter(s => picked.includes(s.sid));
  }, [mode, students, pickedLevels, picked]);

  const toggle = (list: string[], v: string, set: (l: string[]) => void) =>
    set(list.includes(v) ? list.filter(x => x !== v) : [...list, v]);

  async function send() {
    setErr(''); setResult(null);
    if (!title.trim()) return setErr('Give the page a title.');
    if (!file) return setErr('Choose a PDF or a picture.');
    if (audience.length === 0) return setErr('Nobody is chosen.');
    if (!window.confirm(`Send "${title.trim()}" to ${audience.length} student${audience.length === 1 ? '' : 's'}?`)) return;
    try {
      setBusy('uploading');
      const up = await uploadStudentFile(`/api/admin/send-page/upload-token?filename=${encodeURIComponent(file.name)}`, file);
      setBusy('sending');
      const r = await fetch('/api/admin/send-page', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(), note: note.trim() || null, topic: topic.trim() || null, fileUrl: up.url,
          audience: mode === 'all' ? { all: true } : mode === 'levels' ? { levels: pickedLevels } : { studentIds: picked },
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setResult(j);
      setTitle(''); setNote(''); setTopic(''); setFile(null); setPicked([]);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy('');
    }
  }

  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: '18px 16px 60px', fontFamily: 'system-ui, sans-serif', color: '#1e2a4a' }}>
      <p style={{ marginBottom: 6 }}><a href="/admin" style={{ color: '#6b7280', textDecoration: 'none', fontSize: 14 }}>← Admin</a></p>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 4px' }}>📖 Send a page</h1>
      <p style={{ fontSize: 14, color: '#6b7280', margin: '0 0 16px' }}>
        A formula sheet, notes, a worked example — one file, every chosen student. It lands under From Adrian and in their Notebook, with a nudge. Nothing to hand in.
      </p>

      {loadErr && <p style={{ color: '#b91c1c', fontSize: 14 }}>{loadErr}</p>}

      <section style={card}>
        <label style={label}>The page</label>
        <input style={input} placeholder="Title — e.g. AM trigonometry formula sheet" value={title} onChange={e => setTitle(e.target.value)} maxLength={120} />
        <div style={{ height: 8 }} />
        <input style={input} placeholder="Topic (optional) — e.g. Trigonometry (Identities)" value={topic} onChange={e => setTopic(e.target.value)} maxLength={80} />
        <div style={{ height: 8 }} />
        <textarea style={{ ...input, minHeight: 64 }} placeholder="A line to go with it (optional) — e.g. Keep this beside you for WA3." value={note} onChange={e => setNote(e.target.value)} maxLength={600} />
        <div style={{ height: 8 }} />
        <input type="file" accept="application/pdf,image/*" onChange={e => setFile(e.target.files?.[0] || null)} />
        {file && <p style={{ fontSize: 12, color: '#6b7280', margin: '6px 0 0' }}>{file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB</p>}
      </section>

      <section style={card}>
        <label style={label}>Who gets it</label>
        <div style={{ marginBottom: 8 }}>
          <span style={chip(mode === 'all')} onClick={() => setMode('all')}>Everyone ({students.length})</span>
          <span style={chip(mode === 'levels')} onClick={() => setMode('levels')}>By level</span>
          <span style={chip(mode === 'pick')} onClick={() => setMode('pick')}>Pick names</span>
        </div>
        {mode === 'levels' && (
          <div>{levels.length === 0
            ? <p style={{ fontSize: 13, color: '#6b7280' }}>No levels on the accounts yet.</p>
            : levels.map(l => <span key={l} style={chip(pickedLevels.includes(l))} onClick={() => toggle(pickedLevels, l, setPickedLevels)}>{l}</span>)}
          </div>
        )}
        {mode === 'pick' && (
          <div style={{ maxHeight: 260, overflowY: 'auto' }}>
            {students.map(s => (
              <label key={s.sid} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 2px', fontSize: 14, cursor: 'pointer' }}>
                <input type="checkbox" checked={picked.includes(s.sid)} onChange={() => toggle(picked, s.sid, setPicked)} />
                <span style={{ flex: 1 }}>{s.name}</span>
                <span style={{ fontSize: 12, color: '#9ca3af' }}>{s.level || ''}</span>
              </label>
            ))}
          </div>
        )}
        <p style={{ fontSize: 13, color: '#6b7280', margin: '8px 0 0' }} data-audience-count={audience.length}>
          {audience.length} student{audience.length === 1 ? '' : 's'} will get it.
        </p>
      </section>

      {err && <p style={{ color: '#b91c1c', fontSize: 14, margin: '0 0 10px' }}>{err}</p>}
      <button
        type="button" onClick={send} disabled={!!busy}
        style={{ width: '100%', background: '#1e2a4a', color: '#fff', border: 'none', borderRadius: 14, padding: '14px 16px', fontSize: 16, fontWeight: 700, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}
      >
        {busy === 'uploading' ? 'Uploading the file…' : busy === 'sending' ? 'Sending…' : `Send to ${audience.length} student${audience.length === 1 ? '' : 's'}`}
      </button>

      {result && (
        <section style={{ ...card, marginTop: 14, background: '#ecfdf5', borderColor: '#a7f3d0' }} data-send-result>
          <p style={{ margin: 0, fontWeight: 700, color: '#065f46' }}>Sent to {result.sent} student{result.sent === 1 ? '' : 's'}{result.telegram ? ` · ${result.telegram} on Telegram` : ''}</p>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: '#065f46' }}>{result.students.map(s => s.name).join(', ')}</p>
        </section>
      )}
    </main>
  );
}
