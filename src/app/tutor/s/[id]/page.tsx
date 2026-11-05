'use client';

// 🧑‍🏫 One of the tutor's students: hand in a paper (photos or a PDF), and the marked papers.
// The upload path is /app/submit's: PDFs become page images, two-page photos are split,
// pages are resized, then each goes straight into the private store (lib/student-files).
import { use, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { uploadStudentFile } from '@/lib/student-files-client';
import { pdfToPageImages } from '@/lib/pdf-pages';
import { splitFileIfSpread, resizeToJpeg } from '@/lib/spread-split';
import { heicFilesToJpeg } from '@/lib/heic-browser';

const SUBJECTS = ['A Math', 'E Math', 'H2 Math'] as const;
const MAX_PAGES = 30;

interface Paper {
  id: string; name: string; subject: string | null; pages: number; handedIn: string;
  state: 'waiting' | 'marking' | 'marked' | 'failed'; stateWords: string;
  awarded: number | null; max: number | null; weak: { topic: string; lost: number }[];
}
interface Student { id: string; name: string; level: string | null }

export default function TutorStudent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [student, setStudent] = useState<Student | null>(null);
  const [left, setLeft] = useState<number | null>(null);
  const [papers, setPapers] = useState<Paper[] | null>(null);
  const [signedOut, setSignedOut] = useState(false);

  const load = useCallback(async () => {
    const [s, p] = await Promise.all([
      fetch('/api/tutor/students', { cache: 'no-store' }),
      fetch(`/api/tutor/papers?student=${id}`, { cache: 'no-store' }),
    ]);
    if (s.status === 401) { setSignedOut(true); return; }
    const sj = await s.json();
    setStudent((sj.students as Student[]).find(x => x.id === id) ?? null);
    setLeft(sj.usage?.left ?? null);
    setPapers((await p.json()).papers ?? []);
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  if (signedOut) return <main className="p-6"><Link className="underline" href="/tutor">Sign in</Link></main>;
  if (!papers) return <main className="p-6 text-slate-500">Loading…</main>;
  if (!student) return <main className="p-6"><p>Student not found.</p><Link className="underline" href="/tutor">Back</Link></main>;
  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      <Link href="/tutor" className="text-sm text-slate-500">‹ All students</Link>
      <h1 className="mb-4 mt-1 text-2xl font-bold">{student.name}{student.level && <span className="ml-2 text-base font-normal text-slate-500">{student.level}</span>}</h1>
      <HandIn studentId={id} left={left} onSent={load} />
      <Boards studentId={id} />
      <h2 className="mb-2 mt-8 text-lg font-semibold">Papers</h2>
      {papers.length === 0 && <p className="text-sm text-slate-500">None yet.</p>}
      <ul className="space-y-3">
        {papers.map(p => <PaperCard key={p.id} p={p} studentId={id} />)}
      </ul>
    </main>
  );
}

/** Make a board (blank, or on a marked paper's pages) and open it. */
async function newBoard(studentId: string, paperId?: string, templateId?: string): Promise<string | null> {
  const r = await fetch('/api/tutor/boards', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ studentId, paperId, templateId }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return j.error || 'Could not make the board — try again.';
  window.location.href = `/tutor/board/${j.id}`;
  return null;
}

/** 🧑‍🏫 The shared boards with this student (SPEC-TUTOR-TOOLS §8). */
function Boards({ studentId }: { studentId: string }) {
  const [boards, setBoards] = useState<{ id: string; title: string; updated_at: string; link_on: boolean }[] | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [templates, setTemplates] = useState<{ id: string; title: string; pages: number }[]>([]);
  useEffect(() => {
    void fetch(`/api/tutor/boards?student=${studentId}`, { cache: 'no-store' }).then(r => r.json()).then(j => setBoards(j.boards ?? [])).catch(() => setBoards([]));
    void fetch('/api/tutor/templates', { cache: 'no-store' }).then(r => r.json()).then(j => setTemplates(j.templates ?? [])).catch(() => setTemplates([]));
  }, [studentId]);
  const dropTemplate = async (t: { id: string; title: string }) => {
    if (!window.confirm(`Remove the template “${t.title}”? Boards already made from it stay.`)) return;
    await fetch(`/api/tutor/templates?id=${t.id}`, { method: 'DELETE' });
    setTemplates(list => list.filter(x => x.id !== t.id));
  };
  return (
    <section className="mt-6 rounded-xl border bg-white p-4">
      <h2 className="text-lg font-semibold">Boards</h2>
      <p className="mt-1 text-sm text-slate-500">A page you and your student both write on, live, each on your own phone or iPad.</p>
      <button type="button" disabled={busy} onClick={async () => { setBusy(true); setErr((await newBoard(studentId)) ?? ''); setBusy(false); }}
        className="mt-3 w-full rounded-lg bg-slate-900 py-2 font-semibold text-white disabled:opacity-50">{busy ? 'Opening…' : 'New board'}</button>
      {err && <p className="mt-1 text-sm text-red-600">{err}</p>}
      {templates.length > 0 && (
        <div className="mt-3">
          <p className="text-sm font-semibold">Start from one of your templates</p>
          <ul className="mt-1 divide-y rounded-lg border">
            {templates.map(t => (
              <li key={t.id} className="flex items-center gap-2 px-3 py-2">
                <button type="button" disabled={busy} className="min-w-0 flex-1 truncate text-left font-medium text-emerald-800 disabled:opacity-50"
                  onClick={async () => { setBusy(true); setErr((await newBoard(studentId, undefined, t.id)) ?? ''); setBusy(false); }}>
                  {t.title} <span className="text-xs font-normal text-slate-500">· {t.pages} page{t.pages === 1 ? '' : 's'}</span>
                </button>
                <button type="button" aria-label={`Remove the template ${t.title}`} className="shrink-0 text-xs text-slate-400 underline" onClick={() => void dropTemplate(t)}>Remove</button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {boards && boards.length > 0 && <BoardSearch studentId={studentId} />}
      {boards && boards.length > 0 && (
        <ul className="mt-3 divide-y">
          {boards.map(b => (
            <li key={b.id}>
              <a href={`/tutor/board/${b.id}`} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0 truncate font-medium">{b.title}</span>
                <span className="shrink-0 text-xs text-slate-500">{new Date(b.updated_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', timeZone: 'Asia/Singapore' })} ›</span>
              </a>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs text-slate-500">To go through a marked paper together, tap “Open board” on the paper below. To make a template, open a board and tap “Save as template”.</p>
    </section>
  );
}

/** 🔎 Search your handwriting (5 Nov 2026): every page of this student's boards is read into text; find the page. */
function BoardSearch({ studentId }: { studentId: string }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<{ boardId: string; title: string; page: number | null; snippet: string }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [behind, setBehind] = useState(0);
  const run = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!q.trim()) { setHits(null); return; }
    setBusy(true);
    try {
      const r = await fetch(`/api/tutor/boards/search?student=${studentId}&q=${encodeURIComponent(q.trim())}`, { cache: 'no-store' });
      const j = await r.json().catch(() => ({}));
      setHits(j.hits ?? []); setBehind(j.stillReading ?? 0);
    } finally { setBusy(false); }
  };
  return (
    <form onSubmit={run} className="mt-3" role="search">
      <div className="flex gap-2">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Find in boards — e.g. quadratic formula" aria-label="Find in boards"
          className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm" enterKeyHint="search" />
        <button type="submit" disabled={busy} className="rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50">{busy ? 'Looking…' : 'Find'}</button>
      </div>
      {busy && <p className="mt-1 text-xs text-slate-500">Reading any new writing first — a few seconds.</p>}
      {hits && !busy && (hits.length === 0
        ? <p className="mt-2 text-sm text-slate-500">Nothing found for “{q.trim()}”.{behind > 0 ? ' Some new writing is still being read — try again in a minute.' : ''}</p>
        : (
          <ul className="mt-2 divide-y rounded-lg border" data-search-hits>
            {hits.map((h, i) => (
              <li key={`${h.boardId}:${h.page}:${i}`}>
                <a href={`/tutor/board/${h.boardId}${h.page != null ? `#page-${h.page}` : ''}`} className="block px-3 py-2">
                  <span className="font-medium">{h.title}</span>{h.page != null && <span className="text-xs text-slate-500"> · page {h.page + 1}</span>}
                  {h.snippet && <span className="mt-0.5 block text-xs text-slate-600">{h.snippet}</span>}
                </a>
              </li>
            ))}
          </ul>
        ))}
    </form>
  );
}

function PaperCard({ p, studentId }: { p: Paper; studentId: string }) {
  const [cover, setCover] = useState(false);
  const [boardErr, setBoardErr] = useState('');
  const [opening, setOpening] = useState(false);
  const date = new Date(p.handedIn).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', timeZone: 'Asia/Singapore' });
  return (
    <li className="rounded-xl border bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium">{p.name}</p>
          <p className="text-sm text-slate-500">{p.subject} · {p.pages} page{p.pages === 1 ? '' : 's'} · {date}</p>
        </div>
        {p.state === 'marked'
          ? <p className="text-xl font-bold">{p.awarded}/{p.max}</p>
          : <p className={`text-sm ${p.state === 'failed' ? 'text-red-600' : 'text-slate-500'}`}>{p.stateWords}</p>}
      </div>
      {p.state === 'marked' && (
        <>
          {p.weak.length > 0 && (
            <div className="mt-3">
              <p className="text-sm font-semibold">Weak topics</p>
              <ul className="mt-1 text-sm">
                {p.weak.map(w => <li key={w.topic}>{w.topic} <span className="text-slate-500">— {w.lost} mark{w.lost === 1 ? '' : 's'} lost</span></li>)}
              </ul>
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <a className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white" href={`/api/tutor/paper-pdf?paper=${p.id}`} target="_blank" rel="noreferrer">Marked paper</a>
            <a className="rounded-lg border px-3 py-1.5 text-sm" href={`/api/tutor/paper-pdf?paper=${p.id}&kind=full`} target="_blank" rel="noreferrer">Full report</a>
            <button className="rounded-lg border px-3 py-1.5 text-sm" onClick={() => setCover(c => !c)}>{cover ? 'Hide summary' : 'Where the marks went'}</button>
            <button className="rounded-lg border border-emerald-700 px-3 py-1.5 text-sm font-semibold text-emerald-800 disabled:opacity-50" disabled={opening}
              onClick={async () => { setOpening(true); setBoardErr((await newBoard(studentId, p.id)) ?? ''); setOpening(false); }}>{opening ? 'Opening…' : 'Open board'}</button>
          </div>
          {boardErr && <p className="mt-1 text-sm text-red-600">{boardErr}</p>}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {cover && <img className="mt-3 w-full rounded-lg border" src={`/api/tutor/paper-cover?paper=${p.id}`} alt="Where the marks went" />}
        </>
      )}
    </li>
  );
}

function HandIn({ studentId, left, onSent }: { studentId: string; left: number | null; onSent: () => void }) {
  const [files, setFiles] = useState<File[]>([]);
  const [paperName, setPaperName] = useState('');
  const [subject, setSubject] = useState<string>('');
  const [stage, setStage] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [check, setCheck] = useState<{ named: boolean; available: boolean; label: string | null } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // "Do we have this paper?" — the same quiet check the student hand-in page makes.
  useEffect(() => {
    const name = paperName.trim();
    if (name.length < 6) { setCheck(null); return; }
    const t = setTimeout(async () => {
      const r = await fetch('/api/tutor/paper-check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paperName: name }) }).catch(() => null);
      setCheck(r?.ok ? await r.json() : null);
    }, 600);
    return () => clearTimeout(t);
  }, [paperName]);

  async function pick(list: FileList | null) {
    if (!list?.length) return;
    setError(''); setDone('');
    const raw: File[] = [];
    for (const f of Array.from(list)) {
      if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) {
        try {
          setStage(`Reading ${f.name}…`);
          raw.push(...await pdfToPageImages(f, (d, t) => setStage(`Reading ${f.name} — page ${d} of ${t}…`)));
          const nice = f.name.replace(/\.pdf$/i, '').replace(/[-_]+/g, ' ').trim();
          if (nice) setPaperName(prev => prev || nice);
        } catch { setError(`Couldn’t read ${f.name} — photograph the pages instead.`); }
        continue;
      }
      if (f.type.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif)$/i.test(f.name)) raw.push(f);
    }
    const pages: File[] = [];
    for (const f of await heicFilesToJpeg(raw, setStage)) pages.push(...(await splitFileIfSpread(f)).files);
    setStage('');
    setFiles(prev => [...prev, ...pages].slice(0, MAX_PAGES));
    if (inputRef.current) inputRef.current.value = '';
  }

  async function send() {
    if (!files.length) { setError('Add the pages first.'); return; }
    if (!paperName.trim()) { setError('Name the paper (school, year, exam, paper number).'); return; }
    if (!subject) { setError('Pick the subject.'); return; }
    setError('');
    try {
      const urls: string[] = [];
      for (let i = 0; i < files.length; i++) {
        setStage(`Uploading page ${i + 1} of ${files.length}…`);
        const up = await resizeToJpeg(files[i]);
        const res = await uploadStudentFile(`/api/tutor/upload-token?student=${studentId}&filename=${encodeURIComponent(up.name || 'page.jpg')}`, up, { contentType: up.type || 'image/jpeg' });
        urls.push(res.url);
      }
      setStage('Sending…');
      const r = await fetch('/api/tutor/submit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId, paperName: paperName.trim(), subject, photoUrls: urls }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Could not send.');
      setFiles([]); setPaperName(''); setSubject('');
      setDone('Sent. It will appear below, marked, usually within a day.');
      onSent();
    } catch (e) {
      setError((e as Error).message || 'Could not send.');
    } finally { setStage(''); }
  }

  const full = left !== null && left <= 0;
  return (
    <section className="rounded-xl border bg-white p-4">
      <h2 className="mb-3 text-lg font-semibold">Hand in a paper</h2>
      {full ? <p className="text-sm text-amber-700">This month’s papers are used. More open on the 1st.</p> : (
        <div className="space-y-3">
          <div>
            <p className="mb-1 text-sm font-semibold">1. The student’s pages</p>
            <button type="button" onClick={() => inputRef.current?.click()} className="w-full rounded-lg border-2 border-dashed px-3 py-4 text-sm text-slate-600">
              {files.length ? `${files.length} page${files.length === 1 ? '' : 's'} · add more` : 'Take photos or choose a PDF'}
            </button>
            <input ref={inputRef} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={e => void pick(e.target.files)} />
            {files.length > 0 && <button type="button" className="mt-1 text-xs text-slate-500 underline" onClick={() => setFiles([])}>Clear pages</button>}
            <p className="mt-1 text-xs text-slate-500">Include the question paper pages if the working is on separate paper.</p>
          </div>
          <div>
            <p className="mb-1 text-sm font-semibold">2. Which paper</p>
            <input className="w-full rounded-lg border px-3 py-2" placeholder="e.g. Raffles Prelim 2024 A Math P1" value={paperName} onChange={e => setPaperName(e.target.value)} />
            {check?.named && (check.available
              ? <p className="mt-1 text-xs text-green-700">✓ We have this paper{check.label ? `: ${check.label}` : ''}.</p>
              : <p className="mt-1 text-xs text-amber-700">We don’t have this paper’s questions — add photos of the question paper too.</p>)}
            <div className="mt-2 flex gap-2">
              {SUBJECTS.map(s => (
                <button key={s} type="button" onClick={() => setSubject(s)} className={`rounded-full border px-3 py-1 text-sm ${subject === s ? 'border-slate-900 bg-slate-900 text-white' : ''}`}>{s}</button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1 text-sm font-semibold">3. Send</p>
            <button type="button" disabled={!!stage} onClick={() => void send()} className="w-full rounded-lg bg-slate-900 py-2 font-semibold text-white disabled:opacity-50">{stage || 'Send for marking'}</button>
            {left !== null && <p className="mt-1 text-xs text-slate-500">{left} paper{left === 1 ? '' : 's'} left this month.</p>}
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {done && <p className="text-sm text-green-700">{done}</p>}
        </div>
      )}
    </section>
  );
}
