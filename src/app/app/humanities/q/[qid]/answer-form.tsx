'use client';
// The answer box (SPEC-HUMANITIES.md). A live word count; POST /api/portal/humanities → the report page.
// Or a photo of a handwritten answer (15 Oct 2026): /api/portal/humanities/transcribe types it out
// into this box, the student checks it, then hands in the text as usual.
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fileToJpegDataUrl } from '@/app/app/practice/image-downscale';

const MAX_PAGES = 4;

function wordsOf(t: string): number {
  const s = t.trim();
  return s ? s.split(/\s+/).length : 0;
}

export default function AnswerForm({ questionId, maxWords }: { questionId: string; maxWords: number }) {
  const router = useRouter();
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [fromPhoto, setFromPhoto] = useState<{ unsure: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const wc = wordsOf(answer);
  const gaps = answer.includes('[?]');

  async function readPhotos(list: FileList | null) {
    const files = Array.from(list ?? []).slice(0, MAX_PAGES);
    if (files.length === 0) return;
    setReading(true); setError(null);
    try {
      const images = await Promise.all(files.map(async f => ({ data: await fileToJpegDataUrl(f), mediaType: 'image/jpeg' })));
      const r = await fetch('/api/portal/humanities/transcribe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId, images }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setError(j.error || 'We could not read the photo.'); return; }
      setAnswer(j.text); setFromPhoto({ unsure: j.unsure ?? 0 });
    } catch {
      setError('We could not read the photo — try again.');
    } finally {
      setReading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function submit() {
    setBusy(true); setError(null);
    try {
      const r = await fetch('/api/portal/humanities', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId, answer }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setError(j.error || 'Something went wrong.'); setBusy(false); return; }
      router.push(`/app/humanities/${j.id}`);
    } catch {
      setError('No connection — try again.'); setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={e => readPhotos(e.target.files)} />
      <button type="button" onClick={() => fileRef.current?.click()} disabled={reading || busy}
        className="w-full flex items-center gap-3 bg-white rounded-3xl px-4 py-3 border border-amber-200 shadow-sm hover:border-amber-300 active:scale-[0.99] transition disabled:opacity-60 text-left">
        <span className="text-xl" aria-hidden>📷</span>
        <span className="flex-1 min-w-0">
          <span className="block text-[15px] font-bold text-navy">{reading ? 'Reading your writing…' : 'Wrote it on paper? Send a photo'}</span>
          <span className="block text-[12px] text-gray-500">{reading ? 'This takes a few seconds.' : `Up to ${MAX_PAGES} pages. We type it out for you to check.`}</span>
        </span>
      </button>
      {fromPhoto && (
        <p className="text-[13px] text-amber-900 bg-amber-50 border border-amber-100 rounded-2xl px-3 py-2">
          Check the words below match your page, and fix any that don&apos;t.
          {fromPhoto.unsure > 0 && <> Each [?] is a word we could not read. Type it in.</>}
        </p>
      )}
      <label className="block bg-white rounded-3xl p-4 border border-black/5 shadow-sm">
        <span className="flex items-baseline justify-between">
          <span className="text-[12px] font-semibold text-gray-500">Your answer</span>
          <span className={`text-[12px] ${wc > maxWords ? 'text-rose-700 font-semibold' : 'text-gray-400'}`}>{wc} words</span>
        </span>
        <textarea value={answer} onChange={e => setAnswer(e.target.value)} rows={9}
          placeholder="Type your answer here, or send a photo above."
          className="mt-1 w-full rounded-2xl border border-black/10 bg-white px-3 py-2.5 text-[15px] leading-relaxed text-navy" />
      </label>
      {error && <p className="text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-2xl px-3 py-2">{error}</p>}
      <button type="button" onClick={submit} disabled={busy || reading || gaps || wc < 3 || wc > maxWords}
        className="w-full bg-amber-600 text-white rounded-3xl px-4 py-3.5 font-semibold hover:brightness-105 active:scale-[0.98] transition disabled:opacity-50">
        {busy ? 'Handing in…' : 'Get feedback'}
      </button>
      {gaps && !reading && <p className="text-[12px] text-gray-500 text-center">Type in each [?] first.</p>}
    </div>
  );
}
