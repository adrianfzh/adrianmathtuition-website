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
// `paper` = a self-generated printed paper (SPEC-PRINT-PAPER.md): name locked
// to its title, POST carries the paper id so marking gets the pre-registered
// question list. Unlike assignments it spends the daily slot.
// `slotUsed` = today's daily hand-in slot is already spent (server-counted in
// page.tsx) — show the allowance state up front instead of a rejection after
// the student has photographed everything. Assignments are cap-exempt.

// One page, up to three attempts.
//
// Sophie, 1 Sep 2026: "i couldn't upload the paper into ur app, it keeps saying
// load failed" — then it went through on a retry. "Load failed" is Safari's
// wording for a fetch that never completed, so this is a phone dropping wifi for
// 4G mid-upload, not a rejection: the upload goes straight to Blob with a client
// token and never touches the marker, so a busy marker cannot cause it.
//
// The loop had no retry and no resume, so one blip threw the whole submission
// away INCLUDING the pages that had already uploaded, and she started at page 1
// with a five-megabyte photo. Three attempts with a growing pause covers a
// handover; the caller caches what succeeds so a fourth failure still keeps the
// finished pages.
async function uploadPage(file: File, onNote: (s: string) => void): Promise<string> {
  const upload = await resizeToJpeg(file);
  let lastErr: Error | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      if (attempt > 1) onNote(`retrying (${attempt} of 3)`);
      const tokenRes = await fetch(`/api/portal/submit-token?filename=${encodeURIComponent(upload.name || 'photo.jpg')}`);
      if (!tokenRes.ok) throw new Error(`could not start the upload (${tokenRes.status})`);
      const { token, pathname } = await tokenRes.json();
      const blob = await put(pathname, upload, {
        access: 'public', token,
        contentType: upload.type || 'application/octet-stream',
        multipart: upload.size > 5 * 1024 * 1024,
      });
      return blob.url;
    } catch (e) {
      lastErr = e as Error;
      // A fresh token each attempt, so an expired one is not the reason a retry
      // fails. Pause 1s then 2s: long enough for a network handover to settle.
      if (attempt < 3) await new Promise(r => setTimeout(r, attempt * 1000));
    }
  }
  throw new Error(`That page would not upload after three tries (${lastErr?.message || 'connection lost'}). Your signal may be weak — tap Send again and it will carry on from where it stopped.`);
}

export default function SubmitClient({ assignment = null, paper = null, slotUsed = false }: {
  assignment?: { id: string; title: string } | null;
  paper?: { id: string; title: string } | null;
  slotUsed?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pages, setPages] = useState<Page[]>([]);
  const [paperName, setPaperName] = useState(assignment?.title ?? paper?.title ?? '');
  const [splitNote, setSplitNote] = useState('');
  const [capNote, setCapNote] = useState('');       // pages dropped at MAX_PAGES — must be visible, never silent
  const [stage, setStage] = useState('');            // progress line while submitting
  const [converting, setConverting] = useState('');  // progress line while a PDF rasterises
  const [error, setError] = useState('');
  // What the pre-flight found wrong with the hand-in. Shown once; sending again
  // goes through regardless (see the route — this is advice, never a gate).
  const [findings, setFindings] = useState<{ kind: string; message: string; blocking?: boolean }[]>([]);
  const [doneRunId, setDoneRunId] = useState<string | null>(null);
  // Pages that already reached Blob, kept across a failed attempt so tapping Send
  // again RESUMES instead of starting from page 1 (1 Sep 2026 — see uploadPage).
  const uploadedRef = useRef<Map<number, string>>(new Map());
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
      // The cache is keyed by index, so removing a page invalidates every entry
      // after it. Cheaper and safer to drop the lot than to renumber.
      uploadedRef.current.clear();
      setFindings([]);
      return prev.filter((_, j) => j !== i);
    });
  }

  async function submit(confirmed = false) {
    if (!pages.length || busy) return;
    if (!paperName.trim()) { setError('Tell us which paper this is before sending.'); return; }
    setError('');
    try {
      const urls: string[] = [];
      for (let i = 0; i < pages.length; i++) {
        const cached = uploadedRef.current.get(i);
        if (cached) { urls.push(cached); continue; }   // already up — don't re-send it
        setStage(pages.length > 1 ? `Uploading page ${i + 1} of ${pages.length}…` : 'Uploading…');
        const url = await uploadPage(pages[i].file, (note) =>
          setStage(`Uploading page ${i + 1} of ${pages.length} — ${note}`));
        uploadedRef.current.set(i, url);
        urls.push(url);
      }
      // The last step, and the one that used to lose everything. All the pages
      // are in storage by now; this small POST is what turns them into a paper.
      // Sophie, 1 Sep 2026: it died on a network handover after eighteen
      // successful uploads and she saw a bare "Load failed" — nothing reached
      // Adrian, though every photo had arrived.
      //
      // Retried like the uploads are. Safe to repeat because the route matches
      // a resend against the photos it already holds and returns the paper it
      // made the first time, rather than making a second (see the route).
      setStage('Sending to Adrian…');
      const body = JSON.stringify({
        photoUrls: urls,
        paperName: paperName.trim(),
        ...(confirmed ? { confirmed: true } : {}),
        ...(assignment ? { assignmentId: assignment.id } : {}),
        ...(paper ? { paperId: paper.id } : {}),
      });
      let r: Response | null = null, d: { error?: string; runId?: string; findings?: { kind: string; message: string; blocking?: boolean }[] } = {}, lastNet: Error | null = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          if (attempt > 1) setStage(`Sending to Adrian… (try ${attempt} of 3)`);
          r = await fetch('/api/portal/submit', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
          });
          d = await r.json().catch(() => ({}));
          break;                       // a reply of ANY status is an answer — stop
        } catch (e) {
          lastNet = e as Error;        // no reply at all: the connection dropped
          if (attempt < 3) await new Promise(res => setTimeout(res, attempt * 1000));
        }
      }
      if (!r) throw new Error(`Your ${pages.length} page${pages.length === 1 ? '' : 's'} uploaded safely, but the last step could not reach us (${lastNet?.message || 'connection lost'}). Tap Send again — it will not upload them a second time.`);
      // 409 with findings: the hand-in looks wrong. Show it and let them decide —
      // their pages stay uploaded, so sending again costs nothing.
      if (r.status === 409 && Array.isArray(d.findings)) {
        setFindings(d.findings);
        setStage('');
        return;
      }
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
          </div>
          {!assignment && (
            <p className="text-[13px] text-gray-500 mt-3">
              🎟️ That was today&apos;s hand-in slot — a fresh one opens at midnight.
            </p>
          )}
        </div>
      </div>
    );
  }

  // Slot already spent today (and this isn't a cap-exempt assignment): say so
  // up front, before any photographing happens. The POST-time 429 stays as the
  // backstop for a slot spent from the Telegram side mid-visit.
  if (slotUsed && !assignment) {
    return (
      <div className="space-y-4 pb-24 sm:pb-4">
        <h1 className="text-xl font-bold text-navy pt-1">Submit a paper</h1>
        <div className={`${CARD} p-5 text-center`}>
          <p className="text-4xl">🎟️</p>
          <p className="font-bold text-navy mt-2">Today&apos;s hand-in slot is used</p>
          <p className="text-sm text-gray-600 mt-1.5">
            One paper a day gets every script marked properly. A fresh slot opens at midnight —
            line the next paper up for tomorrow.
          </p>
          <div className="mt-4 flex justify-center">
            <Link href="/app/marking" className="text-sm font-semibold bg-navy text-[hsl(45,100%,96%)] rounded-xl px-4 py-2.5">
              Go to Marked papers
            </Link>
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
      ) : paper ? (
        <div className="pt-1">
          <Link href="/app/print" className="text-sm text-gray-500 hover:text-navy">← Back to your papers</Link>
          <h1 className="text-xl font-bold text-navy mt-1">📬 Hand in: {paper.title}</h1>
          <p className="text-[13px] text-gray-500 mt-0.5">Marking already knows every question on this sheet.</p>
        </div>
      ) : (
        <div className="pt-1">
          <h1 className="text-xl font-bold text-navy">Submit a paper</h1>
          <p className="text-[13px] text-gray-500 mt-0.5">🎟️ Today&apos;s hand-in slot is open — one marked paper per day.</p>
        </div>
      )}

      <div className={`${CARD} p-4 space-y-3`}>
        <p className="text-sm text-gray-600">
          Photograph your worked {assignment ? 'worksheet' : 'paper'} — <b>one page per photo</b>, straight on, in good light —
          or upload a <b>PDF scan</b>. It comes back marked in <b>Marked papers</b>.
        </p>

        {/* Free-form hand-ins only — mocks and assigned worksheets already carry their
            questions. The marker anchors each attempt on the student's own question
            labels, and printed question pages are classified and skipped harmlessly,
            so asking for both rescues the working-on-foolscap case at no cost
            (Adrian, 2026-08-28, ahead of Alessi's plain-paper TYS hand-in). */}
        {!assignment && !paper && (
          <p className="text-[13px] text-gray-500">
            ✍️ Worked on your own paper instead of the question sheet? Add photos of the{' '}
            <b>question pages</b> too, and write each <b>question number</b> clearly beside
            your working — everything goes in this one submission.
          </p>
        )}

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
        ) : paper ? (
          <p className="text-[13px] text-gray-600">Filed as <b className="text-navy">{paper.title}</b> — your printed paper.</p>
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
          {/* A name shaped like the placeholder is what lets ai/paper-totals.js
              ground the run to the official total (e.g. /90) — vague names fall
              back to a counted denominator (Adrian, 2026-08-29). */}
          <p className="text-[11px] text-gray-400 mt-1">School, year and paper — so Adrian knows what he&apos;s marking, and your score comes back out of the official total (e.g. /90).</p>
        </div>
        )}

        {error && <p className="text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">{error}</p>}

        {/* What the pre-flight found. Amber, not red: nothing here is an error —
            the pages are uploaded and the hand-in will go through either way.
            The point is to ask the one question only the student can answer,
            while the paper is still in front of them. */}
        {findings.length > 0 && (
          <div className="text-sm bg-amber-50 border border-amber-200 rounded-xl px-3 py-3 space-y-2">
            <p className="font-bold text-amber-900">Before you send — check this</p>
            <ul className="space-y-1.5 text-amber-900">
              {findings.map((f, i) => <li key={i} className="leading-snug">• {f.message}</li>)}
            </ul>
            <p className="text-[11px] text-amber-700">
              Your photos are already uploaded — adding a page won&apos;t re-send them.
            </p>
          </div>
        )}

        <button
          onClick={() => submit(findings.length > 0)}
          disabled={!pages.length || !paperName.trim() || busy}
          className="w-full text-sm font-bold bg-navy text-[hsl(45,100%,96%)] rounded-xl py-3 disabled:opacity-40"
        >
          {busy ? stage
            : findings.length > 0 ? '📤 Send anyway'
            : pages.length ? `📤 Send ${pages.length} page${pages.length === 1 ? '' : 's'} for marking` : '📤 Send for marking'}
        </button>
        <p className="text-[11px] text-gray-400">
          Wide photos of an open booklet are split into single pages automatically. PDFs are converted to pages on your phone before uploading.
        </p>
      </div>
    </div>
  );
}
