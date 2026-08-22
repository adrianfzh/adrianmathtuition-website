'use client';

// Phone-first hand-in flow: pick/shoot photos → auto spread-split + downscale →
// straight-to-Blob uploads (client token; the 4.5MB body cap never applies) →
// one POST that files the run under this student. Mirrors the admin intake's
// photo hygiene (same spread heuristic, same ~2600px cap) so a student hand-in
// marks exactly as well as one Adrian photographs himself.
import { useRef, useState } from 'react';
import Link from 'next/link';
import { put } from '@vercel/blob/client';
import { pdfToPageImages } from '@/lib/pdf-pages';
import { splitFileIfSpread, resizeToJpeg } from '@/lib/spread-split';

const CARD = 'bg-white rounded-2xl border border-black/5 shadow-sm';
const MAX_PAGES = 20;

type Page = { file: File; preview: string | null };

// `assignment` = a "From Adrian" worksheet (SPEC-ASSIGN.md): the paper name is
// the worksheet title (locked) and the POST carries the assignment id so the
// run auto-releases and the assignment flips to submitted → marked.
export default function SubmitClient({ assignment = null }: { assignment?: { id: string; title: string } | null }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pages, setPages] = useState<Page[]>([]);
  const [paperName, setPaperName] = useState(assignment?.title ?? '');
  const [splitNote, setSplitNote] = useState('');
  const [capNote, setCapNote] = useState('');       // pages dropped at MAX_PAGES — must be visible, never silent
  const [stage, setStage] = useState('');            // progress line while submitting
  const [converting, setConverting] = useState('');  // progress line while a PDF rasterises
  const [error, setError] = useState('');
  const [doneRunId, setDoneRunId] = useState<string | null>(null);
  const busy = stage !== '' || converting !== '';

  async function onPick(list: FileList | null) {
    if (!list?.length) return;
    setError('');
    const isPdf = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
    // A PDF (a scan rather than phone photos) expands to one image per page first,
    // then everything goes down the same photo path — same spread heuristic, same
    // 2600px cap as the admin intake.
    const files: File[] = [];
    for (const f of Array.from(list)) {
      if (isPdf(f)) {
        try {
          setConverting(`Reading ${f.name}…`);
          const pgs = await pdfToPageImages(f, (done, total) => setConverting(`Reading ${f.name} — page ${done} of ${total}…`));
          if (!pgs.length) throw new Error('no pages could be rendered');
          files.push(...pgs);
          // A named scan is usually the paper's name — offer it, never overwrite.
          const nice = f.name.replace(/\.pdf$/i, '').replace(/[-_]+/g, ' ').trim();
          if (nice && !/^(scan|img|image|document|shared)[\s\d]*$/i.test(nice)) setPaperName(prev => prev || nice);
        } catch (e) {
          setError(`Couldn't read ${f.name} (${(e as Error).message}). Photograph the pages instead.`);
        } finally { setConverting(''); }
        continue;
      }
      if (!f.type.startsWith('image/') && !/\.(jpe?g|png|webp|heic|heif)$/i.test(f.name)) continue;
      files.push(f);
    }
    const added: Page[] = [];
    let splits = 0;
    for (const f of files) {
      const r = await splitFileIfSpread(f);
      if (r.split) splits += 1;
      for (const half of r.files) {
        let preview: string | null = null;
        try { const b = await createImageBitmap(half); b.close?.(); preview = URL.createObjectURL(half); } catch { /* HEIC on Chrome — uploads fine, just no preview */ }
        added.push({ file: half, preview });
      }
    }
    if (splits) setSplitNote(`✂️ Split ${splits} two-page photo${splits > 1 ? 's' : ''} into single pages for you`);
    setPages(prev => {
      const merged = [...prev, ...added];
      const dropped = merged.length - MAX_PAGES;
      if (dropped > 0) {
        // Idempotent side effects (safe under StrictMode double-invoke): revoking
        // an already-revoked URL is a no-op, and the note text is deterministic.
        merged.slice(MAX_PAGES).forEach(p => { if (p.preview) URL.revokeObjectURL(p.preview); });
        setCapNote(`⚠️ A submission holds at most ${MAX_PAGES} pages — the last ${dropped === 1 ? 'page' : `${dropped} pages`} didn't fit. Submit ${dropped === 1 ? 'it' : 'them'} as a second paper.`);
      } else {
        setCapNote('');
      }
      return merged.slice(0, MAX_PAGES);
    });
    if (inputRef.current) inputRef.current.value = '';
  }

  function removePage(i: number) {
    setPages(prev => {
      const p = prev[i];
      if (p?.preview) URL.revokeObjectURL(p.preview);
      return prev.filter((_, j) => j !== i);
    });
  }

  async function submit() {
    if (!pages.length || busy) return;
    if (!paperName.trim()) { setError('Tell us which paper this is before sending.'); return; }
    setError('');
    try {
      const urls: string[] = [];
      for (let i = 0; i < pages.length; i++) {
        setStage(`Uploading page ${i + 1} of ${pages.length}…`);
        const upload = await resizeToJpeg(pages[i].file);
        const tokenRes = await fetch(`/api/portal/submit-token?filename=${encodeURIComponent(upload.name || 'photo.jpg')}`);
        if (!tokenRes.ok) throw new Error('Could not start the upload — check your connection and try again.');
        const { token, pathname } = await tokenRes.json();
        const blob = await put(pathname, upload, {
          access: 'public', token,
          contentType: upload.type || 'application/octet-stream',
          multipart: upload.size > 5 * 1024 * 1024,
        });
        urls.push(blob.url);
      }
      setStage('Sending to Adrian…');
      const r = await fetch('/api/portal/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photoUrls: urls, paperName: paperName.trim(), ...(assignment ? { assignmentId: assignment.id } : {}) }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'The submission failed — try again.');
      setDoneRunId(d.runId || 'ok');
      pages.forEach(p => { if (p.preview) URL.revokeObjectURL(p.preview); });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setStage('');
    }
  }

  if (doneRunId) {
    return (
      <div className="space-y-4 pb-24 sm:pb-4">
        <h1 className="text-xl font-bold text-navy pt-1">{assignment ? 'Worksheet sent' : 'Submit a paper'}</h1>
        <div className={`${CARD} p-5 text-center`}>
          <p className="text-4xl">✅</p>
          <p className="font-bold text-navy mt-2">{assignment ? `“${assignment.title}” sent for marking` : 'Sent to Adrian for marking'}</p>
          <p className="text-sm text-gray-600 mt-1.5">
            When it&apos;s marked and released, it appears in <b>Marked papers</b> — with your script,
            the red pen, and what each lost mark was for.
          </p>
          <div className="mt-4 flex flex-col sm:flex-row gap-2 justify-center">
            <Link href={assignment ? '/app/assignments' : '/app/marking'} className="text-sm font-semibold bg-navy text-[hsl(45,100%,96%)] rounded-xl px-4 py-2.5">
              {assignment ? 'Back to From Adrian' : 'Go to Marked papers'}
            </Link>
            {!assignment && (
            <button
              onClick={() => { setDoneRunId(null); setPages([]); setPaperName(''); setSplitNote(''); setCapNote(''); }}
              className="text-sm font-semibold text-navy rounded-xl px-4 py-2.5 border border-black/10"
            >
              Submit another paper
            </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-24 sm:pb-4">
      {assignment ? (
        <div className="pt-1">
          <Link href={`/app/assignments/${assignment.id}`} className="text-sm text-gray-500 hover:text-navy">← Back to the worksheet</Link>
          <h1 className="text-xl font-bold text-navy mt-1">📬 Submit: {assignment.title}</h1>
        </div>
      ) : (
        <h1 className="text-xl font-bold text-navy pt-1">Submit a paper</h1>
      )}

      <div className={`${CARD} p-4 space-y-3`}>
        <p className="text-sm text-gray-600">
          Photograph your worked {assignment ? 'worksheet' : 'paper'} — <b>one page per photo</b>, straight on, in good light —
          or upload a <b>PDF scan</b>. It comes back marked in <b>Marked papers</b>.
        </p>

        <button
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="w-full rounded-2xl border-2 border-dashed border-gray-300 bg-[hsl(45,100%,98%)] py-8 text-center active:bg-amber-50"
        >
          <span className="block text-3xl mb-1">📷</span>
          <span className="text-sm font-semibold text-navy">
            {converting
              ? converting
              : pages.length ? `${pages.length} page${pages.length > 1 ? 's' : ''} added — tap to add more` : 'Take photos or choose a PDF'}
          </span>
        </button>
        <input
          ref={inputRef} type="file" accept="image/*,application/pdf" multiple className="hidden"
          onChange={(e) => onPick(e.target.files)}
        />

        {capNote && <p className="text-[13px] font-semibold text-amber-700">{capNote}</p>}
        {splitNote && pages.length > 0 && <p className="text-[13px] text-emerald-700">{splitNote}</p>}

        {pages.length > 0 && (
          <div className="grid grid-cols-4 gap-2">
            {pages.map((p, i) => (
              <div key={i} className="relative aspect-[3/4]">
                {p.preview
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={p.preview} alt={`page ${i + 1}`} className="w-full h-full object-cover rounded-lg border border-gray-200" />
                  : <div className="w-full h-full rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center text-xl">🖼️</div>}
                <span className="absolute bottom-1 left-1 text-[10px] font-bold bg-black/60 text-white rounded px-1">{i + 1}</span>
                {!busy && (
                  <button
                    onClick={() => removePage(i)} aria-label={`Remove page ${i + 1}`}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-gray-900 text-white text-xs leading-none border-2 border-white"
                  >×</button>
                )}
              </div>
            ))}
          </div>
        )}

        {assignment ? (
          <p className="text-[13px] text-gray-600">Filed as <b className="text-navy">{assignment.title}</b> — Adrian&apos;s worksheet.</p>
        ) : (
        <div>
          <label htmlFor="paper-name" className="block text-[13px] font-semibold text-gray-700 mb-1">
            What paper is this?
          </label>
          <input
            id="paper-name" type="text" value={paperName} maxLength={80} required
            onChange={(e) => setPaperName(e.target.value)}
            placeholder="e.g. Xinmin 2021 Prelim P2"
            className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy/20"
          />
          <p className="text-[11px] text-gray-400 mt-1">School, year and paper — so Adrian knows what he&apos;s marking.</p>
        </div>
        )}

        {error && <p className="text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">{error}</p>}

        <button
          onClick={submit}
          disabled={!pages.length || !paperName.trim() || busy}
          className="w-full text-sm font-bold bg-navy text-[hsl(45,100%,96%)] rounded-xl py-3 disabled:opacity-40"
        >
          {busy ? stage : pages.length ? `📤 Send ${pages.length} page${pages.length === 1 ? '' : 's'} for marking` : '📤 Send for marking'}
        </button>
        <p className="text-[11px] text-gray-400">
          Wide photos of an open booklet are split into single pages automatically. PDFs are converted to pages on your phone before uploading.
        </p>
      </div>
    </div>
  );
}
