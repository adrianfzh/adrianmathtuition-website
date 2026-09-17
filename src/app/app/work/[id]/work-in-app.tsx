'use client';
// ✍️ Do a sheet in the app (17 Sep 2026): PDF → page images in the browser
// (lib/pdf-pages, the same rasteriser the hand-in uses), the student's ink as
// a layer, the Pencil overlay in student mode, progress saved to
// /api/portal/work/ink, and Submit = flatten each page (image + ink) → upload
// through the hand-in's own signed-upload door → POST /api/portal/submit with
// the assignment id, exactly what the photo hand-in posts.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { pdfToPageImages } from '@/lib/pdf-pages';
import { uploadStudentFile } from '@/lib/student-files-client';
import { portalFetch, portalMessage } from '@/lib/portal-fetch';
import { strokesToSvg } from '@/lib/annotate/layer';
import { inkIsEmpty, inkStrokes, type InkPages } from '@/lib/student-ink';
import type { Stroke } from '@/lib/annotate/types';

const AnnotateOverlay = dynamic(() => import('@/components/AnnotateOverlay'), { ssr: false });

type PageImg = { index: number; url: string; file: File };

export default function WorkInApp({ assignmentId, title, pdfUrl, initial }: { assignmentId: string; title: string; pdfUrl: string; initial: InkPages | null }) {
  const router = useRouter();
  const [pages, setPages] = useState<PageImg[] | null>(null);
  const [progress, setProgress] = useState('Opening the sheet…');
  const [ink, setInk] = useState<InkPages>(initial ?? {});
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const urlsRef = useRef<string[]>([]);

  // The PDF → one image per page, kept in memory as object URLs.
  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const r = await fetch(pdfUrl);
        if (!r.ok) throw new Error(`The sheet could not be opened (HTTP ${r.status}).`);
        const blob = await r.blob();
        const file = new File([blob], `${title || 'sheet'}.pdf`, { type: 'application/pdf' });
        const imgs = await pdfToPageImages(file, (done, total) => { if (!dead) setProgress(`Preparing page ${done} of ${total}…`); });
        if (dead) return;
        const out = imgs.map((f, i) => { const u = URL.createObjectURL(f); urlsRef.current.push(u); return { index: i, url: u, file: f }; });
        setPages(out);
      } catch (e) { if (!dead) setErr((e as Error).message || 'The sheet could not be opened.'); }
    })();
    return () => { dead = true; urlsRef.current.forEach(u => URL.revokeObjectURL(u)); urlsRef.current = []; };
  }, [pdfUrl, title]);

  const overlayPages = useMemo(() => (pages ?? []).map(p => ({ photoIndex: p.index, url: p.url })), [pages]);
  const initialStrokes = useMemo(() => inkStrokes(ink), [ink]);

  const save = useCallback(async (next: Record<number, { strokes: Stroke[]; w: number; h: number }>) => {
    await portalFetch('/api/portal/work/ink', { json: { assignmentId, pages: next, pageCount: pages?.length ?? null }, fallback: 'save your work' });
    setInk(next);
  }, [assignmentId, pages]);

  // Submit: every page (inked or not) flattened to a JPEG → uploaded → handed in.
  async function submit() {
    if (!pages) return;
    if (inkIsEmpty(ink)) { setErr('Nothing written yet — write on the pages first, then Submit.'); return; }
    if (!window.confirm('Submit this sheet for marking? You will not be able to change it after this.')) return;
    setErr(null);
    try {
      const urls: string[] = [];
      for (const p of pages) {
        setStage(`Preparing page ${p.index + 1} of ${pages.length}…`);
        const layer = ink[p.index];
        let upload: Blob = p.file;
        if (layer && layer.strokes.length) {
          const img = await new Promise<HTMLImageElement>((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('page image failed')); im.src = p.url; });
          const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
          const ctx = c.getContext('2d')!;
          ctx.drawImage(img, 0, 0);
          // The ink was drawn at the page's own size; scale if the render differs.
          const sx = c.width / layer.w, sy = c.height / layer.h;
          ctx.save(); ctx.scale(sx, sy);
          drawStrokes(ctx, layer.strokes);
          ctx.restore();
          const blob: Blob | null = await new Promise(res => c.toBlob(res, 'image/jpeg', 0.92));
          if (!blob) throw new Error(`Page ${p.index + 1} could not be prepared.`);
          upload = blob;
        }
        setStage(`Uploading page ${p.index + 1} of ${pages.length}…`);
        let url: string | null = null;
        for (let attempt = 1; attempt <= 3 && !url; attempt++) {
          try {
            const up = await uploadStudentFile(`/api/portal/submit-token?filename=${encodeURIComponent(`work-p${p.index + 1}.jpg`)}`, upload, { contentType: 'image/jpeg' });
            url = up.url;
          } catch { if (attempt < 3) await new Promise(r => setTimeout(r, attempt * 1000)); }
        }
        if (!url) throw new Error(`Page ${p.index + 1} would not upload after three tries — your work is kept, tap Submit again.`);
        urls.push(url);
      }
      setStage('Sending to Adrian…');
      const d = await portalFetch<{ runId?: string }>('/api/portal/submit', { json: { photoUrls: urls, paperName: title, assignmentId }, fallback: 'send the sheet' });
      try { localStorage.removeItem(`annotate-draft:v1:student:work:${assignmentId}`); } catch { /* ignore */ }
      setStage('Sent ✓');
      router.replace(d?.runId ? '/app/marking' : '/app/marking');
    } catch (e) { setStage(null); setErr(portalMessage(e)); }
  }

  if (err && !pages) return <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-2xl px-4 py-3">{err}</p>;
  if (!pages) return <p className="text-sm text-gray-500 px-1">{progress}</p>;
  const hasInk = !inkIsEmpty(ink);
  return (
    <section className="space-y-3" data-work-in-app>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs text-gray-500 mr-auto">{pages.length} page{pages.length === 1 ? '' : 's'}{hasInk ? ' · your work is saved' : ''}</p>
        <button type="button" onClick={() => setOpen(true)} disabled={!!stage} className="text-xs font-bold text-white bg-navy rounded-xl px-3 py-1.5 shadow-sm disabled:opacity-50">✍️ Write</button>
        <button type="button" onClick={submit} disabled={!hasInk || !!stage} className="text-xs font-bold text-white bg-teal-600 rounded-xl px-3 py-1.5 shadow-sm disabled:opacity-50">{stage ?? 'Submit for marking'}</button>
      </div>
      {err && <p className="text-[12px] text-rose-700">{err}</p>}
      {pages.map(p => {
        const layer = ink[p.index];
        return (
          <div key={p.index} className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.url} alt={`Page ${p.index + 1}`} className="w-full rounded-2xl border border-black/5 bg-white block" />
            {layer && layer.strokes.length > 0 && (
              <svg viewBox={`0 0 ${layer.w} ${layer.h}`} className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden dangerouslySetInnerHTML={{ __html: strokesToSvg(layer.strokes) }} />
            )}
          </div>
        );
      })}
      {open && (
        <AnnotateOverlay runId={`work:${assignmentId}`} pages={overlayPages} student={{ name: '', level: '' }} totals={null}
          mode="student" initialInk={initialStrokes} onSaveInk={save} onDone={() => setOpen(false)} onClose={() => setOpen(false)} />
      )}
    </section>
  );
}

/** The same two-pass paint the overlay uses: highlighter under, pen over. */
function drawStrokes(ctx: CanvasRenderingContext2D, strokes: Stroke[]) {
  for (const pass of ['hl', 'pen'] as const) {
    for (const s of strokes) {
      if ((s.tool === 'highlighter') !== (pass === 'hl')) continue;
      if (!s.points.length) continue;
      ctx.save();
      ctx.strokeStyle = s.color; ctx.lineWidth = s.width; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      if (s.tool === 'highlighter') { ctx.globalAlpha = 0.38; ctx.globalCompositeOperation = 'multiply'; }
      ctx.beginPath();
      s.points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();
      ctx.restore();
    }
  }
}
