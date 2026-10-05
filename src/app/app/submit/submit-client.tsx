'use client';

// Phone-first hand-in flow: pick/shoot photos → auto spread-split + downscale →
// straight-to-Blob uploads (client token; the 4.5MB body cap never applies) →
// one POST that files the run under this student. Mirrors the admin intake's
// photo hygiene (same spread heuristic, same ~2600px cap) so a student hand-in
// marks exactly as well as one Adrian photographs himself.
import { useCallback, useEffect, useRef, useState } from 'react';
import { subjectLabel } from '@/lib/mark-subjects';
import Link from 'next/link';
import {
  looksLikeNamedPaper, shapePaperCheck,
  type PaperCheck,
} from '@/lib/paper-check';
import { uploadStudentFile } from '@/lib/student-files-client';
import { pdfToPageImages } from '@/lib/pdf-pages';
import { friendlyPortalMessage } from '@/lib/portal-fetch';
import { splitFileIfSpread, resizeToJpeg } from '@/lib/spread-split';
import { SUBMIT_FAILED_KIND, type SubmitFailure } from '@/lib/submit-failure';
import { startsPhrase } from '@/lib/daily-queue';
import { sgtTodayISO } from '@/lib/sgt';

// Tell Adrian a hand-in failed after every retry (7 Sep 2026: "monitor failures
// on students' end"). Fire-and-forget with keepalive, so it survives the student
// closing the tab; the route never answers anything but ok. No photos travel.
function reportSubmitFailure(detail: Omit<SubmitFailure, 'attempts'> & { attempts?: number }) {
  try {
    fetch('/api/portal/event', {
      method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: SUBMIT_FAILED_KIND, detail: { attempts: 3, ...detail } }),
    }).catch(() => {});
  } catch { /* telemetry never blocks the student */ }
}

const CARD = 'bg-white rounded-2xl border border-black/5 shadow-sm';
const MAX_PAGES = 30;   // was 20 — raised 26 Sep 2026 (a student hit it with an A Math paper + its cover page); the bot mirror is lib/handin.js

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
/** The message for a page that would not upload after every retry. Pure — tested. */
export function uploadFailureMessage(index: number, total: number): string {
  const kept = index;
  const keptNote = kept === 0
    ? 'Nothing has been sent yet.'
    : `The ${kept} page${kept === 1 ? '' : 's'} before it ${kept === 1 ? 'is' : 'are'} already with us and will not be sent twice.`;
  return `Page ${index + 1} of ${total} did not upload after three tries — usually a weak signal. ${keptNote} Check your connection and tap Send again.`;
}

export async function uploadPage(file: File, onNote: (s: string) => void): Promise<string> {
  const upload = await resizeToJpeg(file);
  let lastReason = '';
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      if (attempt > 1) onNote(`retrying (${attempt} of 3)`);
      // Signed upload straight into the private student-files bucket (5 Sep 2026;
      // was a Vercel Blob client token). The server pins the key under this
      // student's own prefix; the URL that comes back is what /api/portal/submit
      // checks ownership against.
      const up = await uploadStudentFile(
        `/api/portal/submit-token?filename=${encodeURIComponent(upload.name || 'photo.jpg')}`,
        upload,
        { contentType: upload.type || 'application/octet-stream' },
      );
      return up.url;
    } catch (e) {
      lastReason = (e as Error)?.message || String(e);
      // A fresh token each attempt, so an expired one is not the reason a retry
      // fails. Pause 1s then 2s: long enough for a network handover to settle.
      if (attempt < 3) await new Promise(r => setTimeout(r, attempt * 1000));
    }
  }
  const err = new Error('That page would not upload after three tries. Your signal may be weak — tap Send again and it will carry on from where it stopped.');
  (err as Error & { reason?: string }).reason = lastReason;   // the browser's own words, for the report to Adrian
  throw err;
}

export default function SubmitClient({ assignment = null, paper = null, slotUsed = false, queueNotice = null, subjectChoices = [], family = 'math', embedded = false }: {
  assignment?: { id: string; title: string } | null;
  paper?: { id: string; title: string } | null;
  slotUsed?: boolean;
  // 🧪 The science waiting list's word for this hand-in (SPEC-PRACTICE-PHOTO §14):
  // blocking = the three-day horizon is full; otherwise the day it queues for.
  queueNotice?: { blocking: boolean; text: string } | null;
  // The subjects this student may mark a hand-in as. Empty (the default for
  // every student until the flag flips) means no picker and an implicit math
  // hand-in — nothing on screen changes. First entry is the default.
  subjectChoices?: string[];
  /** On the Science Home the form sits under the page's own header (Adrian, 24 Sep 2026: "just allow the upload at this page"): no heading, no notices, and the done / queue-full states are one card in the form's place. */
  embedded?: boolean;
  // 🧪 'science' = the Science tab's form (SPEC-SCIENCE-MARKING.md, 10 Sep 2026):
  // the subject is REQUIRED (physics / chemistry / biology, chosen by the
  // student), the disclaimer sits above the photos, an optional mark scheme
  // can ride along, and the POST carries family:'science'. 'math' = unchanged.
  family?: 'math' | 'science';
}) {
  const isScience = family === 'science';
  const inputRef = useRef<HTMLInputElement>(null);
  const schemeRef = useRef<HTMLInputElement>(null);
  const [pages, setPages] = useState<Page[]>([]);
  const [paperName, setPaperName] = useState(assignment?.title ?? paper?.title ?? '');
  // Science starts EMPTY so the student chooses; a wrong default brain is worse
  // than one extra tap — unless the student takes exactly one science (24 Sep 2026).
  const [subject, setSubject] = useState(isScience ? (subjectChoices.length === 1 ? subjectChoices[0] : '') : (subjectChoices[0] ?? 'math'));
  const [schemeFiles, setSchemeFiles] = useState<File[]>([]);
  const schemeUploadedRef = useRef<Map<number, string>>(new Map());
  const [splitNote, setSplitNote] = useState('');
  const [capNote, setCapNote] = useState('');       // pages dropped at MAX_PAGES — must be visible, never silent
  const [stage, setStage] = useState('');            // progress line while submitting
  const [converting, setConverting] = useState('');  // progress line while a PDF rasterises
  const [error, setError] = useState('');
  // What the pre-flight found wrong with the hand-in. Shown once; sending again
  // goes through regardless (see the route — this is advice, never a gate).
  const [findings, setFindings] = useState<{ kind: string; message: string; blocking?: boolean; missing?: unknown }[]>([]);
  // What the check asked about the first time (SPEC-HANDIN-COMPLETENESS ④) — echoed
  // back on the final send so the run records it (lib/handin-check).
  const [askedCheck, setAskedCheck] = useState<{ asked: unknown; list?: unknown; key?: unknown } | null>(null);
  const missingAsk = findings.find(f => f.kind === 'missing-questions') || null;
  const [doneRunId, setDoneRunId] = useState<string | null>(null);
  const [queuedFor, setQueuedFor] = useState<string | null>(null);
  // 🔁 the same paper sent twice (5 Oct 2026): the server kept the first and says so
  const [dupNote, setDupNote] = useState<string | null>(null);
  // Pages that already reached Blob, kept across a failed attempt so tapping Send
  // again RESUMES instead of starting from page 1 (1 Sep 2026 — see uploadPage).
  const uploadedRef = useRef<Map<number, string>>(new Map());
  const busy = stage !== '' || converting !== '';

  // 🕳 DO WE EVEN HAVE THIS PAPER? (Adrian, 10 Sep 2026: "students should drop
  // their question paper if required, app should hint if we do not have the
  // question paper in the database".) Isabelle's AM TYS 2025 P2 was marked with
  // nothing to check it against because the 2025 papers had not been filed, and
  // she was never asked for the printed pages she was holding. Now the app asks
  // — while she is still typing the name and the paper is still on her desk.
  //
  // Advice only: it never blocks Send, never adds a step for a student whose
  // photos already include the printed pages, and every failure (timeout, bot
  // down, an older bot that 400s the phase) answers "available" and shows
  // nothing. A locked name (a worksheet or a printed paper) already carries its
  // questions, and a science paper takes its own mark scheme, so neither asks.
  const nameLocked = !!assignment || !!paper;
  const [paperCheck, setPaperCheck] = useState<PaperCheck | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const checkSeq = useRef(0);
  const runPaperCheck = useCallback(async (name: string) => {
    if (!looksLikeNamedPaper(name)) { setPaperCheck(null); return; }
    const seq = ++checkSeq.current;   // only the newest answer may paint
    try {
      const r = await fetch('/api/portal/paper-check', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paperName: name }),
      });
      const d = await r.json().catch(() => null);
      if (seq === checkSeq.current) setPaperCheck(shapePaperCheck(d));
    } catch {
      if (seq === checkSeq.current) setPaperCheck(null);   // silence, never a false ask
    }
  }, []);
  useEffect(() => {
    if (nameLocked || isScience) return;
    const name = paperName.trim();
    if (!looksLikeNamedPaper(name)) { setPaperCheck(null); return; }
    const t = setTimeout(() => { void runPaperCheck(name); }, 600);
    return () => clearTimeout(t);
  }, [paperName, nameLocked, isScience, runPaperCheck]);
  const paperMissing = !nameLocked && !isScience && !!paperCheck && paperCheck.named && !paperCheck.available;

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
        } catch {
          setError(`Couldn't read ${f.name} — photograph the pages instead.`);
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
    // More pages after the check asked → the next send checks again (the ➕ Add the pages path).
    if (added.length) setFindings([]);
    setPages(prev => {
      const merged = [...prev, ...added];
      const dropped = merged.length - MAX_PAGES;
      if (dropped > 0) {
        // Idempotent side effects (safe under StrictMode double-invoke): revoking
        // an already-revoked URL is a no-op, and the note text is deterministic.
        merged.slice(MAX_PAGES).forEach(p => { if (p.preview) URL.revokeObjectURL(p.preview); });
        setCapNote(`⚠️ ${MAX_PAGES} pages at most — the last ${dropped === 1 ? 'page' : `${dropped} pages`} didn't fit. Send ${dropped === 1 ? 'it' : 'them'} as a second paper.`);
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

  async function submit(confirmed = false, answer: 'not-done' | 'sent-anyway' | null = null) {
    if (!pages.length || busy) return;
    if (!paperName.trim()) { setError('Tell us which paper this is before sending.'); return; }
    if (isScience && !subject) { setError('Pick the subject — physics, chemistry or biology — before sending.'); return; }
    setError('');
    try {
      const urls: string[] = [];
      for (let i = 0; i < pages.length; i++) {
        const cached = uploadedRef.current.get(i);
        if (cached) { urls.push(cached); continue; }   // already up — don't re-send it
        setStage(pages.length > 1 ? `Uploading page ${i + 1} of ${pages.length}…` : 'Uploading…');
        let url: string;
        try {
          url = await uploadPage(pages[i].file, (note) =>
            setStage(`Uploading page ${i + 1} of ${pages.length} — ${note}`));
        } catch (e) {
          // Safari's own words for a dropped connection are "Load failed" — which is
          // what Sophie saw with no page number and no idea whether anything had
          // arrived (5 Sep 2026). Say which page, what is kept, and what to do.
          reportSubmitFailure({ stage: 'upload', reason: (e as Error & { reason?: string })?.reason || 'upload failed', pages: pages.length, uploaded: i, paperName: paperName.trim() || null });
          throw new Error(uploadFailureMessage(i, pages.length));
        }
        uploadedRef.current.set(i, url);
        urls.push(url);
      }
      // The answers or mark scheme, if attached (both families since 24 Sep
      // 2026) — same retry, same resume-from-cache as the pages; a PDF goes up
      // as-is, a photo is resized.
      const schemeUrls: string[] = [];
      for (let i = 0; i < schemeFiles.length; i++) {
        const cached = schemeUploadedRef.current.get(i);
        if (cached) { schemeUrls.push(cached); continue; }
        setStage(`Uploading mark scheme ${i + 1} of ${schemeFiles.length}…`);
        const f = schemeFiles[i];
        const isPdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
        const upload = isPdf ? f : await resizeToJpeg(f);
        let url: string | null = null;
        for (let attempt = 1; attempt <= 3 && !url; attempt++) {
          try {
            const up = await uploadStudentFile(
              `/api/portal/submit-token?kind=scheme&filename=${encodeURIComponent(upload.name || (isPdf ? 'scheme.pdf' : 'scheme.jpg'))}`,
              upload,
              { contentType: upload.type || (isPdf ? 'application/pdf' : 'application/octet-stream') },
            );
            url = up.url;
          } catch {
            if (attempt < 3) await new Promise(r => setTimeout(r, attempt * 1000));
          }
        }
        if (!url) throw new Error(`The mark scheme (file ${i + 1}) would not upload after three tries — your pages are kept. Remove it or tap Send again.`);
        schemeUploadedRef.current.set(i, url);
        schemeUrls.push(url);
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
      setStage('Sending for marking…');
      const body = JSON.stringify({
        photoUrls: urls,
        paperName: paperName.trim(),
        ...(isScience ? { family: 'science', subject } : subjectChoices.length > 1 ? { subject } : {}),
        // The answers or scheme the student attached, either family — grounds
        // THIS paper only (the route stamps attached_by:'student').
        ...(schemeUrls.length ? { schemeUrls } : {}),
        ...(confirmed ? { confirmed: true, handinAnswer: answer ?? 'sent-anyway' } : {}),
        ...(askedCheck ? { handinCheck: askedCheck } : {}),
        ...(assignment ? { assignmentId: assignment.id } : {}),
        ...(paper ? { paperId: paper.id } : {}),
      });
      let r: Response | null = null, d: { error?: string; runId?: string; queuedFor?: string; duplicateOf?: string; message?: string; findings?: { kind: string; message: string; blocking?: boolean; missing?: unknown }[]; list?: unknown; key?: unknown } = {};
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          if (attempt > 1) setStage(`Sending for marking… (try ${attempt} of 3)`);
          r = await fetch('/api/portal/submit', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
          });
          d = await r.json().catch(() => ({}));
          break;                       // a reply of ANY status is an answer — stop
        } catch {
          // No reply at all: the connection dropped.
          if (attempt < 3) await new Promise(res => setTimeout(res, attempt * 1000));
        }
      }
      if (!r) reportSubmitFailure({ stage: 'send', reason: 'no reply after 3 tries (connection dropped)', pages: pages.length, uploaded: urls.length, paperName: paperName.trim() || null });
      if (!r) throw new Error(`Your ${pages.length} page${pages.length === 1 ? '' : 's'} uploaded safely, but the last step could not reach us. Tap Send again — it will not upload them a second time.`);
      // 409 with findings: the hand-in looks wrong. Show it and let them decide —
      // their pages stay uploaded, so sending again costs nothing.
      if (r.status === 409 && Array.isArray(d.findings)) {
        setFindings(d.findings);
        const mq = d.findings.find(f => f.kind === 'missing-questions');
        if (mq && !askedCheck) setAskedCheck({ asked: mq.missing, list: d.list, key: d.key });
        setStage('');
        return;
      }
      if (!r.ok) {
        reportSubmitFailure({ stage: 'rejected', reason: `HTTP ${r.status}${d.error ? `: ${String(d.error).slice(0, 120)}` : ''}`, pages: pages.length, uploaded: urls.length, paperName: paperName.trim() || null, attempts: 1 });
        throw new Error(friendlyPortalMessage(r.status, d.error, 'The submission failed — try again.'));
      }
      setQueuedFor(d.queuedFor ?? null);
      setDupNote(d.duplicateOf && d.message ? d.message : null);
      setDoneRunId(d.runId || 'ok');
      pages.forEach(p => { if (p.preview) URL.revokeObjectURL(p.preview); });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setStage('');
    }
  }

  // ✅ Sent / 🕒 queued / 🔁 already handed in — one short card, both families
  // (the shorter hand-in page, 5 Oct 2026: "build the shorter hand in page").
  if (doneRunId) {
    const papersHref = isScience ? '/app/science/papers' : '/app/marking';
    const again = isScience ? '/app/science/submit' : '/app/submit';
    const title = dupNote ? 'Already handed in'
      : queuedFor ? 'Queued'
      : assignment ? `“${assignment.title}” sent`
      : 'Sent';
    const card = (
      <div className={`${CARD} p-5 text-center`}>
        <p className="text-4xl">{dupNote ? '🔁' : queuedFor ? '🕒' : '✅'}</p>
        <p className="font-bold text-navy mt-2">{title}</p>
        <p className="text-sm text-gray-600 mt-1 whitespace-pre-line">
          {dupNote ? dupNote
            : queuedFor ? <>Marking starts {startsPhrase(queuedFor, sgtTodayISO())}. Remove it in <b>Papers</b> until then.</>
            : <>It comes back marked in <b>Papers</b>.</>}
        </p>
        <div className="mt-4 flex justify-center gap-2">
          {assignment ? (
            <Link href="/app/assignments" className="text-sm font-semibold bg-navy text-[hsl(45,100%,96%)] rounded-xl px-4 py-2.5">Back to your work</Link>
          ) : (
            <>
              {/* A plain link, not <Link>: a full load resets the form. */}
              <a href={again} className="text-sm font-semibold bg-navy text-[hsl(45,100%,96%)] rounded-xl px-4 py-2.5">Hand in another</a>
              <Link href={papersHref} className="text-sm font-semibold text-navy rounded-xl px-4 py-2.5 border border-gray-200 bg-white">Papers</Link>
            </>
          )}
        </div>
      </div>
    );
    if (embedded) return card;
    return (
      <div className="space-y-4 pb-24 sm:pb-4">
        <h1 className="text-xl font-bold text-navy pt-1">{isScience ? 'Hand in a science paper' : 'Submit a paper'}</h1>
        {card}
      </div>
    );
  }

  // Slot already spent today (and this isn't a cap-exempt assignment or
  // printed paper — only an exam paper spends the day, 7 Sep 2026): say so up
  // front, before any photographing happens. The POST-time 429 stays as the
  // backstop for a slot spent from the Telegram side mid-visit.
  if (queueNotice?.blocking && isScience) {
    const card = (
      <div className={`${CARD} p-5 text-center`}>
        <p className="text-4xl">🎟️</p>
        <p className="font-bold text-navy mt-2">No room for another science paper yet</p>
        <p className="text-sm text-gray-600 mt-1.5">{queueNotice.text}</p>
      </div>
    );
    if (embedded) return card;
    return (
      <div className="space-y-4 pb-24 sm:pb-4">
        <h1 className="text-xl font-bold text-navy pt-1">Hand in a science paper</h1>
        {card}
      </div>
    );
  }

  if (slotUsed && !assignment && !paper) {
    return (
      <div className="space-y-4 pb-24 sm:pb-4">
        <h1 className="text-xl font-bold text-navy pt-1">Submit a paper</h1>
        <div className={`${CARD} p-5 text-center`}>
          <p className="text-4xl">🎟️</p>
          <p className="font-bold text-navy mt-2">{isScience ? 'Today’s science hand-ins are used' : 'Today’s hand-ins are used'}</p>
          <p className="text-sm text-gray-600 mt-1.5">
            {isScience
              ? 'Two science papers a day — a fresh pair opens at midnight. Your maths papers are separate and can still go in.'
              : 'Your pass’s hand-ins for today are used. A fresh slot opens at midnight, or when your pass is topped up — line the next paper up. Practice Again sheets and printed papers don’t count, so those can still go in today.'}
          </p>
          <div className="mt-4 flex justify-center">
            <Link href={isScience ? '/app/science/papers' : '/app/marking'} className="text-sm font-semibold bg-navy text-[hsl(45,100%,96%)] rounded-xl px-4 py-2.5">
              Go to Papers
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // The shorter hand-in page (Adrian, 5 Oct 2026: "can you show me the page
  // where students submit their pdfs? i thought it was very wordy/verbose" →
  // "build the shorter hand in page"): three numbered steps, one line each.
  // The photo / PDF / iPad tips sit behind the "?" beside step 1; the ink line
  // stays visible under it (his 10 Sep 2026 rule — said BEFORE the photos go
  // up); the scheme's note shows only once something is attached.
  const nameDone = nameLocked || !!paperName.trim();
  const subjectDone = !isScience || !!subject;
  return (
    <div className="space-y-4 pb-24 sm:pb-4">
      {assignment ? (
        <div className="pt-1">
          <Link href={`/app/assignments/${assignment.id}`} className="text-sm text-gray-500 hover:text-navy">← Back to the worksheet</Link>
          <h1 className="text-xl font-bold text-navy mt-1">Submit: {assignment.title}</h1>
        </div>
      ) : paper ? (
        <div className="pt-1">
          <Link href="/app/print" className="text-sm text-gray-500 hover:text-navy">← Back to your papers</Link>
          <h1 className="text-xl font-bold text-navy mt-1">Hand in: {paper.title}</h1>
        </div>
      ) : isScience && embedded ? null : (
        <h1 className="text-xl font-bold text-navy pt-1">{isScience ? 'Hand in a science paper' : 'Submit a paper'}</h1>
      )}

      {isScience && queueNotice && !queueNotice.blocking && (
        <div className="rounded-2xl border border-teal-200 bg-teal-50 px-4 py-3 text-[13px] text-teal-900" role="status">
          🕒 {queueNotice.text}
        </div>
      )}

      <div className={`${CARD} p-4 space-y-4`}>
        {/* ── 1 Photograph your pages ─────────────────────────────── */}
        <div className="space-y-2.5">
          <div className="flex items-center gap-2">
            <StepDot n={1} done={pages.length > 0} />
            <p className="text-sm font-semibold text-navy flex-1">{assignment ? 'Photograph your worksheet' : 'Photograph your pages'}</p>
            <button
              type="button" onClick={() => setHelpOpen(v => !v)} aria-expanded={helpOpen} aria-label="Tips for the photos"
              className={`w-6 h-6 rounded-full border text-[12px] font-bold leading-none flex-none ${helpOpen ? 'bg-navy text-[hsl(45,100%,96%)] border-navy' : 'bg-white text-gray-500 border-gray-300'}`}
            >?</button>
          </div>
          {helpOpen && (
            <ul className="text-[12px] text-gray-600 space-y-1 bg-[hsl(45,100%,98%)] rounded-xl px-3 py-2.5 pl-7 list-disc">
              <li>One page per photo, straight on, good light. A wide photo of an open booklet is split for you.</li>
              {/* Free-form hand-ins only — the marker anchors on the student's own
                  question labels, and printed question pages are skipped harmlessly
                  (Adrian, 2026-08-28, Alessi's plain-paper TYS hand-in). */}
              {!nameLocked && !isScience && <li>Worked on your own paper? Add the question pages too, and write each question number.</li>}
              <li>A PDF works too. Wrote on it with a Pencil in Preview on an iPad? Save to Files, then choose it here — your ink comes with it.</li>
              {!nameLocked && !isScience && <li>Exam papers, Practice Again sheets and printed papers all go in here.</li>}
            </ul>
          )}
          {/* Green ink is the correction pen (Adrian, 10 Sep 2026) — always visible, one line. */}
          {!isScience && <p className="text-[12px] text-gray-500">Blue or black ink. Green, red or purple counts as a correction.</p>}

          {/* We don't hold this paper (Adrian, 10 Sep 2026: "just say no questions
              detected — better if students upload the question paper"). Advice only. */}
          {paperMissing && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[13px] text-amber-900">
              <b>No questions detected.</b> Add photos of the question paper too.
            </p>
          )}

          <button
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className={`w-full rounded-2xl border-2 border-dashed border-gray-300 bg-[hsl(45,100%,98%)] ${pages.length ? 'py-4' : 'py-7'} text-center active:bg-amber-50`}
          >
            {!pages.length && !converting && <span className="block text-3xl mb-1">📷</span>}
            <span className="text-sm font-semibold text-navy">
              {converting
                ? converting
                : pages.length ? `${pages.length} page${pages.length > 1 ? 's' : ''} · add more` : 'Take photos or choose a PDF'}
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
        </div>

        {/* ── 2 Name the paper ────────────────────────────────────── */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <StepDot n={2} done={nameDone && subjectDone} />
            {nameLocked
              ? <p className="text-sm text-gray-600 flex-1">Filed as <b className="text-navy">{assignment?.title ?? paper?.title}</b></p>
              : <label htmlFor="paper-name" className="text-sm font-semibold text-navy flex-1">Name the paper</label>}
          </div>
          {!nameLocked && (
            <>
              {/* A name shaped like the placeholder lets the marker ground the run
                  to the official total (e.g. /90) — Adrian, 2026-08-29. */}
              <input
                id="paper-name" type="text" value={paperName} maxLength={80} required
                onChange={(e) => setPaperName(e.target.value)}
                // Leaving the field is the moment the name is finished — ask then
                // rather than waiting out the debounce (lib/paper-check).
                onBlur={(e) => { void runPaperCheck(e.target.value.trim()); }}
                placeholder={isScience ? 'School, year, paper — e.g. Cedar 2025 Chem P2' : 'School, year, paper — e.g. Xinmin 2021 AM P2'}
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy/20"
              />
              {subjectChoices.length > 1 && (
                <div role="radiogroup" aria-label="Subject" className="flex flex-wrap gap-2">
                  {subjectChoices.map((sub) => (
                    <button
                      key={sub} type="button" role="radio" aria-checked={subject === sub}
                      onClick={() => setSubject(sub)} disabled={busy}
                      className={`flex-1 min-w-[6rem] text-sm font-semibold rounded-xl py-2 border ${subject === sub ? 'bg-navy text-[hsl(45,100%,96%)] border-navy' : 'bg-white text-navy border-gray-200'}`}
                    >{subjectLabel(sub)}</button>
                  ))}
                </div>
              )}
              {/* The answers or mark scheme, optional, on BOTH forms (Adrian, 24 Sep
                  2026). It grounds THIS paper's marking only — the route stamps
                  attached_by:'student', never filed as the paper's shared scheme. */}
              {schemeFiles.length ? (
                <div className="rounded-xl border border-gray-200 px-3 py-2.5 text-[13px] text-gray-700 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <button type="button" onClick={() => schemeRef.current?.click()} disabled={busy} className="text-left">
                      📎 Mark scheme · {schemeFiles.length} file{schemeFiles.length === 1 ? '' : 's'} <span className="text-gray-400">· add more</span>
                    </button>
                    {!busy && (
                      <button type="button" onClick={() => { setSchemeFiles([]); schemeUploadedRef.current.clear(); }} className="text-[12px] text-gray-500 underline underline-offset-2">
                        Remove
                      </button>
                    )}
                  </div>
                  {/* Adrian's line (24 Sep 2026: "we should state that"), shortened. */}
                  <p className="text-[11px] text-gray-500">Marking follows your school&apos;s points. Attach only answers you were given for your own study.</p>
                </div>
              ) : (
                <button
                  type="button" onClick={() => schemeRef.current?.click()} disabled={busy}
                  className="text-[13px] font-semibold text-navy underline underline-offset-2 text-left"
                >
                  + Add the answers or mark scheme <span className="font-normal text-gray-400">(optional)</span>
                </button>
              )}
              <input
                ref={schemeRef} type="file" accept="image/*,application/pdf" multiple className="hidden"
                onChange={(e) => {
                  const list = Array.from(e.target.files ?? []).filter(f => f.type === 'application/pdf' || f.type.startsWith('image/') || /\.(pdf|jpe?g|png|webp|heic|heif)$/i.test(f.name));
                  schemeUploadedRef.current.clear();
                  setSchemeFiles(prev => [...prev, ...list].slice(0, 12));
                  if (schemeRef.current) schemeRef.current.value = '';
                }}
              />
            </>
          )}
        </div>

        {error && <p className="text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">{error}</p>}

        {/* What the pre-flight found. Amber, not red: the pages are uploaded and
            the hand-in goes through either way — it asks the one question only
            the student can answer while the paper is still in front of them. */}
        {findings.length > 0 && (
          <div className="text-sm bg-amber-50 border border-amber-200 rounded-xl px-3 py-3 space-y-2.5">
            {findings.map((f, i) => (
              <p key={i} className={`leading-snug whitespace-pre-line text-amber-900 ${f.kind === 'missing-questions' ? 'font-bold' : ''}`}>{f.message}</p>
            ))}
            {findings.some(f => f.kind === 'duplicate') && (
              <Link href={isScience ? '/app/science/papers' : '/app/marking'}
                className="block text-center text-sm font-semibold text-navy bg-white border border-amber-300 rounded-xl py-2.5">
                It&apos;s the same paper — don&apos;t send it
              </Link>
            )}
            {missingAsk && (
              <div className="flex gap-2">
                <button type="button" onClick={() => inputRef.current?.click()} disabled={busy}
                  className="flex-1 text-sm font-bold bg-navy text-[hsl(45,100%,96%)] rounded-xl py-2.5 disabled:opacity-40">Add pages</button>
                <button type="button" onClick={() => submit(true, 'not-done')} disabled={busy}
                  className="flex-1 text-sm font-semibold text-navy bg-white border border-amber-300 rounded-xl py-2.5 disabled:opacity-40">Didn&apos;t do them — send</button>
              </div>
            )}
          </div>
        )}

        {/* ── 3 Send ──────────────────────────────────────────────── */}
        {missingAsk ? (
          busy && <p className="text-center text-sm text-gray-500">{stage}</p>
        ) : (
          <div className="flex items-center gap-2">
            <StepDot n={3} done={false} />
            <button
              onClick={() => submit(findings.length > 0, findings.length > 0 ? 'sent-anyway' : null)}
              disabled={!pages.length || !paperName.trim() || busy || !subjectDone}
              className="flex-1 text-sm font-bold bg-navy text-[hsl(45,100%,96%)] rounded-xl py-3 disabled:opacity-40"
            >
              {busy ? stage
                : findings.length > 0 ? 'Send anyway'
                : pages.length ? `Send ${pages.length} page${pages.length === 1 ? '' : 's'}` : 'Send'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** The numbered dot before each step; a green tick once the step is done. */
function StepDot({ n, done }: { n: number; done: boolean }) {
  return (
    <span
      aria-hidden
      className={`w-[22px] h-[22px] rounded-full text-[12px] font-bold leading-[22px] text-center flex-none ${done ? 'bg-emerald-600 text-white' : 'bg-navy text-[hsl(45,100%,96%)]'}`}
    >{done ? '✓' : n}</span>
  );
}
