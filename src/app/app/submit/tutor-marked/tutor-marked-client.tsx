'use client';
// 📝 File a paper the tutor marked on paper (5 Oct 2026, lib/tutor-marked). Same upload
// path as a hand-in (uploadPage → the student's own prefix; a PDF becomes page images
// first), then POST /api/portal/tutor-marked. When the total can't be read clearly the
// route files nothing and asks for the score; the pages stay uploaded, so sending again
// with the score costs nothing.
import { useRef, useState } from 'react';
import Link from 'next/link';
import { uploadPage } from '../submit-client';
import { pdfToPageImages } from '@/lib/pdf-pages';
import { TUTOR_MARKED_MAX_PAGES } from '@/lib/tutor-marked';

const CARD = 'bg-white rounded-3xl border border-black/5 shadow-sm';

export default function TutorMarkedClient({ subjects }: { subjects: string[] }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [name, setName] = useState('');
  const [subject, setSubject] = useState(subjects.length === 1 ? subjects[0] : '');
  const [converting, setConverting] = useState('');
  const [stage, setStage] = useState('');
  const [error, setError] = useState('');
  const [askScore, setAskScore] = useState(false);
  const [awarded, setAwarded] = useState('');
  const [max, setMax] = useState('');
  const [done, setDone] = useState<{ runId: string; awarded: number; max: number } | null>(null);
  const uploaded = useRef<Map<number, string>>(new Map());

  async function onPick(list: File[]) {
    if (!list.length) return;
    setError('');
    const add: File[] = [];
    for (const f of list) {
      if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) {
        try {
          setConverting(`Reading ${f.name}…`);
          add.push(...await pdfToPageImages(f, (d, t) => setConverting(`Reading ${f.name} — page ${d} of ${t}…`)));
          const nice = f.name.replace(/\.pdf$/i, '').replace(/[-_]+/g, ' ').trim();
          if (nice && !/^(scan|img|image|document|shared)[\s\d]*$/i.test(nice)) setName(p => p || nice);
        } catch { setError(`Couldn't read ${f.name} — photograph the pages instead.`); }
        finally { setConverting(''); }
        continue;
      }
      if (f.type.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif)$/i.test(f.name)) add.push(f);
    }
    setFiles(prev => [...prev, ...add].slice(0, TUTOR_MARKED_MAX_PAGES));
  }

  function clearPages() { setFiles([]); uploaded.current.clear(); setAskScore(false); }

  async function send() {
    setError('');
    try {
      const urls: string[] = [];
      for (let i = 0; i < files.length; i++) {
        let url = uploaded.current.get(i);
        if (!url) {
          setStage(`Uploading page ${i + 1} of ${files.length}…`);
          url = await uploadPage(files[i], n => setStage(n));
          uploaded.current.set(i, url);
        }
        urls.push(url);
      }
      setStage(askScore ? 'Saving…' : 'Reading the total…');
      const r = await fetch('/api/portal/tutor-marked', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photoUrls: urls, paperName: name.trim(), subject: subject || undefined, ...(askScore ? { awarded, max } : {}) }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.status === 409 && d.needsScore) {
        setAskScore(true);
        if (d.guess) { setAwarded(String(d.guess.awarded ?? '')); setMax(String(d.guess.max ?? '')); }
        return;
      }
      if (!r.ok || !d.runId) { setError(d.error || 'Could not save your paper — try again.'); return; }
      setDone({ runId: d.runId, awarded: d.awarded, max: d.max });
    } catch (e) {
      setError((e as Error).message || 'Could not save your paper — check your connection and try again.');
    } finally { setStage(''); }
  }

  if (done) {
    return (
      <div className="space-y-4 pt-1">
        <h1 className="text-xl font-bold text-navy">Saved to your Papers</h1>
        <div className={`${CARD} p-4 space-y-3`}>
          <p className="text-sm text-gray-700"><span className="font-semibold text-navy">{name.trim()}</span> · <span className="font-bold">{done.awarded}/{done.max}</span></p>
          <p className="text-[12px] text-gray-500">It sits with your other papers, tagged “Marked by your tutor”, and counts in your scores.</p>
          <div className="flex gap-2">
            <Link href={`/app/marking/${done.runId}`} className="text-sm font-semibold bg-navy text-white rounded-xl px-4 py-2">Open it</Link>
            <Link href="/app/marking" className="text-sm font-semibold text-navy border border-navy/20 rounded-xl px-4 py-2">Papers</Link>
          </div>
        </div>
      </div>
    );
  }

  const busy = !!stage || !!converting;
  const ready = files.length > 0 && !!name.trim() && (subjects.length <= 1 || !!subject) && (!askScore || (awarded.trim() !== '' && max.trim() !== ''));
  return (
    <div className="space-y-4 pb-24 sm:pb-4">
      <div className="pt-1">
        <Link href="/app/submit" className="text-sm text-gray-500 hover:text-navy">← Submit a paper</Link>
        <h1 className="text-xl font-bold text-navy mt-1">A paper your tutor marked</h1>
        <p className="text-[13px] text-gray-600 mt-0.5">Keep it here with your other papers. Nothing is marked again — we only read the total.</p>
      </div>

      <div className={`${CARD} p-4 space-y-4`}>
        <div className="space-y-2">
          <p className="text-sm font-semibold text-navy">1 · Photograph the marked pages</p>
          <button type="button" onClick={() => inputRef.current?.click()} disabled={busy}
            className="w-full rounded-2xl border-2 border-dashed border-violet-200 bg-violet-50/40 px-4 py-4 text-sm font-semibold text-violet-900 disabled:opacity-60">
            {converting || (files.length ? `${files.length} page${files.length > 1 ? 's' : ''} · add more` : 'Take photos or choose a PDF')}
          </button>
          <input ref={inputRef} type="file" accept="image/*,application/pdf" multiple className="hidden"
            onChange={e => { const picked = Array.from(e.target.files ?? []); e.target.value = ''; void onPick(picked); }} />
          {files.length > 0 && !busy && <button type="button" onClick={clearPages} className="text-[12px] text-gray-500 underline">Start the pages again</button>}
          <p className="text-[12px] text-gray-500">Include the page with the total on it.</p>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-semibold text-navy">2 · Which paper is it?</p>
          <input type="text" value={name} onChange={e => setName(e.target.value)} maxLength={80} placeholder="e.g. Xinmin 2024 Prelim P2"
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-navy" />
          {subjects.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {subjects.map(s => (
                <button key={s} type="button" onClick={() => setSubject(s)} aria-pressed={subject === s}
                  className={`rounded-full px-3 py-1 text-sm font-semibold border ${subject === s ? 'bg-navy text-white border-navy' : 'bg-white text-navy border-gray-200'}`}>{s}</button>
              ))}
            </div>
          )}
        </div>

        {askScore && (
          <div className="space-y-2 rounded-2xl bg-amber-50 border border-amber-200 p-3">
            <p className="text-sm font-semibold text-amber-900">What was your score?</p>
            <p className="text-[12px] text-amber-900/80">We couldn&apos;t read the total clearly — type it in.</p>
            <div className="flex items-center gap-2">
              <input inputMode="numeric" value={awarded} onChange={e => setAwarded(e.target.value.replace(/[^\d]/g, ''))} aria-label="Marks scored"
                className="w-20 rounded-xl border border-amber-300 bg-white px-3 py-2 text-sm text-center" placeholder="52" />
              <span className="text-sm text-amber-900">out of</span>
              <input inputMode="numeric" value={max} onChange={e => setMax(e.target.value.replace(/[^\d]/g, ''))} aria-label="Total marks"
                className="w-20 rounded-xl border border-amber-300 bg-white px-3 py-2 text-sm text-center" placeholder="80" />
            </div>
          </div>
        )}

        {error && <p className="text-[13px] text-red-700">{error}</p>}
        <button type="button" onClick={send} disabled={!ready || busy}
          className="w-full text-sm font-semibold bg-navy text-white rounded-xl px-4 py-2.5 disabled:opacity-50">
          {stage || (askScore ? 'Save' : 'Save to my Papers')}
        </button>
      </div>
    </div>
  );
}
