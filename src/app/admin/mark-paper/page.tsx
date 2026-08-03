'use client';

import { useState, useRef, useEffect, type CSSProperties } from 'react';
import dynamic from 'next/dynamic';
import { put } from '@vercel/blob/client';
import 'katex/dist/katex.min.css';
import { ensureAdminSession } from '@/lib/admin-client';
import { pickAnnotatedPhotoUrl } from '@/lib/annotated-photo-source';
import { mathHtml } from '@/lib/math-inline';

// The ✏️ Annotate overlay (Apple Pencil ink over the marked pages) is heavy and
// only opens on demand — load it when first rendered, never in the initial bundle.
const AnnotateOverlay = dynamic(() => import('@/components/AnnotateOverlay'), { ssr: false });

// ── file helpers ────────────────────────────────────────────────────────────
function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
async function pdfToBase64(file: File): Promise<string> {
  return (await readDataUrl(file)).split(',')[1] || '';
}

// A scanned PDF of the student's working is rasterised to one JPEG per page IN THE
// BROWSER, then fed into the normal photo path — so marking, the Gemini bounding
// boxes and the red-pen overlay all see a plain image and need no changes. Doing it
// here (not server-side) also keeps a fat scan off the 4.5MB request-body ceiling.
// The worker is served from /public rather than bundled: its version must match the
// installed pdfjs-dist exactly or pdf.js throws, and pdf-worker-asset.test.ts pins that.
async function loadPdfjs() {
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const pdfjs = (await import('pdfjs-dist/build/pdf.mjs' as string)) as any;
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  return pdfjs;
}

async function pdfToPageImages(file: File, onPage: (done: number, total: number) => void): Promise<File[]> {
  const pdfjs = await loadPdfjs();
  // disableFontFace draws glyphs as paths instead of installing @font-face rules —
  // the page is only ever rasterised, never shown, so the document-level font
  // machinery is pure risk here.
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), disableFontFace: true }).promise;
  const base = file.name.replace(/\.pdf$/i, '');
  const pages: File[] = [];
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      // Render at the ORIGINAL-upload size (~2600px): these page images are also what
      // gets uploaded to Blob as the full-res base the bot draws the red pen onto, so
      // rendering small here would put the resolution ceiling right back (the marking
      // copy is still downscaled to 1280 by fileToUpload — model cost unchanged).
      const unit = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.min(3, HIRES_MAX_EDGE / Math.max(unit.width, unit.height)) });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const ctx = canvas.getContext('2d')!;
      // PDF pages have no background of their own — without this, JPEG turns the
      // transparent paper black and the marker sees nothing.
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      // intent 'print' is what makes this reliable off-screen. The default 'display'
      // intent paces the paint loop with requestAnimationFrame, which a hidden or
      // backgrounded tab never fires — the render promise then never settles and the
      // conversion hangs with no error. 'print' paces with timers instead.
      await page.render({ canvasContext: ctx, viewport, intent: 'print' }).promise;
      const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.85));
      if (blob) pages.push(new File([blob], `${base}-p${n}.jpg`, { type: 'image/jpeg' }));
      page.cleanup?.();
      onPage(n, doc.numPages);
    }
  } finally { await doc.destroy?.(); }
  return pages;
}
// Build the upload payload for one image. Downscale via canvas when the browser can
// decode it (keeps the payload small); otherwise — HEIC on Chrome — send the raw bytes
// and let the server (sharp) convert. Never reject a photo here.
// origWidth/origHeight are the PRE-downscale dimensions (absent when the browser
// couldn't decode) — they decide whether a full-res original is worth uploading.
async function fileToUpload(file: File, maxEdge = 1280, quality = 0.72): Promise<{ base64: string; mediaType: string; origWidth?: number; origHeight?: number }> {
  try {
    const bmp = await createImageBitmap(file);
    const ow = bmp.width, oh = bmp.height;
    const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    const out = canvas.toDataURL('image/jpeg', quality);
    return { base64: out.split(',')[1] || '', mediaType: 'image/jpeg', origWidth: ow, origHeight: oh };
  } catch {
    const dataUrl = await readDataUrl(file);
    return { base64: dataUrl.split(',')[1] || '', mediaType: file.type || 'image/heic' };
  }
}

// ── Full-resolution originals (the blurred-marked-pages fix, 2 Aug 2026) ────────
// The 1280px copy above is what the MODEL reads (cost/latency unchanged), but the bot
// composites its red pen onto whatever it is given — so every marked page, and every
// PDF built from them, used to inherit ~1280px. Each photo now ALSO goes to Blob at up
// to 2600px via a client token, and its URL rides the 'direct' body as `originalUrl`;
// the bot re-renders the same overlay onto it (ai/hires-original.js there). Every step
// is best-effort: a failed original upload costs resolution, never the marking.
const HIRES_MAX_EDGE = 2600;

// Re-encode through canvas rather than uploading the raw file: uniform JPEG (the bot's
// sharp lacks HEIC support), EXIF baked exactly like the marking copy (so the two can
// never disagree about orientation), and bounded bytes (a 12MP camera JPEG is 3–8MB;
// this is ~1MB). Returns null when the browser can't decode — then the raw file goes up
// instead and the bot decides whether it can read it.
async function fileToHiresBlob(file: File, maxEdge = HIRES_MAX_EDGE, quality = 0.9): Promise<Blob | null> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    return await new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality));
  } catch { return null; }
}

async function uploadOriginal(file: File, up: { mediaType: string; origWidth?: number; origHeight?: number }): Promise<string | null> {
  try {
    const maxDim = Math.max(up.origWidth || 0, up.origHeight || 0);
    // EVERY photo's original goes up (the old ≤1400px skip is gone, 3 Aug 2026):
    // beyond the hi-res pen base, these are what phase:'remark' re-marks from —
    // a skipped photo would be a hole in a re-marked paper.
    let payload: Blob = file;
    let name = file.name || 'photo.jpg';
    if (up.origWidth) {
      // A JPEG/PNG already at or under the cap uploads as-is (no second lossy pass —
      // the PDF-raster pages land here); anything bigger is re-encoded down to the cap.
      const asIs = maxDim <= HIRES_MAX_EDGE && (file.type === 'image/jpeg' || file.type === 'image/png');
      if (!asIs) {
        const hi = await fileToHiresBlob(file);
        if (!hi) return null;
        payload = hi; name = 'photo.jpg';
      }
    }
    const tokenRes = await fetch(`/api/admin/mark-paper-annotated-token?type=original&filename=${encodeURIComponent(name)}`);
    if (!tokenRes.ok) return null;
    const { token, pathname } = await tokenRes.json();
    const blob = await put(pathname, payload, {
      access: 'public', token,
      contentType: payload.type || 'application/octet-stream',
      multipart: payload.size > 5 * 1024 * 1024,
    });
    return blob.url;
  } catch { return null; }
}

// The question paper too — solely so the run can be re-marked later (the marking
// itself still reads the base64 in the request body). Best-effort like originals.
async function uploadPaperPdf(file: File): Promise<string | null> {
  try {
    const tokenRes = await fetch('/api/admin/mark-paper-annotated-token?type=paper');
    if (!tokenRes.ok) return null;
    const { token, pathname } = await tokenRes.json();
    const blob = await put(pathname, file, {
      access: 'public', token, contentType: 'application/pdf',
      multipart: file.size > 5 * 1024 * 1024,
    });
    return blob.url;
  } catch { return null; }
}

type MarkPart = { label?: string; awarded?: number; max?: number; error_summary?: string | null };
type Run = { id: string; created_at: string; paper_name?: string | null; total_awarded?: number | null; total_max?: number | null; cost_usd?: number | null; num_questions?: number | null; pdf_url?: string | null; photos_pdf_url?: string | null; annotated_pdf_url?: string | null; student_id?: string | null; student_name?: string | null };
type Result = {
  question_number: string; working_index: number; match_confidence: string; photo_index?: number | null;
  marking?: { total_awarded?: number; total_max?: number; overall_comment?: string; parts?: MarkPart[] };
  marking_output?: unknown;
  review_recommended?: boolean; review_reasons?: string[];
};
type Usage = { costUsd?: number; timeSec?: number; inputTokens?: number; outputTokens?: number; model?: string };
// The marker renders each page twice: `url` has no worked solution (📄 full — the transcript
// sheet carries it), `url_with_solutions` has it in the footer (🖼 images-only, which has no
// transcript). Both are forwarded to the PDF route, which picks by mode. Absent on runs
// marked before 29 Jul 2026, and on pages where nothing was wrong — then 🖼 uses `url`.
type AnnotatedPhoto = { photo_index: number; url: string; url_with_solutions?: string | null; method?: string | null };
// One practice question per below-max question — QB pick ('db', with its school/year
// origin) or freshly generated. Built ON REQUEST only (📝 button) and stored on the
// run, so a reload shows the same list without another model call.
type PracticeItem = { for: string; source: 'db' | 'generated'; question: string; answer: string; origin?: string | null; topic?: string | null; note?: string };

const card: CSSProperties = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, marginBottom: 16 };
const btn: CSSProperties = { padding: '10px 18px', borderRadius: 8, border: 'none', background: '#111827', color: '#fff', fontWeight: 600, cursor: 'pointer' };

// Marker comments carry inline $…$ TeX (and $ as currency) — lib/math-inline decides
// which is which and KaTeXes only the math. Raw \tfrac soup in the results panel was
// the "rendering issues" complaint (Adrian, 2 Aug 2026).
function MathText({ text }: { text: string }) {
  return <span dangerouslySetInnerHTML={{ __html: mathHtml(text) }} />;
}

// Download links carry the filename as the LAST PATH SEGMENT (plus ?name= for the
// Content-Disposition): Safari's share sheet titles an inline-viewed PDF from the URL
// path and ignores the header, so without this every Notability import was called
// "mark-paper-download" (Adrian, 2 Aug 2026).
function downloadHref(url: string, filename: string, inline: boolean): string {
  return `/api/admin/mark-paper-download/${encodeURIComponent(filename)}?url=${encodeURIComponent(url)}&name=${encodeURIComponent(filename)}${inline ? '&disposition=inline' : ''}`;
}

// A history row's download filename — same shape as the send panel's, from run fields.
function runFilename(run: Run, suffix: string): string {
  const d = new Date(run.created_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' });
  const pn = run.paper_name && !/^worksheet \(\d+ photos?\)$/i.test(run.paper_name) && !/^shared\.pdf$/i.test(run.paper_name)
    ? run.paper_name.replace(/\.pdf$/i, '') : '';
  const who = [run.student_name, pn].filter(Boolean).join(' — ') || 'Marked paper';
  return [who, suffix, d].filter(Boolean).join(' — ') + '.pdf';
}

// Drag-and-drop / click-to-browse upload zone.
function FileDrop({ label, accept, multiple, count, primaryName, onFiles, hint }: {
  label: string; accept: string; multiple: boolean; count: number;
  primaryName: string | null; onFiles: (files: File[]) => void; hint?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>{label}</label>
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click(); }}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); onFiles(Array.from(e.dataTransfer.files)); }}
        style={{
          border: `2px dashed ${drag ? '#2563eb' : '#cbd5e1'}`,
          background: drag ? '#eff6ff' : '#f8fafc',
          borderRadius: 12, padding: '22px 16px', textAlign: 'center', cursor: 'pointer',
          transition: 'background 0.12s, border-color 0.12s',
        }}
      >
        <div style={{ fontSize: 26, marginBottom: 6 }}>{multiple ? '🖼️' : '📄'}</div>
        {count > 0
          ? <div style={{ fontWeight: 600, color: '#0f172a' }}>{multiple ? `${count} photo${count > 1 ? 's' : ''} added — drop or click to add more` : primaryName}</div>
          : <div style={{ color: '#475569' }}>Drag &amp; drop here, or <span style={{ color: '#2563eb', fontWeight: 600 }}>click to browse</span></div>}
        {hint && <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>{hint}</div>}
      </div>
      <input ref={inputRef} type="file" accept={accept} multiple={multiple} style={{ display: 'none' }}
        onChange={(e) => onFiles(e.target.files ? Array.from(e.target.files) : [])} />
    </div>
  );
}

export default function MarkPaperPage() {
  const [pdf, setPdf] = useState<File | null>(null);
  const [images, setImages] = useState<File[]>([]);
  const [imgPreviews, setImgPreviews] = useState<(string | null)[]>([]);
  const [rasterizing, setRasterizing] = useState('');

  const [results, setResults] = useState<Result[] | null>(null);
  const [totals, setTotals] = useState<{ awarded: number; max: number } | null>(null);
  const [unattempted, setUnattempted] = useState<string[]>([]);
  const [usage, setUsage] = useState<Usage | null>(null);
  // Generated outputs, labelled — a LIST because "Generate both" shows the images PDF
  // the moment it exists while the full PDF is still typesetting behind it.
  const [marked, setMarked] = useState<{ url: string; kind: string; label: string }[]>([]);
  // Which half "Generate both" is currently building (null when idle/single-mode).
  const [bothStage, setBothStage] = useState<'images' | 'full' | null>(null);
  // Send / save block (the no-amendments fast path). Email only — WhatsApp goes out
  // from Adrian's PERSONAL number on the Mac by dragging the downloaded file in, so the
  // WhatsApp feature here is the nicely-named Download, not a send button.
  const [students, setStudents] = useState<{ id: string; name: string }[] | null>(null);
  const [sendStudentId, setSendStudentId] = useState('');
  const [sendStudentName, setSendStudentName] = useState('');
  const [sendEmail, setSendEmail] = useState('');
  const [sendRemember, setSendRemember] = useState(true);
  const [sendBusy, setSendBusy] = useState(false);
  const [sendNote, setSendNote] = useState<{ ok: boolean; text: string } | null>(null);
  // Editable descriptor used in the filename and the email — "worksheet (10 photos)"
  // was useless in an inbox. Prefilled from the run's stored name when it's a real one.
  const [paperName, setPaperName] = useState('');
  // iPad share-sheet inbox: files the "✍️ Mark paper" Shortcut posted from WhatsApp
  // (iPadOS keeps websites out of the share sheet; the Shortcut is the workaround).
  const [inbox, setInbox] = useState<{ pathname: string; url: string; name: string; size: number; kind?: 'working' | 'paper' | null }[]>([]);
  // The working-PDF's filename ("xinmin EM p2") — the paper's natural name. Captured
  // at attach so it prefills the Paper name box, survives the mark-start reset, and
  // names the run in history (Adrian, 1 Aug 2026: "why don't we have it prefilled?").
  const workingNameRef = useRef('');
  // Which history run's student tag is being edited inline (run id, or null).
  const [editTagId, setEditTagId] = useState<string | null>(null);
  const [inboxBusy, setInboxBusy] = useState('');
  const [inboxToken, setInboxToken] = useState<string | null>(null);
  const [annotatedBusy, setAnnotatedBusy] = useState(false);
  const [annotateOpen, setAnnotateOpen] = useState(false);
  const [practiceItems, setPracticeItems] = useState<PracticeItem[] | null>(null);
  const [practiceBusy, setPracticeBusy] = useState(false);
  const annotatedInputRef = useRef<HTMLInputElement>(null);
  const [generating, setGenerating] = useState(false);
  const [stats, setStats] = useState<{ count: number; totalCost: number; avgCost: number; avgTime: number } | null>(null);
  const [annotatedPhotos, setAnnotatedPhotos] = useState<AnnotatedPhoto[]>([]);
  const [runId, setRunId] = useState<string | null>(null);
  const [recentRuns, setRecentRuns] = useState<Run[]>([]);
  const [markModel, setMarkModel] = useState<'opus' | 'sonnet'>('opus');
  // Red pen is the default everywhere else — the bot safelists `style` and falls through to
  // 'teacher', and a Telegram photo needs a "classic" caption to opt back into pills. This
  // page was the one surface still opening on 'classic', so the same paper came back looking
  // like a different product depending on where it was marked (Adrian, Jul 2026).
  const [markStyle, setMarkStyle] = useState<'classic' | 'teacher'>('teacher');

  const [phase, setPhase] = useState<'idle' | 'proposing' | 'proposed' | 'marking' | 'done'>('idle');
  const [error, setError] = useState('');
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [loadingRun, setLoadingRun] = useState('');
  const [loadedName, setLoadedName] = useState('');
  const historyRef = useRef<HTMLDetailsElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  const authHeaders = { 'Content-Type': 'application/json' };

  // Lifetime cost metrics + recent runs (for the history list). Re-callable after mark/generate.
  async function loadStats() {
    try {
      const r = await fetch('/api/admin/mark-paper', { method: 'POST', headers: authHeaders, body: JSON.stringify({ phase: 'stats' }) });
      if (!r.ok) return;
      const d = await r.json();
      setStats(d);
      setRecentRuns(d.runs || []);
    } catch { /* ignore */ }
  }
  // Establish the admin session first (silently upgrades a legacy cookie); if not
  // logged in, send to the admin hub instead of failing with a bare "unauthorized".
  useEffect(() => {
    ensureAdminSession().then(ok => {
      if (!ok) { window.location.href = '/admin'; return; }
      loadStats();
      loadInbox();
    });
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, []);

  // Load a stored run back into the page so its PDFs can be regenerated (no re-mark).
  // The results land near the BOTTOM of the page, well below the history list the
  // button lives in, so without the busy label, the collapse and the scroll below,
  // a successful load looks exactly like a dead button (Adrian, Jul 2026).
  async function loadRun(id: string) {
    setError(''); setLoadingRun(id);
    try {
      const r = await fetch('/api/admin/mark-paper', { method: 'POST', headers: authHeaders, body: JSON.stringify({ phase: 'run', id }) });
      const d = await r.json();
      if (!r.ok || !d.run) throw new Error(d.error || 'Could not load that run');
      const rj = d.run.result_json || {};
      const results = rj.results || [];
      const photos = rj.annotated_photos || [];
      if (!results.length && !photos.length) throw new Error('That run has no stored marking to load — mark the paper again.');
      setResults(results);
      setTotals(rj.totals || null);
      setAnnotatedPhotos(photos);
      setPracticeItems(rj.practice?.items?.length ? rj.practice.items : null);
      setUnattempted([]);
      setRunId(d.run.id);
      setLoadedName(d.run.paper_name || 'Paper');
      // The stored run doesn't carry its cost/time back, and leaving the last run's
      // figures under a different paper's result reads as this paper's.
      setUsage(null);
      // Keep the PDFs this run already produced: clearing them hid the one thing most
      // worth having back, and re-generating costs a Puppeteer round trip. Both kinds
      // surface when both were built.
      const kept: { url: string; kind: string; label: string }[] = [];
      // Annotated first — once Adrian's own pen is on a copy, that copy IS the paper.
      if (d.run.annotated_pdf_url) kept.push({ url: d.run.annotated_pdf_url, kind: 'pdf', label: '✍️ Annotated PDF' });
      if (d.run.photos_pdf_url) kept.push({ url: d.run.photos_pdf_url, kind: 'pdf', label: '🖼 Images PDF' });
      if (d.run.pdf_url) kept.push({ url: d.run.pdf_url, kind: 'pdf', label: '📄 Full PDF' });
      setMarked(kept);
      // Paper name: prefill from the run unless it's the auto "worksheet (N photos)"
      // placeholder — that label was the whole complaint ("worksheet — 86-94 does not
      // seem helpful"), so it never reaches a filename.
      const pn = d.run.paper_name || '';
      setPaperName(/^worksheet \(\d+ photos?\)$/i.test(pn) ? '' : pn);
      setPhase('done');
      if (historyRef.current) historyRef.current.open = false;
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
      return { photoCount: photos.length };
    } catch (e) { setError((e as Error).message); }
    finally { setLoadingRun(''); }
  }

  // History-row ✏️: load the run, then jump straight into the annotate overlay —
  // "allow annotation option in recently marked papers directly" (Adrian, 2 Aug 2026).
  async function annotateRun(id: string) {
    const r = await loadRun(id);
    if (!r) return;   // loadRun already surfaced the error
    if (r.photoCount > 0) setAnnotateOpen(true);
    else setError('This run has no marked page images stored — mark the paper again to annotate it.');
  }

  // Can the browser natively decode this for a preview? (JPEG/PNG/WebP everywhere; HEIC only on Safari.)
  async function canDecode(f: Blob): Promise<boolean> {
    try { const b = await createImageBitmap(f); b.close?.(); return true; } catch { return false; }
  }

  // Working dropped as a PDF (a scan rather than phone photos): expand it to one image
  // per page first, then carry on down the ordinary photo path.
  async function onPickWorking(arr: File[]) {
    const isPdf = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
    const pdfs = arr.filter(isPdf);
    if (pdfs.length && pdfs[0].name && !/^shared\.pdf$/i.test(pdfs[0].name)) {
      const nice = pdfs[0].name.replace(/\.pdf$/i, '').replace(/[-_]+/g, ' ').trim();
      if (nice) { workingNameRef.current = nice; setPaperName((prev) => prev || nice); }
    }
    const photos = arr.filter((f) => !isPdf(f) && (f.type.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif|gif)$/i.test(f.name)));
    if (photos.length) await onPickImages(photos);
    for (const f of pdfs) {
      setError('');
      try {
        setRasterizing(`Converting ${f.name}…`);
        const pages = await pdfToPageImages(f, (done, total) => setRasterizing(`Converting ${f.name} — page ${done} of ${total}…`));
        if (!pages.length) throw new Error('no pages could be rendered');
        await onPickImages(pages);
      } catch (e) {
        setError(`Couldn't read ${f.name} as pages (${(e as Error).message}). Photograph the pages instead.`);
      } finally { setRasterizing(''); }
    }
  }

  // Accept all picked photos (HEIC included). Preview those the browser can decode; the rest
  // still upload and get converted on the server. Appends, so you can build the set up.
  async function onPickImages(arr: File[]) {
    if (!arr.length) return;
    setError('');
    const withPreview = await Promise.all(arr.map(async (f) => ({
      file: f,
      url: (await canDecode(f)) ? URL.createObjectURL(f) : null,
    })));
    setImages((prev) => [...prev, ...withPreview.map((w) => w.file)]);
    setImgPreviews((prev) => [...prev, ...withPreview.map((w) => w.url)]);
  }

  function removeImage(idx: number) {
    setImgPreviews((prev) => { const u = prev[idx]; if (u) URL.revokeObjectURL(u); return prev.filter((_, j) => j !== idx); });
    setImages((prev) => prev.filter((_, j) => j !== idx));
  }

  // Parse + apply a marking response (fresh mark AND re-mark share the shape).
  async function applyMarkResponse(resp: Response) {
    const raw = await resp.text();
    let d: { results?: Result[]; totals?: { awarded: number; max: number }; unattempted_questions?: string[]; annotated_photos?: AnnotatedPhoto[]; run_id?: string | null; usage?: Usage; error?: string };
    try { d = raw ? JSON.parse(raw) : {}; }
    catch {
      const hint = resp.status === 413
        ? 'the upload is too large for the server — try fewer photos, or a smaller PDF'
        : 'it likely timed out — try fewer photos at once';
      throw new Error(`The marker didn't return a result (status ${resp.status}) — ${hint}.`);
    }
    if (!resp.ok) throw new Error(d.error || `Marking failed (status ${resp.status})`);
    setResults(d.results || []);
    setTotals(d.totals || null);
    setUnattempted(d.unattempted_questions || []);
    setAnnotatedPhotos(d.annotated_photos || []);
    setRunId(d.run_id || null);
    setUsage(d.usage || null);
    setPhase('done');
    loadStats();
  }

  // Single-pass: mark every photo directly against the PDF (no extract/match/confirm step).
  async function markPaper() {
    if (images.length === 0) { setError('Add the student’s working first — photos, or a scanned PDF.'); return; }
    setError(''); setPhase('marking'); setResults(null); setTotals(null); setMarked([]); setLoadedName(''); setPaperName(workingNameRef.current); setPracticeItems(null);
    try {
      // PDF is optional — without it, photos are marked standalone (self-contained
      // worksheets where the printed questions are on the pages themselves).
      const pdfBase64 = pdf ? await pdfToBase64(pdf) : null;
      const imgs = await Promise.all(images.map((f) => fileToUpload(f)));
      // Full-res originals + the paper PDF → Blob, BEFORE the marking call (the URLs
      // ride its body). The originals feed the hi-res red pen; together with the PDF
      // they are also what 🔁 Re-mark rebuilds from. Each upload is best-effort.
      setRasterizing('Uploading full-resolution pages…');
      const [originalUrls, paperPdfUrl] = await Promise.all([
        Promise.all(images.map((f, i) => uploadOriginal(f, imgs[i]))),
        pdf ? uploadPaperPdf(pdf) : Promise.resolve(null),
      ]).finally(() => setRasterizing(''));
      const resp = await fetch('/api/admin/mark-paper', {
        method: 'POST', headers: authHeaders,
        body: JSON.stringify({
          phase: 'direct', pdfBase64, paperPdfUrl: paperPdfUrl || undefined,
          images: imgs.map((im, i) => ({ base64: im.base64, mediaType: im.mediaType, originalUrl: originalUrls[i] || undefined })),
          paperName: workingNameRef.current || (pdf ? pdf.name : `worksheet (${images.length} photo${images.length === 1 ? '' : 's'})`), model: markModel, style: markStyle,
        }),
      });
      await applyMarkResponse(resp);
    } catch (e) { setError((e as Error).message); setPhase('idle'); }
  }

  // 🔁 Re-mark: the loaded run's stored inputs (photo originals + paper PDF in Blob)
  // go through marking again server-side — nothing to re-attach. Full marking cost,
  // hence the confirm. With photos still attached in the picker, plain markPaper()
  // is the same thing from fresher bytes, so prefer it.
  async function remarkPaper() {
    if (images.length) { markPaper(); return; }
    if (!runId) return;
    if (!window.confirm('Re-mark this paper from its stored photos? Costs about the same as the original marking (~1–2 min).')) return;
    setError(''); setPhase('marking'); setResults(null); setTotals(null); setMarked([]); setPracticeItems(null);
    try {
      const resp = await fetch('/api/admin/mark-paper', {
        method: 'POST', headers: authHeaders,
        body: JSON.stringify({ phase: 'remark', id: runId, model: markModel, style: markStyle }),
      });
      await applyMarkResponse(resp);
    } catch (e) { setError((e as Error).message); setPhase('idle'); }
  }

  // One build = one call to the PDF route. Throws on failure; links the result to the
  // run so history offers it as a one-click download.
  async function buildPdf(mode: 'full' | 'photos'): Promise<{ url: string; kind: string; label: string }> {
    const payload = {
      // photo_index is what lets the PDF put each transcript sheet behind its own photo.
      results: (results || []).map((r) => ({ question_number: r.question_number, marking_output: r.marking_output, photo_index: r.photo_index })),
      annotated_photos: annotatedPhotos,
      totals,
      student: { name: '', level: '' },
      multi: images.length > 1,
      mode,
    };
    const resp = await fetch('/api/admin/mark-paper-pdf', { method: 'POST', headers: authHeaders, body: JSON.stringify(payload) });
    const d = await resp.json();
    if (!resp.ok) throw new Error(d.error || 'Generate failed');
    if (runId && d.url) {
      fetch('/api/admin/mark-paper', { method: 'POST', headers: authHeaders, body: JSON.stringify({ phase: 'link-pdf', id: runId, url: d.url, kind: mode }) })
        .then(() => loadStats()).catch(() => {});
    }
    return {
      url: d.url, kind: d.kind,
      label: mode === 'photos' ? '🖼 Images PDF' : (d.kind === 'image' ? '📄 Marked image' : '📄 Full PDF'),
    };
  }

  // Render the marked typeset output: PDF (>1 image) or a single image (1 image).
  async function generateMarked(mode: 'full' | 'photos' = 'full') {
    // Say why, never nothing: a bare `return` here made a PDF click look like a dead
    // button — the same complaint Adrian had about Load (Jul 2026).
    if (mode === 'photos' ? !annotatedPhotos.length : !results?.length) {
      setError(mode === 'photos'
        ? 'This run has no annotated photos stored — mark the paper again to get them.'
        : 'Nothing to build a PDF from — mark a paper, or load a run from the history below.');
      return;
    }
    setGenerating(true); setMarked([]); setError('');
    try { setMarked([await buildPdf(mode)]); }
    catch (e) { setError((e as Error).message); }
    finally { setGenerating(false); }
  }

  // ── iPad inbox helpers ─────────────────────────────────────────────────────
  // Re-check whenever the tab comes back to the front: the share happens in WhatsApp
  // while this page sits in another Split View pane — without this, a file sent after
  // the page loaded stayed invisible until a manual reload.
  useEffect(() => {
    const onBack = () => { if (!document.hidden) loadInbox(); };
    window.addEventListener('focus', onBack);
    document.addEventListener('visibilitychange', onBack);
    return () => { window.removeEventListener('focus', onBack); document.removeEventListener('visibilitychange', onBack); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  async function loadInbox() {
    try {
      const r = await fetch('/api/admin/mark-paper-inbox');
      const d = await r.json();
      if (r.ok) setInbox(d.files || []);
    } catch { /* banner just stays hidden */ }
  }
  async function loadInboxToken() {
    if (inboxToken !== null) return;
    try {
      const r = await fetch('/api/admin/mark-paper-inbox?setup=1');
      const d = await r.json();
      if (r.ok) setInboxToken(d.token || '');
    } catch { setInboxToken(''); }
  }
  async function dismissInboxFile(pathname: string) {
    setInbox((prev) => prev.filter((f) => f.pathname !== pathname));
    fetch('/api/admin/mark-paper-inbox', {
      method: 'DELETE', headers: authHeaders, body: JSON.stringify({ pathname }),
    }).catch(() => {});
  }
  // Attach an inbox file where the picker would have put it, then consume it.
  async function useInboxFile(f: { pathname: string; url: string; name: string }, as: 'working' | 'paper') {
    setInboxBusy(f.pathname);
    try {
      const r = await fetch(f.url);
      if (!r.ok) throw new Error(`fetch failed (${r.status})`);
      const blob = await r.blob();
      const file = new File([blob], f.name, { type: blob.type || (/\.pdf$/i.test(f.name) ? 'application/pdf' : 'image/jpeg') });
      if (as === 'paper') setPdf(file);
      else await onPickWorking([file]);
      dismissInboxFile(f.pathname);
    } catch (e) { setError(`Couldn't attach ${f.name}: ${(e as Error).message}`); }
    finally { setInboxBusy(''); }
  }

  // ── Send / save helpers ────────────────────────────────────────────────────
  async function loadStudents() {
    if (students) return;
    try {
      const r = await fetch('/api/mark-batch/init', { headers: authHeaders });
      const d = await r.json();
      if (r.ok) setStudents(d.students || []);
    } catch { /* dropdown stays empty; email can still be typed */ }
  }
  // Eager-load once the send panel exists: an iPad opens the native picker BEFORE a
  // focus-triggered fetch lands, and the open sheet doesn't refresh its options.
  const sendPanelVisible = marked.length > 0;
  useEffect(() => {
    if (sendPanelVisible) loadStudents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sendPanelVisible]);
  async function pickSendStudent(id: string) {
    setSendStudentId(id); setSendNote(null);
    const s = (students || []).find((x) => x.id === id);
    setSendStudentName(s?.name || '');
    if (!id) { setSendEmail(''); return; }
    // Tag the run with the student — this link is what makes the paper show up on the
    // student's profile page ("Marked papers"). Last pick WINS: re-picking corrects a
    // wrong tag, and the confirmation note below is what makes that visible (a silent
    // retag read as "I can't change it", Adrian 31 Jul 2026).
    if (runId) {
      fetch('/api/admin/mark-paper', {
        method: 'POST', headers: authHeaders,
        body: JSON.stringify({ phase: 'set-student', id: runId, studentId: id, studentName: s?.name || '' }),
      }).then((r) => {
        if (r.ok) setSendNote({ ok: true, text: `Filed under ${s?.name || 'student'} — re-pick to change` });
        loadStats();
      }).catch(() => {});
    }
    try {
      const r = await fetch(`/api/admin/mark-paper-send?studentId=${id}`, { headers: authHeaders });
      const d = await r.json();
      // Student email only — parents are deliberately never emailed marked papers
      // (Adrian, 1 Aug 2026), so the parent address is not even offered.
      if (r.ok) setSendEmail(d.studentEmail || '');
    } catch { /* prefill is best-effort */ }
  }
  // The copy Adrian hands back: his own annotated one once it exists, else the images
  // PDF, else whatever there is.
  const sendPdf = marked.find((m) => m.label.startsWith('✍️')) || marked.find((m) => m.label.startsWith('🖼')) || marked[0] || null;
  // Filename = Student — Paper name — date. No score and no auto "worksheet (N photos)"
  // label — "Kieran Lai — worksheet — 86-94.pdf" told the recipient nothing (Adrian,
  // 30 Jul 2026); the score already sits in the PDF's total strip.
  const sendDateStr = new Date().toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' });
  const sendFilename = [...[sendStudentName, paperName].filter(Boolean), sendDateStr].join(' — ').replace(/^(?=\d)/, 'Marked paper — ') + '.pdf';
  async function sendMarkedEmail() {
    if (!sendPdf) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sendEmail.trim())) { setSendNote({ ok: false, text: 'Enter a valid email address first.' }); return; }
    setSendBusy(true); setSendNote(null);
    try {
      const r = await fetch('/api/admin/mark-paper-send', {
        method: 'POST', headers: authHeaders,
        body: JSON.stringify({
          pdfUrl: sendPdf.url, filename: sendFilename, to: sendEmail.trim(),
          studentId: sendStudentId || undefined, saveEmail: sendRemember && !!sendStudentId,
          paperLabel: paperName || 'your paper', score: totals ? `${totals.awarded}/${totals.max}` : '',
          studentName: sendStudentName,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Send failed');
      setSendNote({ ok: true, text: `Delivered to ${sendEmail.trim()}${d.emailSaved ? ' · address saved' : ''}${d.saveHint ? ` · ${d.saveHint}` : ''}` });
    } catch (e) { setSendNote({ ok: false, text: (e as Error).message }); }
    finally { setSendBusy(false); }
  }

  // The Notability round trip's return leg: Adrian annotates the images PDF on the
  // iPad, then drags the note into this page (Split View) or picks it from Files. The
  // file goes STRAIGHT to Blob with a client token (a 10-page Notability export runs
  // 5–20MB — past the function body cap), then links to the run as annotated_pdf_url.
  async function uploadAnnotated(file: File | null | undefined) {
    if (!file || annotatedBusy) return;
    if (!runId) { setSendNote({ ok: false, text: 'Load or mark a paper first — the annotated copy attaches to its run.' }); return; }
    if (!/pdf$/i.test(file.type) && !/\.pdf$/i.test(file.name)) { setSendNote({ ok: false, text: 'That is not a PDF — export the note as PDF from Notability.' }); return; }
    setAnnotatedBusy(true); setSendNote(null);
    try {
      const tokenRes = await fetch(`/api/admin/mark-paper-annotated-token?runId=${encodeURIComponent(runId)}&filename=${encodeURIComponent(file.name)}`);
      if (!tokenRes.ok) throw new Error('upload token failed');
      const { token, pathname } = await tokenRes.json();
      const blob = await put(pathname, file, {
        access: 'public', token, multipart: file.size > 5 * 1024 * 1024, contentType: 'application/pdf',
      });
      const link = await fetch('/api/admin/mark-paper', {
        method: 'POST', headers: authHeaders,
        body: JSON.stringify({ phase: 'link-pdf', id: runId, url: blob.url, kind: 'annotated' }),
      });
      if (!link.ok) throw new Error('uploaded, but linking to the run failed — try again');
      setMarked((prev) => [{ url: blob.url, kind: 'pdf', label: '✍️ Annotated PDF' }, ...prev.filter((m) => !m.label.startsWith('✍️'))]);
      setSendNote({ ok: true, text: 'Annotated PDF attached — Download and Email now use it.' });
      loadStats();
    } catch (e) { setSendNote({ ok: false, text: (e as Error).message }); }
    finally { setAnnotatedBusy(false); if (annotatedInputRef.current) annotatedInputRef.current.value = ''; }
  }

  // Both PDFs from one click, IMAGES FIRST — it builds in seconds (no typesetting), so
  // Adrian's hand-back copy is openable while the full PDF is still rendering its
  // transcript sheets behind it. Each half fails on its own: an images link already
  // shown is never taken away by the full build failing.
  async function generateBoth() {
    if (!annotatedPhotos.length && !results?.length) {
      setError('Nothing to build a PDF from — mark a paper, or load a run from the history below.');
      return;
    }
    setGenerating(true); setMarked([]); setError('');
    const errs: string[] = [];
    if (annotatedPhotos.length) {
      setBothStage('images');
      try { const r = await buildPdf('photos'); setMarked([r]); }
      catch (e) { errs.push(`images: ${(e as Error).message}`); }
    }
    if (results?.length) {
      setBothStage('full');
      try { const r = await buildPdf('full'); setMarked((prev) => [...prev, r]); }
      catch (e) { errs.push(`full: ${(e as Error).message}`); }
    }
    if (errs.length) setError(`PDF generation — ${errs.join(' · ')}`);
    setBothStage(null); setGenerating(false);
  }

  // 📝 Practice questions — OPT-IN (Adrian, 3 Aug 2026: "put it as an option…
  // do not do this by default"): one QB-or-generated question per below-max
  // question, built only when the button is pressed. The bot stores the list on
  // the run, so pressing again (or reloading the run) never pays twice.
  async function loadPractice() {
    if (!runId || practiceBusy) return;
    setPracticeBusy(true); setError('');
    try {
      const r = await fetch('/api/admin/mark-paper', {
        method: 'POST', headers: authHeaders,
        body: JSON.stringify({ phase: 'practice', id: runId, model: markModel }),
      });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || `practice failed (${r.status})`);
      if (!d.items?.length) { setError('No practice questions came back — try again, or the wrong questions had no usable match.'); return; }
      setPracticeItems(d.items);
    } catch (e) { setError((e as Error).message); }
    finally { setPracticeBusy(false); }
  }
  const wrongCount = (results || []).filter((r) => (r.marking?.total_max ?? 0) > 0 && (r.marking?.total_awarded ?? 0) < (r.marking?.total_max ?? 0)).length;

  const busy = phase === 'proposing' || phase === 'marking' || !!rasterizing;
  // Photos the overlay marked per QUESTION rather than per line — i.e. the ones that
  // came back without ticks. `method` is 'line' | 'question' | 'margin' | null.
  const coarsePhotos = annotatedPhotos.filter((p) => p.method && p.method !== 'line');

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: 20 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Mark a paper</h1>
      <p style={{ color: '#6b7280', marginBottom: 20 }}>Upload the student&rsquo;s working (photos, or a scanned PDF) — plus the question paper (PDF) if there is one — then Mark. With a paper, each photo is marked against it; without one, the marker reads the printed questions off the pages themselves (self-contained worksheets).</p>

      {error && <div style={{ ...card, borderColor: '#fca5a5', background: '#fef2f2', color: '#b91c1c' }}>{error}</div>}

      {stats && stats.count > 0 && (
        <div style={{ ...card, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'baseline', background: '#f8fafc' }}>
          <span style={{ fontWeight: 700 }}>📊 Marking cost</span>
          <span style={{ fontSize: 13, color: '#374151' }}>
            last {stats.count} papers · ${stats.totalCost.toFixed(2)} total · <strong>${stats.avgCost.toFixed(3)}/paper</strong> avg · {stats.avgTime.toFixed(0)}s avg
          </span>
        </div>
      )}

      {recentRuns.length > 0 && (
        <details ref={historyRef} style={card}>
          <summary style={{ fontWeight: 700, cursor: 'pointer' }}>🗂️ Recent marked papers ({recentRuns.length})</summary>
          <div style={{ marginTop: 8 }}>
            {recentRuns.map((run) => (
              <div key={run.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '8px 0', borderTop: '1px solid #f3f4f6', fontSize: 13 }}>
                <span style={{ color: '#6b7280', minWidth: 120 }}>{new Date(run.created_at).toLocaleString('en-SG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                <span style={{ flex: 1, minWidth: 120, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
                  {editTagId === run.id ? (
                    <select
                      autoFocus
                      value={run.student_id || ''}
                      onBlur={() => setEditTagId(null)}
                      onChange={(e) => {
                        const sid = e.target.value;
                        const sname = (students || []).find((x) => x.id === sid)?.name || '';
                        setEditTagId(null);
                        if (!sid) return;
                        setRecentRuns((prev) => prev.map((r) => r.id === run.id ? { ...r, student_id: sid, student_name: sname } : r));
                        fetch('/api/admin/mark-paper', {
                          method: 'POST', headers: authHeaders,
                          body: JSON.stringify({ phase: 'set-student', id: run.id, studentId: sid, studentName: sname }),
                        }).catch(() => {});
                      }}
                      style={{ fontSize: 12, padding: '2px 4px', border: '1px solid #d1d5db', borderRadius: 6 }}
                    >
                      <option value="">Student…</option>
                      {(students || []).map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}
                    </select>
                  ) : (
                    <button
                      title="Tag / change student"
                      onClick={() => { loadStudents(); setEditTagId(run.id); }}
                      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#1d4ed8', fontWeight: 600, fontSize: 13 }}
                    >
                      {run.student_name || '＋ tag'}
                    </button>
                  )}
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{run.paper_name || 'Paper'}</span>
                </span>
                <span style={{ color: '#374151' }}>{run.total_awarded ?? 0}/{run.total_max ?? 0}</span>
                <span style={{ color: '#9ca3af' }}>${(run.cost_usd ?? 0).toFixed(3)}</span>
                {run.annotated_pdf_url && <a href={downloadHref(run.annotated_pdf_url, runFilename(run, 'annotated'), true)} target="_blank" rel="noopener noreferrer" style={{ color: '#7c3aed', fontWeight: 600 }}>✍️ Annotated ↗</a>}
                {run.pdf_url && <a href={downloadHref(run.pdf_url, runFilename(run, ''), true)} target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb' }}>PDF ↗</a>}
                {run.photos_pdf_url && <a href={downloadHref(run.photos_pdf_url, runFilename(run, 'images'), true)} target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb' }}>Images ↗</a>}
                <button type="button" disabled={!!loadingRun} title="Load and write on it with the Pencil" onClick={() => annotateRun(run.id)}
                  style={{ ...btn, background: '#0d9488', padding: '4px 10px', fontSize: 12, opacity: loadingRun ? 0.6 : 1 }}>
                  {loadingRun === run.id ? '…' : '✏️ Annotate'}
                </button>
                <button type="button" disabled={!!loadingRun} onClick={() => loadRun(run.id)}
                  style={{ ...btn, padding: '4px 10px', fontSize: 12, opacity: loadingRun ? 0.6 : 1 }}>
                  {loadingRun === run.id ? 'Loading…' : 'Load'}
                </button>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Upload */}
      <div style={card}>
        {/* iPad share-sheet inbox — files the "✍️ Mark paper" Shortcut sent from
            WhatsApp etc. One tap attaches them where the picker would have. */}
        {inbox.length > 0 && (
          <div style={{ marginBottom: 14, padding: 12, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>📥 From your iPad ({inbox.length})</div>
            {inbox.map((f) => {
              // Share-time tag (the Shortcut's "Attach as?" menu): the tagged kind's
              // button leads, dark; the other stays available for mis-taps. A photo
              // can never be the question paper (that slot is a PDF).
              const isPdf = /\.pdf$/i.test(f.name);
              const workingBtn = (dark: boolean) => (
                <button key="w" style={{ ...btn, background: dark ? '#111827' : '#9ca3af', fontSize: 13, padding: '6px 12px' }} disabled={!!inboxBusy} onClick={() => useInboxFile(f, 'working')}>→ Working</button>
              );
              const paperBtn = (dark: boolean) => isPdf ? (
                <button key="p" style={{ ...btn, background: dark ? '#374151' : '#9ca3af', fontSize: 13, padding: '6px 12px' }} disabled={!!inboxBusy} onClick={() => useInboxFile(f, 'paper')}>→ Question paper</button>
              ) : null;
              return (
                <div key={f.pathname} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '6px 0', fontSize: 14, opacity: inboxBusy === f.pathname ? 0.5 : 1 }}>
                  <span style={{ flex: 1, minWidth: 140, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                  {f.kind && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#1d4ed8', background: '#dbeafe', borderRadius: 999, padding: '2px 8px' }}>
                      {f.kind === 'paper' ? '📄 question paper' : '✍️ working'}
                    </span>
                  )}
                  <span style={{ color: '#6b7280', fontSize: 12 }}>{(f.size / 1024 / 1024).toFixed(1)}MB</span>
                  {f.kind === 'paper' && isPdf ? [paperBtn(true), workingBtn(false)]
                    : f.kind === 'working' ? [workingBtn(true), paperBtn(false)]
                    : [workingBtn(true), paperBtn(true)]}
                  <button style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 16 }} title="Dismiss" onClick={() => dismissInboxFile(f.pathname)}>✕</button>
                </div>
              );
            })}
          </div>
        )}
        <FileDrop
          label="Question paper (PDF) — optional"
          accept="application/pdf"
          multiple={false}
          count={pdf ? 1 : 0}
          primaryName={pdf?.name || null}
          onFiles={(fs) => setPdf(fs.find((f) => f.type === 'application/pdf') || fs[0] || null)}
          hint="One PDF file · leave empty for self-contained worksheets (questions printed on the pages)"
        />
        <FileDrop
          label="Student working (photos or a scanned PDF)"
          accept="image/*,application/pdf"
          multiple
          count={images.length}
          primaryName={null}
          onFiles={(fs) => { if (fs.length) onPickWorking(fs); }}
          hint="JPG / PNG / HEIC, or a PDF scan — its pages become photos · drop several · click to add more"
        />
        {rasterizing && (
          <div style={{ marginTop: 8, fontSize: 13, color: '#2563eb' }}>📄 {rasterizing}</div>
        )}
        {imgPreviews.length > 0 && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
            {imgPreviews.map((src, i) => (
              <div key={i} style={{ position: 'relative', width: 72, height: 72 }}>
                {src
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={src} alt={`working ${i + 1}`} style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 6, border: '1px solid #e5e7eb' }} />
                  : <div style={{ width: 72, height: 72, borderRadius: 6, border: '1px solid #e5e7eb', background: '#f1f5f9', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#475569', textAlign: 'center', gap: 2 }}><span style={{ fontSize: 18 }}>🖼️</span>HEIC<br />converts on<br />upload</div>}
                <button onClick={() => removeImage(i)} aria-label={`Remove photo ${i + 1}`}
                  style={{ position: 'absolute', top: -7, right: -7, width: 20, height: 20, borderRadius: '50%', border: '2px solid #fff', background: '#111827', color: '#fff', fontSize: 12, lineHeight: '15px', cursor: 'pointer', padding: 0 }}>×</button>
              </div>
            ))}
          </div>
        )}
        <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button style={{ ...btn, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={markPaper}>
            {phase === 'marking' ? 'Marking…' : 'Mark paper'}
          </button>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#374151' }}>
            <span>Model:</span>
            <select
              value={markModel}
              onChange={(e) => setMarkModel(e.target.value as 'opus' | 'sonnet')}
              disabled={busy}
              style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }}
            >
              <option value="opus">Opus 5 (default)</option>
              <option value="sonnet">Sonnet 5</option>
            </select>
          </label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#374151' }}>
            <span>Marks:</span>
            <select
              value={markStyle}
              onChange={(e) => setMarkStyle(e.target.value as 'classic' | 'teacher')}
              disabled={busy}
              style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }}
            >
              <option value="teacher">✍️ Teacher&apos;s red pen (default)</option>
              <option value="classic">Classic pills</option>
            </select>
          </label>
          <span style={{ color: '#6b7280', fontSize: 13 }}>{pdf ? 'Reads each photo against the paper and marks every question it finds (≈1–2 min).' : 'No paper attached — marks each photo standalone, reading the printed questions off the page (≈1–2 min).'}</span>
        </div>
        {/* One-time Shortcut recipe — puts "✍️ Mark paper" into the iPad share sheet,
            posting straight into the inbox banner above. */}
        <details style={{ marginTop: 10 }} onToggle={(e) => { if ((e.target as HTMLDetailsElement).open) loadInboxToken(); }}>
          <summary style={{ color: '#6b7280', fontSize: 13, cursor: 'pointer' }}>📱 Send files here from the iPad share sheet (one-time setup)</summary>
          <div style={{ fontSize: 13, color: '#374151', marginTop: 8, lineHeight: 1.7 }}>
            <ol style={{ paddingLeft: 18, margin: 0 }}>
              <li>On the iPad, open <b>Shortcuts</b> → <b>+</b> to make a new shortcut → rename it <b>✍️ Mark paper</b>.</li>
              <li>Tap the <b>ⓘ</b> (details) → turn on <b>Show in Share Sheet</b> → under &quot;Share Sheet Types&quot; keep <b>PDFs</b> and <b>Images</b>.</li>
              <li>Add the action <b>Get Contents of URL</b> and set it up:<br />
                URL: <code>https://adrianmath-telegram-math-bot.fly.dev/api/mark-inbox</code><br />
                <span style={{ color: '#b45309' }}>(the bot&apos;s address, NOT adrianmathtuition.com — Vercel rejects bodies over 4.5MB before our code runs, and scans are bigger)</span><br />
                Method: <b>POST</b> · Headers: add <code>Authorization</code> = <code>Bearer {inboxToken === null ? '…' : (inboxToken || '(token not configured)')}</code><br />
                Optional 2nd header, keeps the original filename: <code>x-file-name</code> = insert the <b>Shortcut Input</b> variable, tap the token, set its type to <b>Name</b> (otherwise files arrive as <code>shared.pdf</code>)<br />
                <span style={{ color: '#b45309' }}>⚠ WhatsApp strips the real filename BEFORE Shortcuts sees it — documents arrive as a temp file literally named &quot;shared&quot;, so the header alone can&apos;t recover it. Fix: add an <b>Ask for Input</b> action (type Text, prompt &quot;Paper name?&quot;, Default Answer = Shortcut Input ▸ Name) BEFORE Get Contents of URL, and set <code>x-file-name</code> = <b>Provided Input</b> instead — you confirm or type the name in one tap at share time. Files shared from the Files app keep their real names either way.</span><br />
                Request Body: <b>File</b> → <b>Shortcut Input</b>.</li>
              <li>Add <b>Show Notification</b> after it, with the body set to the <b>Contents of URL</b> magic variable — the notification then shows the server&apos;s real answer (<code>{'{"ok":true…}'}</code> or the error), not blind optimism.</li>
              <li><b>Optional — choose Working vs Question paper at share time:</b> add a <b>Choose from Menu</b> action (prompt <code>Attach as?</code>, items <b>Working</b> and <b>Question paper</b>) BEFORE Get Contents of URL. Inside the <b>Working</b> item add <b>Text</b> = <code>working</code> then <b>Set Variable</b> <code>kind</code>; inside <b>Question paper</b> add <b>Text</b> = <code>paper</code> then <b>Set Variable</b> <code>kind</code>. Then in Get Contents of URL add a 3rd header: <code>x-file-kind</code> = the <code>kind</code> variable. Tagged files show up in the banner with the right attach button up front; without this step nothing changes — you pick on the page as before.</li>
            </ol>
            <div style={{ marginTop: 6, color: '#6b7280' }}>Then in any share sheet: tap the file → Share → <b>✍️ Mark paper</b> (it appears in the actions list — favourite it via Edit Actions to pin it near the top). Files land in a &quot;📥 From your iPad&quot; banner at the top of this page.</div>
          </div>
        </details>
      </div>

      {/* (matching/confirm step removed — direct marking marks every photo against the PDF) */}

      {/* Results */}
      {phase === 'done' && results && (
        <div ref={resultsRef} style={card}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 10, display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <span>Result: {totals?.awarded ?? 0}/{totals?.max ?? 0}</span>
            {loadedName && <span style={{ fontSize: 13, fontWeight: 500, color: '#6b7280' }}>🗂️ loaded: {loadedName}</span>}
          </h2>
          {results.map((r, i) => (
            <div key={i} style={{ padding: '10px 0', borderTop: i ? '1px solid #f3f4f6' : 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <strong>Q{r.question_number}</strong>
                <span>{r.marking?.total_awarded ?? 0}/{r.marking?.total_max ?? 0}</span>
              </div>
              {(r.marking?.parts || []).map((p, j) => (
                <div key={j} style={{ fontSize: 13, color: p.error_summary ? '#b91c1c' : '#15803d', marginLeft: 8 }}>
                  {p.label ? `${p.label} ` : ''}{p.awarded ?? 0}/{p.max ?? 0} — <MathText text={p.error_summary || 'Correct'} />
                </div>
              ))}
              {r.marking?.overall_comment && <div style={{ fontSize: 13, color: '#374151', marginTop: 4 }}><MathText text={r.marking.overall_comment} /></div>}
              {r.review_recommended && (
                <div style={{ fontSize: 12, color: '#b45309', marginTop: 4 }}>⚠ {(r.review_reasons || []).join(' · ')}</div>
              )}
            </div>
          ))}
          {unattempted.length > 0 && (
            <div style={{ fontSize: 13, color: '#6b7280', marginTop: 10 }}>Not attempted: {unattempted.map((n) => `Q${n}`).join(', ')}</div>
          )}
          {coarsePhotos.length > 0 && (
            /* Why a page can come back with no ticks on it. The overlay tries per-LINE
               marks first and drops to one coarse mark per question when it can't trust
               where the lines are — dense, angled or two-page-per-photo working. Saying
               so is the difference between "the marker skipped my page" and "photograph
               that page again" (Adrian, Jul 2026: "is it because the working is messy?"). */
            <div style={{ fontSize: 13, color: '#b45309', marginTop: 10 }}>
              ✎ No per-line ticks on photo{coarsePhotos.length > 1 ? 's' : ''} {coarsePhotos.map((p) => p.photo_index + 1).join(', ')} — the working was too dense or slanted to place them line by line, so {coarsePhotos.length > 1 ? 'those pages' : 'that page'} got one mark and a boxed score per question instead. Marks are unaffected. A straighter, closer photo of one page at a time usually gets the ticks back.
            </div>
          )}
          <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            {annotatedPhotos.length > 0 && (
              <button style={{ ...btn, opacity: generating ? 0.6 : 1 }} disabled={generating} onClick={generateBoth}>
                {bothStage === 'images' ? '🖼 Building images…' : bothStage === 'full' ? '📄 Building full…' : generating ? 'Generating…' : '⚡ Generate both'}
              </button>
            )}
            <button style={{ ...btn, background: '#374151', opacity: generating ? 0.6 : 1 }} disabled={generating} onClick={() => generateMarked('full')}>
              {generating && !bothStage ? 'Generating…' : '📄 Full only'}
            </button>
            {annotatedPhotos.length > 0 && (
              <button style={{ ...btn, background: '#374151', opacity: generating ? 0.6 : 1 }} disabled={generating} onClick={() => generateMarked('photos')}>
                {generating && !bothStage ? '…' : '🖼️ Images only'}
              </button>
            )}
            {runId && (
              <button
                style={{ ...btn, background: '#4338ca', opacity: generating || busy ? 0.6 : 1 }}
                disabled={generating || busy}
                title="Mark this paper again from its stored photos — full marking cost"
                onClick={remarkPaper}
              >
                🔁 Re-mark
              </button>
            )}
            {marked.map((m) => (
              <a
                key={m.label}
                href={downloadHref(m.url, sendFilename, true)}
                target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb', fontWeight: 600 }}
              >
                {m.label} ↗
              </a>
            ))}
            {/* The images link is already up while this shows — the point of "both". */}
            {bothStage === 'full' && marked.length > 0 && (
              <span style={{ color: '#6b7280', fontSize: 13 }}>📄 full PDF still building…</span>
            )}
            <span style={{ color: '#6b7280', fontSize: 13 }}>Both = images PDF ready in seconds, full follows (it typesets a sheet per question). Fresh build every click.</span>
          </div>
          {/* Send / save — the no-amendments fast path. Download feeds the drag-into-
              WhatsApp move on the Mac (personal number); email goes straight out. The
              panel is also the DROP TARGET for the Notability round trip (Split View). */}
          {sendPdf && (
            <div
              onDragOver={(e) => { e.preventDefault(); }}
              onDrop={(e) => { e.preventDefault(); uploadAnnotated(e.dataTransfer.files?.[0]); }}
              style={{ marginTop: 14, padding: 12, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}
            >
              <span style={{ fontWeight: 600, fontSize: 14 }}>📤 Sending: {sendPdf.label.replace(' ↗', '')}</span>
              <input
                type="text"
                value={paperName}
                onChange={(e) => setPaperName(e.target.value)}
                placeholder="Paper name (e.g. Zhonghua Prelim AM P1)"
                style={{ padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, minWidth: 230 }}
              />
              <a
                href={downloadHref(sendPdf.url, sendFilename, false)}
                style={{ ...btn, background: '#374151', textDecoration: 'none', fontSize: 14, padding: '8px 14px' }}
              >
                ⬇ Download for WhatsApp
              </a>
              <select
                value={sendStudentId}
                onFocus={loadStudents}
                onChange={(e) => pickSendStudent(e.target.value)}
                style={{ padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, background: 'white' }}
              >
                <option value="">Student…</option>
                {(students || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <input
                type="email"
                value={sendEmail}
                onChange={(e) => { setSendEmail(e.target.value); setSendNote(null); }}
                onBlur={() => {
                  // Save the address the moment it's typed — waiting for a successful
                  // send meant a failed send also lost the address.
                  const em = sendEmail.trim();
                  if (!sendRemember || !sendStudentId || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) return;
                  fetch('/api/admin/mark-paper-send', {
                    method: 'PUT', headers: authHeaders,
                    body: JSON.stringify({ studentId: sendStudentId, email: em }),
                  }).then(async (r) => {
                    const d = await r.json().catch(() => ({}));
                    if (r.ok && d.saved) setSendNote({ ok: true, text: `Address saved for ${sendStudentName}` });
                    else if (d.hint) setSendNote({ ok: false, text: d.hint });
                  }).catch(() => {});
                }}
                placeholder="student@email.com"
                style={{ padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, minWidth: 210 }}
              />
              <label style={{ fontSize: 12, color: '#6b7280', display: 'flex', alignItems: 'center', gap: 4 }}>
                <input type="checkbox" checked={sendRemember} onChange={(e) => setSendRemember(e.target.checked)} /> remember
              </label>
              <button style={{ ...btn, opacity: sendBusy ? 0.6 : 1, fontSize: 14, padding: '8px 14px' }} disabled={sendBusy} onClick={sendMarkedEmail}>
                {sendBusy ? 'Sending…' : '✉️ Email PDF'}
              </button>
              {/* ✏️ Annotate: write on the marked pages right here (Apple Pencil, iPad
                  Safari) — Done bakes the ink into the annotated PDF. The Notability
                  round trip below stays as the fallback; both write the same
                  annotated_pdf_url slot, last write wins. */}
              {runId && annotatedPhotos.length > 0 && (
                <button
                  style={{ ...btn, background: '#0d9488', fontSize: 14, padding: '8px 14px' }}
                  onClick={() => setAnnotateOpen(true)}
                >
                  ✏️ Annotate
                </button>
              )}
              {/* Notability return leg: pick the exported PDF, or drag it anywhere onto
                  this panel from Split View. Needs a run to attach to. */}
              {runId && (
                <>
                  <input ref={annotatedInputRef} type="file" accept="application/pdf,.pdf" style={{ display: 'none' }} onChange={(e) => uploadAnnotated(e.target.files?.[0])} />
                  <button
                    style={{ ...btn, background: '#7c3aed', opacity: annotatedBusy ? 0.6 : 1, fontSize: 14, padding: '8px 14px' }}
                    disabled={annotatedBusy}
                    onClick={() => annotatedInputRef.current?.click()}
                  >
                    {annotatedBusy ? 'Uploading…' : '✍️ Upload annotated'}
                  </button>
                </>
              )}
              {sendNote && (
                <span style={{ fontSize: 13, color: sendNote.ok ? '#15803d' : '#b91c1c' }}>{sendNote.ok ? '✓ ' : '✗ '}{sendNote.text}</span>
              )}
            </div>
          )}
          {/* 📝 Practice questions — opt-in, one per question that dropped marks. */}
          {runId && wrongCount > 0 && !practiceItems && (
            <div style={{ marginTop: 14 }}>
              <button style={{ ...btn, background: '#b45309', opacity: practiceBusy ? 0.6 : 1 }} disabled={practiceBusy} onClick={loadPractice}>
                {practiceBusy ? 'Finding practice questions…' : `📝 Practice questions (${wrongCount} wrong)`}
              </button>
              <span style={{ marginLeft: 10, color: '#6b7280', fontSize: 13 }}>One per wrong question — from the question bank when it has a match, freshly written when it doesn&rsquo;t. Takes ~a minute.</span>
            </div>
          )}
          {practiceItems && (
            <div style={{ marginTop: 14, padding: 12, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10 }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>📝 Practice — one question per dropped-marks question</div>
              {practiceItems.map((it, i) => (
                <div key={i} style={{ padding: '10px 0', borderTop: i ? '1px solid #fef3c7' : 'none' }}>
                  <div style={{ fontSize: 12, color: '#92400e', fontWeight: 700, marginBottom: 4 }}>
                    For Q{it.for}
                    {it.topic ? ` · ${it.topic}` : ''}
                    {it.origin ? ` · ${it.origin}` : it.source === 'generated' ? ' · written for this error' : ''}
                  </div>
                  <div style={{ fontSize: 14, whiteSpace: 'pre-wrap' }}><MathText text={it.question} /></div>
                  {it.answer && (
                    <div style={{ fontSize: 13, color: '#b45309', marginTop: 6 }}>Ans: <MathText text={it.answer} /></div>
                  )}
                  {it.note && <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4, fontStyle: 'italic' }}><MathText text={it.note} /></div>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {usage && (
        <div style={{ color: '#6b7280', fontSize: 12 }}>
          💰 ${(usage.costUsd ?? 0).toFixed(4)} · ⏱ {usage.timeSec ?? 0}s · {(usage.inputTokens ?? 0) + (usage.outputTokens ?? 0)} tokens{usage.model ? ` · 🧠 ${usage.model}` : ''}
        </div>
      )}

      {lightbox && (
        <div onClick={() => setLightbox(null)} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out', padding: 20 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="enlarged working" style={{ maxWidth: '95%', maxHeight: '95%', objectFit: 'contain', borderRadius: 8 }} />
        </div>
      )}

      {annotateOpen && runId && annotatedPhotos.length > 0 && (
        <AnnotateOverlay
          runId={runId}
          // Annotate the WITH-SOLUTIONS copy: the output replaces the 🖼 images PDF,
          // whose footer is the only surface carrying the worked solution (see
          // lib/annotated-photo-source.ts).
          pages={annotatedPhotos.map((p) => ({ photoIndex: p.photo_index, url: pickAnnotatedPhotoUrl(p, 'photos') }))}
          student={{ name: sendStudentName, level: '' }}
          totals={totals}
          onClose={() => setAnnotateOpen(false)}
          onDone={({ url, linked }) => {
            setAnnotateOpen(false);
            // Same list update as uploadAnnotated: the ✍️ copy takes the front slot,
            // so Download and Email switch to it immediately.
            setMarked((prev) => [{ url, kind: 'pdf', label: '✍️ Annotated PDF' }, ...prev.filter((m) => !m.label.startsWith('✍️'))]);
            setSendNote(linked
              ? { ok: true, text: 'Annotated PDF attached — Download and Email now use it.' }
              : { ok: false, text: 'Annotated PDF built (usable this session), but linking it to the run failed — hit Done again later to relink.' });
            loadStats();
          }}
        />
      )}
    </div>
  );
}
