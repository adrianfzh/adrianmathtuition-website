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
  PAPER_MISSING_TITLE, PAPER_MISSING_WHY, looksLikeNamedPaper, paperMissingNotice, shapePaperCheck,
  type PaperCheck,
} from '@/lib/paper-check';
import { uploadStudentFile } from '@/lib/student-files-client';
import { pdfToPageImages } from '@/lib/pdf-pages';
import { friendlyPortalMessage } from '@/lib/portal-fetch';
import { splitFileIfSpread, resizeToJpeg } from '@/lib/spread-split';
import { SUBMIT_FAILED_KIND, type SubmitFailure } from '@/lib/submit-failure';

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
/** The message for a page that would not upload after every retry. Pure — tested. */
export function uploadFailureMessage(index: number, total: number): string {
  const kept = index;
  const keptNote = kept === 0
    ? 'Nothing has been sent yet.'
    : `The ${kept} page${kept === 1 ? '' : 's'} before it ${kept === 1 ? 'is' : 'are'} already with us and will not be sent twice.`;
  return `Page ${index + 1} of ${total} did not upload after three tries — usually a weak signal. ${keptNote} Check your connection and tap Send again.`;
}

async function uploadPage(file: File, onNote: (s: string) => void): Promise<string> {
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

export default function SubmitClient({ assignment = null, paper = null, slotUsed = false, subjectChoices = [], family = 'math' }: {
  assignment?: { id: string; title: string } | null;
  paper?: { id: string; title: string } | null;
  slotUsed?: boolean;
  // The subjects this student may mark a hand-in as. Empty (the default for
  // every student until the flag flips) means no picker and an implicit math
  // hand-in — nothing on screen changes. First entry is the default.
  subjectChoices?: string[];
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
  // than one extra tap.
  const [subject, setSubject] = useState(isScience ? '' : (subjectChoices[0] ?? 'math'));
  const [schemeFiles, setSchemeFiles] = useState<File[]>([]);
  const schemeUploadedRef = useRef<Map<number, string>>(new Map());
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
  const [whyOpen, setWhyOpen] = useState(false);
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
      // The school's mark scheme, if attached (science only) — same retry, same
      // resume-from-cache as the pages; a PDF goes up as-is, a photo is resized.
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
      setStage('Sending to Adrian…');
      const body = JSON.stringify({
        photoUrls: urls,
        paperName: paperName.trim(),
        ...(isScience ? { family: 'science', subject, schemeUrls } : subjectChoices.length > 1 ? { subject } : {}),
        ...(confirmed ? { confirmed: true } : {}),
        ...(assignment ? { assignmentId: assignment.id } : {}),
        ...(paper ? { paperId: paper.id } : {}),
      });
      let r: Response | null = null, d: { error?: string; runId?: string; findings?: { kind: string; message: string; blocking?: boolean }[] } = {};
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          if (attempt > 1) setStage(`Sending to Adrian… (try ${attempt} of 3)`);
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
        setStage('');
        return;
      }
      if (!r.ok) {
        reportSubmitFailure({ stage: 'rejected', reason: `HTTP ${r.status}${d.error ? `: ${String(d.error).slice(0, 120)}` : ''}`, pages: pages.length, uploaded: urls.length, paperName: paperName.trim() || null, attempts: 1 });
        throw new Error(friendlyPortalMessage(r.status, d.error, 'The submission failed — try again.'));
      }
      setDoneRunId(d.runId || 'ok');
      pages.forEach(p => { if (p.preview) URL.revokeObjectURL(p.preview); });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setStage('');
    }
  }

  if (doneRunId && isScience) {
    return (
      <div className="space-y-4 pb-24 sm:pb-4">
        <h1 className="text-xl font-bold text-navy pt-1">Science paper sent</h1>
        <div className={`${CARD} p-5 text-center`}>
          <p className="text-4xl">🧪</p>
          <p className="font-bold text-navy mt-2">Sent for marking</p>
          <p className="text-sm text-gray-600 mt-1.5">
            It comes back under <b>Science › Papers</b>, usually within the hour. The marks are an
            estimate — when your teacher marks the same paper, come back and enter their total so we can compare.
          </p>
          <div className="mt-4 flex justify-center">
            <Link href="/app/science" className="text-sm font-semibold bg-navy text-[hsl(45,100%,96%)] rounded-xl px-4 py-2.5">
              Back to Science
            </Link>
          </div>
          <p className="text-[13px] text-gray-500 mt-3">🎟️ That was today&apos;s science hand-in — a fresh one opens at midnight. Your maths hand-in is separate.</p>
        </div>
      </div>
    );
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
          {!assignment && !paper && (
            <p className="text-[13px] text-gray-500 mt-3">
              🎟️ That was today&apos;s exam-paper hand-in — a fresh one opens at midnight. Practice Again sheets and printed papers can still go in.
            </p>
          )}
        </div>
      </div>
    );
  }

  // Slot already spent today (and this isn't a cap-exempt assignment or
  // printed paper — only an exam paper spends the day, 7 Sep 2026): say so up
  // front, before any photographing happens. The POST-time 429 stays as the
  // backstop for a slot spent from the Telegram side mid-visit.
  if (slotUsed && isScience) {
    return (
      <div className="space-y-4 pb-24 sm:pb-4">
        <h1 className="text-xl font-bold text-navy pt-1">Hand in a science paper</h1>
        <div className={`${CARD} p-5 text-center`}>
          <p className="text-4xl">🎟️</p>
          <p className="font-bold text-navy mt-2">Today&apos;s science hand-in is used</p>
          <p className="text-sm text-gray-600 mt-1.5">
            One science paper a day. A fresh slot opens at midnight — line the next one up for tomorrow.
            Your maths hand-in is separate and may still be open.
          </p>
          <div className="mt-4 flex justify-center">
            <Link href="/app/science" className="text-sm font-semibold bg-navy text-[hsl(45,100%,96%)] rounded-xl px-4 py-2.5">
              Back to Science
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (slotUsed && !assignment && !paper) {
    return (
      <div className="space-y-4 pb-24 sm:pb-4">
        <h1 className="text-xl font-bold text-navy pt-1">Submit a paper</h1>
        <div className={`${CARD} p-5 text-center`}>
          <p className="text-4xl">🎟️</p>
          <p className="font-bold text-navy mt-2">Today&apos;s exam-paper hand-in is used</p>
          <p className="text-sm text-gray-600 mt-1.5">
            One exam paper a day gets every script marked properly. A fresh slot opens at midnight —
            line the next paper up for tomorrow. Practice Again sheets and printed papers don&apos;t count,
            so those can still go in today.
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
      ) : isScience ? (
        <div className="pt-1">
          <Link href="/app/science" className="text-sm text-gray-500 hover:text-navy">← Science</Link>
          <h1 className="text-xl font-bold text-navy mt-1">🧪 Hand in a science paper</h1>
          <p className="text-[13px] text-gray-500 mt-0.5">🎟️ One science paper a day, free — separate from your maths hand-in.</p>
        </div>
      ) : (
        <div className="pt-1">
          <h1 className="text-xl font-bold text-navy">Submit a paper</h1>
          <p className="text-[13px] text-gray-500 mt-0.5">🎟️ Today&apos;s exam-paper hand-in is open — one a day; practice sheets and printed papers don&apos;t count.</p>
        </div>
      )}

      {/* The disclaimer (Adrian, 10 Sep 2026: "give a disclaimer") — said BEFORE
          the photos, in plain words: new, free, an estimate; explain answers
          are marked against standard points unless the school's scheme comes
          too; check it against the teacher's marking. */}
      {isScience && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900 space-y-1">
          <p className="font-bold">Science marking is new, and free while it is.</p>
          <p>
            The marks are an <b>estimate</b>. Calculations are checked properly; <b>explain</b>{' '}answers are marked
            against standard syllabus points unless you attach your school&apos;s mark scheme below.
          </p>
          <p>When your teacher returns the paper, compare — and enter their total on the marked paper&apos;s page so we can check ourselves.</p>
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

        {/* We don't hold this paper. Sits directly above the add-photos button —
            the notice asks for two more photographs and the button that takes
            them is the next thing under it. Amber, like the pre-flight findings:
            nothing is wrong, the hand-in goes through either way. */}
        {paperMissing && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-[13px] text-amber-900 space-y-1.5">
            <p className="font-bold">📄 {PAPER_MISSING_TITLE}</p>
            <p className="leading-snug">{paperMissingNotice(paperCheck?.label ?? null)}</p>
            <button
              type="button" onClick={() => setWhyOpen(v => !v)}
              aria-expanded={whyOpen}
              className="text-[12px] font-semibold text-amber-800 underline underline-offset-2"
            >
              {whyOpen ? 'Hide' : 'Why?'}
            </button>
            {whyOpen && <p className="text-[12px] leading-snug text-amber-800">{PAPER_MISSING_WHY}</p>}
          </div>
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
        {/* Green ink is the correction pen (Adrian, 10 Sep 2026: "tell them when they
            are submitting papers in the app that working in green pen will not count
            towards the marks — they will be treated as corrections"). Said BEFORE the
            photos go up, in one line, so a corrected paper is never a surprise. */}
        <p className="text-[12px] text-gray-500">
          Write your attempt in blue or black. Green, red or purple ink is read as a later correction and earns no marks.
        </p>

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
            // Leaving the field is the moment the name is finished — ask then
            // rather than waiting out the debounce (lib/paper-check).
            onBlur={(e) => { void runPaperCheck(e.target.value.trim()); }}
            placeholder="e.g. Xinmin 2021 AM Prelim P2"
            className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy/20"
          />
          {/* A name shaped like the placeholder is what lets ai/paper-totals.js
              ground the run to the official total (e.g. /90) — vague names fall
              back to a counted denominator (Adrian, 2026-08-29). */}
          <p className="text-[11px] text-gray-400 mt-1">School, year and paper — so Adrian knows what he&apos;s marking, and your score comes back out of the official total (e.g. /90).</p>
        {subjectChoices.length > 1 && (
          <div className="mt-3">
            <label htmlFor="paper-subject" className="block text-sm font-semibold text-navy mb-1">Subject</label>
            <select
              id="paper-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full text-sm border border-gray-300 rounded-xl px-3 py-2 bg-white"
            >
              {isScience && <option value="">Choose the subject…</option>}
              {subjectChoices.map((sub) => (
                <option key={sub} value={sub}>{subjectLabel(sub)}</option>
              ))}
            </select>
            <p className="text-[11px] text-gray-400 mt-1">
              {isScience ? 'Physics, chemistry or biology — each is marked by its own rules.' : 'Pick the subject of this paper so it is marked the right way.'}
            </p>
          </div>
        )}
        {/* The school's mark scheme, optional (science only): a PDF or photos. The
            marker grounds on it and keeps it for every later hand-in of the same
            paper — the difference between "the standard points" and "your
            school's points" on every explain answer. */}
        {isScience && (
          <div className="mt-3">
            <p className="block text-sm font-semibold text-navy mb-1">Mark scheme <span className="font-normal text-gray-400">(optional)</span></p>
            <button
              type="button" onClick={() => schemeRef.current?.click()} disabled={busy}
              className="w-full rounded-xl border border-dashed border-gray-300 bg-white py-3 text-[13px] text-gray-600 active:bg-amber-50"
            >
              {schemeFiles.length
                ? `📎 ${schemeFiles.length} file${schemeFiles.length === 1 ? '' : 's'} attached — tap to add more`
                : '📎 Attach your school’s mark scheme — a PDF or photos'}
            </button>
            <input
              ref={schemeRef} type="file" accept="image/*,application/pdf" multiple className="hidden"
              onChange={(e) => {
                const list = Array.from(e.target.files ?? []).filter(f => f.type === 'application/pdf' || f.type.startsWith('image/') || /\.(pdf|jpe?g|png|webp|heic|heif)$/i.test(f.name));
                schemeUploadedRef.current.clear();
                setSchemeFiles(prev => [...prev, ...list].slice(0, 12));
                if (schemeRef.current) schemeRef.current.value = '';
              }}
            />
            {schemeFiles.length > 0 && !busy && (
              <button type="button" onClick={() => { setSchemeFiles([]); schemeUploadedRef.current.clear(); }} className="mt-1 text-[11px] text-gray-500 underline underline-offset-2">
                Remove the mark scheme
              </button>
            )}
            <p className="text-[11px] text-gray-400 mt-1">With the scheme, explain answers are marked against your school&apos;s points, not the standard ones.</p>
          </div>
        )}
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
          disabled={!pages.length || !paperName.trim() || busy || (isScience && !subject)}
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
