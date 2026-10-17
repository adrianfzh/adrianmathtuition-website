'use client';
// A whole paper at once (17 Oct 2026, Adrian: "do the next two"): the student adds photos of every page — the
// questions and what they wrote — in order. "Read my paper" sends them three at a time to
// /api/portal/humanities/transcribe (mode 'paper'), merges the questions found (lib/humanities-paper-merge), lists
// them to check, then "Mark my paper" hands them in (/api/portal/humanities/own-paper) → the paper's results page.
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fileToJpegDataUrl } from '@/app/app/practice/image-downscale';
import { mergePaperItems, markable } from '@/lib/humanities-paper-merge';
import type { PaperItem } from '@/lib/humanities-photo';
import type { HumanitiesSubject } from '@/lib/humanities-questions';

const MAX_PAGES = 30;
const BATCH = 3;
const words = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;

export default function PaperBox({ subject, pure }: { subject: HumanitiesSubject; pure: boolean }) {
  const router = useRouter();
  const ref = useRef<HTMLInputElement>(null);
  const [pages, setPages] = useState<string[]>([]);
  const [items, setItems] = useState<PaperItem[] | null>(null);
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function add(list: FileList | null) {
    const files = Array.from(list ?? []);
    if (!files.length) return;
    setError(null); setStep('Adding pages…');
    try {
      const urls = await Promise.all(files.map(f => fileToJpegDataUrl(f)));
      setPages(p => [...p, ...urls].slice(0, MAX_PAGES));
      setItems(null);
    } catch { setError('One of the photos could not be read. Try again.'); }
    setStep(null);
  }

  async function read() {
    setError(null); setItems(null);
    const batches: PaperItem[][] = [];
    for (let i = 0; i < pages.length; i += BATCH) {
      setStep(`Reading pages ${i + 1}–${Math.min(i + BATCH, pages.length)} of ${pages.length}…`);
      const r = await fetch('/api/portal/humanities/transcribe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        // The question the previous pages ended on, so an answer running onto these pages joins it.
        body: JSON.stringify({ mode: 'paper', after: batches.flat().at(-1)?.number ?? '', images: pages.slice(i, i + BATCH).map(data => ({ data, mediaType: 'image/jpeg' })) }),
      }).catch(() => null);
      const j = r ? await r.json().catch(() => ({})) : {};
      if (!r || !r.ok) { setError(j.error || 'We could not read those pages. Try again.'); setStep(null); return; }
      batches.push(j.items ?? []);
    }
    const merged = mergePaperItems(batches);
    setItems(merged); setStep(null);
    if (!merged.some(markable)) setError('We could not find a question with your answer. Check the photos show the questions and what you wrote.');
  }

  async function mark() {
    if (!items) return;
    setError(null); setStep('Setting up the marking… this can take a minute.');
    const r = await fetch('/api/portal/humanities/own-paper', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject, pure, items }),
    }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    if (!r || !r.ok) { setError(j.error || 'Something went wrong. Try again.'); setStep(null); return; }
    router.push(`/app/humanities/group/${j.group}`);
  }

  const box = 'bg-white rounded-3xl p-4 border border-black/5 shadow-sm';
  const toMark = (items ?? []).filter(markable);
  return (
    <div className="space-y-3">
      <div className={box}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[12px] font-semibold uppercase tracking-wide text-gray-400">Your paper</span>
          <input ref={ref} type="file" accept="image/*" multiple className="hidden" onChange={e => { add(e.target.files); e.target.value = ''; }} />
          <button type="button" onClick={() => ref.current?.click()} disabled={!!step}
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-full px-3 py-1 disabled:opacity-60">
            <span aria-hidden>📷</span>{pages.length ? 'Add more pages' : 'Add pages'}
          </button>
        </div>
        <p className="text-[12px] text-gray-500 mt-1">Photograph every page, in order: the questions and what you wrote.</p>
        {pages.length > 0 && (
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {pages.map((src, i) => (
              <div key={i} className="relative shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt={`Page ${i + 1}`} className="h-20 w-14 object-cover rounded-lg border border-black/10" />
                <button type="button" aria-label={`Remove page ${i + 1}`} onClick={() => { setPages(p => p.filter((_, k) => k !== i)); setItems(null); }}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-white border border-black/10 text-[11px] leading-none text-gray-600">✕</button>
                <span className="absolute bottom-0.5 left-1 text-[10px] text-white font-semibold drop-shadow">{i + 1}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {pages.length > 0 && !items && (
        <button type="button" onClick={read} disabled={!!step}
          className="w-full bg-amber-600 text-white rounded-3xl px-4 py-3.5 font-semibold disabled:opacity-60">
          {step ?? `Read my paper (${pages.length} ${pages.length === 1 ? 'page' : 'pages'})`}
        </button>
      )}

      {items && (
        <div className={box}>
          <p className="text-[12px] font-semibold uppercase tracking-wide text-gray-400">Questions we found</p>
          <ul className="mt-2 divide-y divide-black/5">
            {items.map(it => (
              <li key={it.number} className="flex items-start gap-3 py-2">
                <span className="shrink-0 w-8 text-[14px] font-bold text-navy">Q{it.number}</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[13px] text-gray-700 line-clamp-2">{it.question || 'Question not found in the photos'}</span>
                  <span className={`block text-[12px] ${markable(it) ? 'text-gray-500' : 'text-amber-800'}`}>
                    {markable(it) ? `Your answer: ${words(it.answer)} words` : it.question ? 'No answer found — it will be skipped' : 'Add the page with this question'}
                  </span>
                </span>
                <button type="button" aria-label={`Leave out question ${it.number}`} onClick={() => setItems(list => (list ?? []).filter(x => x !== it))}
                  className="shrink-0 text-[12px] text-gray-400 underline underline-offset-2">Leave out</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && <p className="text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-2xl px-3 py-2">{error}</p>}
      {items && toMark.length > 0 && (
        <button type="button" onClick={mark} disabled={!!step}
          className="w-full bg-amber-600 text-white rounded-3xl px-4 py-3.5 font-semibold disabled:opacity-60">
          {step ?? `Mark my paper (${toMark.length} ${toMark.length === 1 ? 'question' : 'questions'})`}
        </button>
      )}
    </div>
  );
}
