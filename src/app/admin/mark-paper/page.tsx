'use client';

import { useState, useRef, useEffect, type CSSProperties } from 'react';
import { ensureAdminSession } from '@/lib/admin-client';

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
      // Render a little above the 1280px upload cap so the downscale has data to
      // work with — handwriting is the thing being read.
      const unit = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.min(3, 1600 / Math.max(unit.width, unit.height)) });
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
async function fileToUpload(file: File, maxEdge = 1280, quality = 0.72): Promise<{ base64: string; mediaType: string }> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    const out = canvas.toDataURL('image/jpeg', quality);
    return { base64: out.split(',')[1] || '', mediaType: 'image/jpeg' };
  } catch {
    const dataUrl = await readDataUrl(file);
    return { base64: dataUrl.split(',')[1] || '', mediaType: file.type || 'image/heic' };
  }
}

type MarkPart = { label?: string; awarded?: number; max?: number; error_summary?: string | null };
type Run = { id: string; created_at: string; paper_name?: string | null; total_awarded?: number | null; total_max?: number | null; cost_usd?: number | null; num_questions?: number | null; pdf_url?: string | null; photos_pdf_url?: string | null };
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

const card: CSSProperties = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, marginBottom: 16 };
const btn: CSSProperties = { padding: '10px 18px', borderRadius: 8, border: 'none', background: '#111827', color: '#fff', fontWeight: 600, cursor: 'pointer' };

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
  const [sendParentEmail, setSendParentEmail] = useState('');
  const [sendRemember, setSendRemember] = useState(true);
  const [sendBusy, setSendBusy] = useState(false);
  const [sendNote, setSendNote] = useState<{ ok: boolean; text: string } | null>(null);
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
      if (d.run.photos_pdf_url) kept.push({ url: d.run.photos_pdf_url, kind: 'pdf', label: '🖼 Images PDF' });
      if (d.run.pdf_url) kept.push({ url: d.run.pdf_url, kind: 'pdf', label: '📄 Full PDF' });
      setMarked(kept);
      setPhase('done');
      if (historyRef.current) historyRef.current.open = false;
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
    } catch (e) { setError((e as Error).message); }
    finally { setLoadingRun(''); }
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

  // Single-pass: mark every photo directly against the PDF (no extract/match/confirm step).
  async function markPaper() {
    if (images.length === 0) { setError('Add the student’s working first — photos, or a scanned PDF.'); return; }
    setError(''); setPhase('marking'); setResults(null); setTotals(null); setMarked([]); setLoadedName('');
    try {
      // PDF is optional — without it, photos are marked standalone (self-contained
      // worksheets where the printed questions are on the pages themselves).
      const pdfBase64 = pdf ? await pdfToBase64(pdf) : null;
      const imgs = await Promise.all(images.map((f) => fileToUpload(f)));
      const resp = await fetch('/api/admin/mark-paper', {
        method: 'POST', headers: authHeaders,
        body: JSON.stringify({ phase: 'direct', pdfBase64, images: imgs, paperName: pdf ? pdf.name : `worksheet (${images.length} photo${images.length === 1 ? '' : 's'})`, model: markModel, style: markStyle }),
      });
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
    if (!id) { setSendEmail(''); setSendParentEmail(''); return; }
    try {
      const r = await fetch(`/api/admin/mark-paper-send?studentId=${id}`, { headers: authHeaders });
      const d = await r.json();
      if (r.ok) { setSendEmail(d.studentEmail || ''); setSendParentEmail(d.parentEmail || ''); }
    } catch { /* prefill is best-effort */ }
  }
  // The copy Adrian hands back: images when it exists (his default), else whatever there is.
  const sendPdf = marked.find((m) => m.label.startsWith('🖼')) || marked[0] || null;
  const scoreStr = totals ? `${totals.awarded}-${totals.max}` : '';
  const sendFilename = [sendStudentName, loadedName || 'Marked paper', scoreStr].filter(Boolean).join(' — ') + '.pdf';
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
          paperLabel: loadedName || 'your paper', score: totals ? `${totals.awarded}/${totals.max}` : '',
          studentName: sendStudentName,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Send failed');
      setSendNote({ ok: true, text: `Delivered to ${sendEmail.trim()}${d.emailSaved ? ' · address saved' : ''}${d.saveHint ? ` · ${d.saveHint}` : ''}` });
    } catch (e) { setSendNote({ ok: false, text: (e as Error).message }); }
    finally { setSendBusy(false); }
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
                <span style={{ flex: 1, minWidth: 120, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{run.paper_name || 'Paper'}</span>
                <span style={{ color: '#374151' }}>{run.total_awarded ?? 0}/{run.total_max ?? 0}</span>
                <span style={{ color: '#9ca3af' }}>${(run.cost_usd ?? 0).toFixed(3)}</span>
                {run.pdf_url && <a href={run.pdf_url} target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb' }}>PDF ↗</a>}
                {run.photos_pdf_url && <a href={run.photos_pdf_url} target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb' }}>Images ↗</a>}
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
                  {p.label ? `${p.label} ` : ''}{p.awarded ?? 0}/{p.max ?? 0} — {p.error_summary || 'Correct'}
                </div>
              ))}
              {r.marking?.overall_comment && <div style={{ fontSize: 13, color: '#374151', marginTop: 4 }}>{r.marking.overall_comment}</div>}
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
            {marked.map((m) => (
              <a key={m.label} href={m.url} target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb', fontWeight: 600 }}>
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
              WhatsApp move on the Mac (personal number); email goes straight out. */}
          {sendPdf && (
            <div style={{ marginTop: 14, padding: 12, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>📤 {sendPdf.label.replace(' ↗', '')}:</span>
              <a
                href={`/api/admin/mark-paper-download?url=${encodeURIComponent(sendPdf.url)}&name=${encodeURIComponent(sendFilename)}`}
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
                placeholder="student@email.com"
                style={{ padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, minWidth: 210 }}
              />
              {sendParentEmail && sendEmail !== sendParentEmail && (
                <button style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: 12, cursor: 'pointer', padding: 0 }} onClick={() => setSendEmail(sendParentEmail)}>
                  use parent&apos;s: {sendParentEmail}
                </button>
              )}
              <label style={{ fontSize: 12, color: '#6b7280', display: 'flex', alignItems: 'center', gap: 4 }}>
                <input type="checkbox" checked={sendRemember} onChange={(e) => setSendRemember(e.target.checked)} /> remember
              </label>
              <button style={{ ...btn, opacity: sendBusy ? 0.6 : 1, fontSize: 14, padding: '8px 14px' }} disabled={sendBusy} onClick={sendMarkedEmail}>
                {sendBusy ? 'Sending…' : '✉️ Email PDF'}
              </button>
              {sendNote && (
                <span style={{ fontSize: 13, color: sendNote.ok ? '#15803d' : '#b91c1c' }}>{sendNote.ok ? '✓ ' : '✗ '}{sendNote.text}</span>
              )}
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
    </div>
  );
}
