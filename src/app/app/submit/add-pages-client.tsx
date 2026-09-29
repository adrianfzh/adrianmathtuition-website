'use client';

// ➕ Add forgotten pages to a paper still waiting to be marked (29 Sep 2026).
// Adrian: "the '+ Add pages' is good > but also inform the student you can add
// pages while paper is still in the queue. and if student add pages, will the
// system be able to arrange the pages correctly?" — yes: the bot reads every page
// (printed and handwritten question labels) and puts the whole paper back in
// question order before marking, so the added page lands where it belongs.
//
// Opening this screen holds the paper out of the queue for 10 minutes (the page
// server component asks for the hold), long enough to photograph a page or two.
import { useRef, useState } from 'react';
import Link from 'next/link';
import { uploadPage } from './submit-client';
import { pdfToPageImages } from '@/lib/pdf-pages';
import { splitFileIfSpread } from '@/lib/spread-split';

const CARD = 'bg-white rounded-2xl border border-black/5 shadow-sm';

type Page = { file: File; preview: string | null };
type Finding = { kind: string; message: string };

export default function AddPagesClient({ runId, title, pagesNow, backHref }: {
  runId: string; title: string; pagesNow: number; backHref: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const uploaded = useRef(new Map<number, string>());
  const [pages, setPages] = useState<Page[]>([]);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ total: number; added: number; reordered: boolean; findings: Finding[] } | null>(null);
  const room = Math.max(0, 30 - pagesNow);

  async function onPick(list: FileList | null) {
    if (!list?.length) return;
    setError('');
    const files: File[] = [];
    for (const f of Array.from(list)) {
      if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) {
        try { files.push(...await pdfToPageImages(f, () => {})); } catch { setError(`Couldn't read ${f.name} — photograph the pages instead.`); }
        continue;
      }
      if (f.type.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif)$/i.test(f.name)) files.push(f);
    }
    const added: Page[] = [];
    for (const f of files) {
      const r = await splitFileIfSpread(f);
      for (const half of r.files) {
        let preview: string | null = null;
        try { const b = await createImageBitmap(half); b.close?.(); preview = URL.createObjectURL(half); } catch { /* HEIC: no preview */ }
        added.push({ file: half, preview });
      }
    }
    setPages(prev => [...prev, ...added].slice(0, room));
    if (inputRef.current) inputRef.current.value = '';
  }

  async function send() {
    if (!pages.length || busy) return;
    setBusy(true); setError('');
    try {
      const urls: string[] = [];
      for (let i = 0; i < pages.length; i++) {
        const cached = uploaded.current.get(i);
        if (cached) { urls.push(cached); continue; }
        setStage(`Uploading page ${i + 1} of ${pages.length}…`);
        const url = await uploadPage(pages[i].file, (n) => setStage(`Uploading page ${i + 1} of ${pages.length} — ${n}`));
        uploaded.current.set(i, url);
        urls.push(url);
      }
      setStage('Putting your pages in order…');
      const r = await fetch('/api/portal/handin/add-pages', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId, action: 'add', photoUrls: urls }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (d.refused === 'started' || d.refused === 'marked') {
          throw new Error(`${d.error} Hand these pages in as a separate paper for now — name it “${title} (extra pages)”.`);
        }
        throw new Error(d.error || 'The pages could not be added — tap Add again.');
      }
      pages.forEach(p => { if (p.preview) URL.revokeObjectURL(p.preview); });
      setDone({ total: d.total, added: d.added, reordered: !!d.reordered, findings: Array.isArray(d.findings) ? d.findings : [] });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false); setStage('');
    }
  }

  if (done) {
    return (
      <div className="space-y-4 pb-24 sm:pb-4">
        <h1 className="text-xl font-bold text-navy pt-1">Pages added</h1>
        <div className={`${CARD} p-5 text-center`}>
          <p className="text-4xl">✅</p>
          <p className="font-bold text-navy mt-2">{done.added} page{done.added === 1 ? '' : 's'} added to “{title}”</p>
          <p className="text-sm text-gray-600 mt-1.5">
            It now has {done.total} pages{done.reordered ? ', put in question order' : ''}, and it will be marked with all of them.
          </p>
          {done.findings.length > 0 && (
            <div className="mt-3 text-left text-sm bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 text-amber-900">
              <p className="font-bold">Still check this</p>
              <ul className="mt-1 space-y-1">{done.findings.map((f, i) => <li key={i}>• {f.message}</li>)}</ul>
              <a href={`?addTo=${runId}`} className="inline-block mt-2 text-[13px] font-semibold underline underline-offset-2">➕ Add more pages</a>
            </div>
          )}
          <div className="mt-4 flex justify-center">
            <Link href={backHref} className="text-sm font-semibold bg-navy text-[hsl(45,100%,96%)] rounded-xl px-4 py-2.5">Done</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-24 sm:pb-4">
      <div className="pt-1">
        <Link href={backHref} className="text-sm text-gray-500 hover:text-navy">← Back</Link>
        <h1 className="text-xl font-bold text-navy mt-1">➕ Add pages: {title}</h1>
        <p className="text-[13px] text-gray-500 mt-0.5">
          It has {pagesNow} page{pagesNow === 1 ? '' : 's'} so far. Add the ones you missed — in any order: we put the whole paper back in question order before it is marked.
        </p>
      </div>
      <div className={`${CARD} p-4 space-y-3`}>
        <p className="text-[13px] text-teal-800 bg-teal-50 border border-teal-200 rounded-xl px-3 py-2">
          ⏸ This paper waits for you for the next 10 minutes, so marking won&apos;t start before your pages are in.
        </p>
        <button
          onClick={() => inputRef.current?.click()} disabled={busy || !room}
          className="w-full rounded-2xl border-2 border-dashed border-gray-300 bg-[hsl(45,100%,98%)] py-8 text-center active:bg-amber-50"
        >
          <span className="block text-3xl mb-1">📷</span>
          <span className="text-sm font-semibold text-navy">
            {!room ? 'This paper already has 30 pages' : pages.length ? `${pages.length} page${pages.length > 1 ? 's' : ''} ready — tap to add more` : 'Take photos of the missing pages'}
          </span>
        </button>
        <input ref={inputRef} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={(e) => onPick(e.target.files)} />
        {pages.length > 0 && (
          <div className="grid grid-cols-4 gap-2">
            {pages.map((p, i) => (
              <div key={i} className="relative aspect-[3/4]">
                {p.preview
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={p.preview} alt={`new page ${i + 1}`} className="w-full h-full object-cover rounded-lg border border-gray-200" />
                  : <div className="w-full h-full rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center text-xl">🖼️</div>}
                {!busy && (
                  <button onClick={() => { uploaded.current.clear(); setPages(prev => prev.filter((_, j) => j !== i)); }}
                    aria-label={`Remove new page ${i + 1}`}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-gray-900 text-white text-xs leading-none border-2 border-white">×</button>
                )}
              </div>
            ))}
          </div>
        )}
        {error && <p className="text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">{error}</p>}
        <button
          onClick={send} disabled={!pages.length || busy}
          className="w-full text-sm font-bold bg-navy text-[hsl(45,100%,96%)] rounded-xl py-3 disabled:opacity-40"
        >
          {busy ? stage : pages.length ? `➕ Add ${pages.length} page${pages.length === 1 ? '' : 's'} to this paper` : '➕ Add pages'}
        </button>
      </div>
    </div>
  );
}
