'use client';
// ✍️ The student's own notes on their marked pages (17 Sep 2026,
// SPEC-STUDENT-FIRST §12). The marked pages render here with the student's
// ink as an SVG layer over each image; "Write on my paper" opens the same
// Pencil overlay Adrian uses, in student mode; Save posts the strokes to
// /api/portal/marking/ink. The marked copy underneath is never changed —
// "Hide my notes" shows the original, "Clear my notes" empties the layer.
import { useCallback, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { fileHref } from '@/lib/student-files-url';
import { portalFetch, portalMessage } from '@/lib/portal-fetch';
import { strokesToSvg } from '@/lib/annotate/layer';
import { inkIsEmpty, inkStrokes, type InkPages } from '@/lib/student-ink';
import type { Stroke } from '@/lib/annotate/types';

// The overlay is ~2.5k lines of pen code — loaded only when they tap Write.
const AnnotateOverlay = dynamic(() => import('@/components/AnnotateOverlay'), { ssr: false });

export type InkPageInput = { index: number; url: string; overflow?: true };

export default function StudentInk({ runId, pages, initial }: { runId: string; pages: InkPageInput[]; initial: InkPages | null }) {
  const [ink, setInk] = useState<InkPages>(initial ?? {});
  const [show, setShow] = useState(true);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const hasInk = !inkIsEmpty(ink);

  // Only whole pages carry ink (an overflow sheet is the marker's own page, index n.5).
  const inkable = useMemo(() => pages.filter(p => Number.isInteger(p.index)), [pages]);
  const overlayPages = useMemo(() => inkable.map(p => ({ photoIndex: p.index, url: fileHref(p.url) })), [inkable]);
  const initialStrokes = useMemo(() => inkStrokes(ink), [ink]);

  const save = useCallback(async (next: Record<number, { strokes: Stroke[]; w: number; h: number }>) => {
    await portalFetch('/api/portal/marking/ink', { json: { runId, pages: next }, fallback: 'save your notes' });
    setInk(next);
  }, [runId]);

  async function clear() {
    if (!window.confirm('Clear your notes on every page of this paper? The marked copy stays as it is.')) return;
    setBusy(true); setErr(null);
    try { await save({}); try { localStorage.removeItem(`annotate-draft:v1:student:${runId}`); } catch { /* ignore */ } }
    catch (e) { setErr(portalMessage(e)); }
    finally { setBusy(false); }
  }

  const onDone = useCallback(() => setOpen(false), []);
  const onClose = useCallback(() => setOpen(false), []);

  return (
    <section aria-label="Marked pages" className="space-y-3" data-student-ink>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mr-auto">Your marked pages</h2>
        {hasInk && (
          <button type="button" onClick={() => setShow(s => !s)} className="text-xs font-semibold text-navy border border-navy/20 bg-white rounded-xl px-3 py-1.5">
            {show ? 'Hide my notes' : 'Show my notes'}
          </button>
        )}
        {hasInk && (
          <button type="button" onClick={clear} disabled={busy} className="text-xs font-semibold text-gray-500 underline underline-offset-2 disabled:opacity-50">Clear my notes</button>
        )}
        <button type="button" onClick={() => setOpen(true)} className="text-xs font-bold text-white bg-navy rounded-xl px-3 py-1.5 shadow-sm">
          ✍️ Write on my paper
        </button>
      </div>
      {err && <p className="text-[12px] text-rose-700">{err}</p>}
      {pages.map(p => {
        const layer = show ? ink[p.index] : undefined;
        return (
          <div key={p.index} className="relative" id={Number.isInteger(p.index) ? `page-${p.index}` : undefined}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={fileHref(p.url)} alt={p.overflow ? `Worked solution after page ${Math.floor(p.index) + 1}` : `Page ${p.index + 1}`} loading="lazy" className="w-full rounded-2xl border border-black/5 bg-white block" />
            {layer && layer.strokes.length > 0 && (
              <svg viewBox={`0 0 ${layer.w} ${layer.h}`} className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden
                dangerouslySetInnerHTML={{ __html: strokesToSvg(layer.strokes) }} />
            )}
          </div>
        );
      })}
      {open && (
        <AnnotateOverlay
          runId={runId} pages={overlayPages} student={{ name: '', level: '' }} totals={null}
          mode="student" initialInk={initialStrokes} onSaveInk={save} onDone={onDone} onClose={onClose}
        />
      )}
    </section>
  );
}
