'use client';

// ✂️ Save to My Notebook — the clipper on a marked paper (Adrian, 2026-08-27:
// "on the output marked pdf -> able for students to save parts of it as notes
// -> for reference later").
//
// A client island inside the server-rendered /app/marking page: tapping the
// button opens a full-screen overlay showing the annotated page images
// (StudentPaper.pages ← result_json.annotated_photos), the student drags a
// rectangle over the page — pointer events + `touch-none`, so a finger drag
// draws instead of scrolling — and the crop happens client-side on a canvas.
//
// Cross-origin note: the page images are public Vercel Blob JPEGs served with
// `access-control-allow-origin: *` (verified 2026-08-28), so loading them with
// crossOrigin="anonymous" keeps the canvas untainted and toDataURL legal. No
// same-origin proxy needed; the try/catch below is the belt-and-braces if a
// browser still refuses.
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';

interface Page {
  index: number;
  url: string;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// Client-side guards against the platform's 4.5MB body cap: crops render at
// most this many pixels on the long edge, and a PNG that still encodes huge
// (dense photographic regions) gets one shrink-and-retry before we give up.
const MAX_EDGE = 1600;
const MAX_DATA_URL = 3_600_000;
const MIN_DRAG_PX = 12;

export default function ClipToNotes({ runId, paperName, pages }: {
  runId: string;
  paperName: string;
  pages: Page[];
}) {
  const [open, setOpen] = useState(false);
  const [pageIdx, setPageIdx] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);

  // The page behind the overlay must not scroll under a finger that is
  // drawing a rectangle.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  const reset = useCallback((toPage?: number) => {
    setRect(null);
    setError(null);
    setSaved(false);
    if (typeof toPage === 'number') setPageIdx(toPage);
  }, []);

  if (pages.length === 0) return null;
  const page = pages[Math.min(pageIdx, pages.length - 1)];

  function pos(e: React.PointerEvent): { x: number; y: number } {
    const el = surfaceRef.current!;
    const r = el.getBoundingClientRect();
    return {
      x: Math.min(Math.max(e.clientX - r.left, 0), r.width),
      y: Math.min(Math.max(e.clientY - r.top, 0), r.height),
    };
  }

  function onPointerDown(e: React.PointerEvent) {
    if (saving) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const p = pos(e);
    dragStart.current = p;
    setSaved(false);
    setError(null);
    setRect({ x: p.x, y: p.y, w: 0, h: 0 });
  }

  function onPointerMove(e: React.PointerEvent) {
    const start = dragStart.current;
    if (!start) return;
    e.preventDefault();
    const p = pos(e);
    setRect({
      x: Math.min(start.x, p.x),
      y: Math.min(start.y, p.y),
      w: Math.abs(p.x - start.x),
      h: Math.abs(p.y - start.y),
    });
  }

  function onPointerUp() {
    if (!dragStart.current) return;
    dragStart.current = null;
    setRect(r => (r && r.w >= MIN_DRAG_PX && r.h >= MIN_DRAG_PX ? r : null));
  }

  async function save() {
    const img = imgRef.current;
    if (!img || !rect || saving) return;
    setSaving(true);
    setError(null);
    try {
      // Displayed-pixel rectangle → natural-pixel crop.
      const scaleX = img.naturalWidth / img.clientWidth;
      const scaleY = img.naturalHeight / img.clientHeight;
      const sx = rect.x * scaleX;
      const sy = rect.y * scaleY;
      const sw = Math.max(1, rect.w * scaleX);
      const sh = Math.max(1, rect.h * scaleY);

      const render = (outScale: number): string => {
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(sw * outScale));
        canvas.height = Math.max(1, Math.round(sh * outScale));
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('no canvas context');
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
        // Throws a SecurityError if the image somehow tainted the canvas.
        return canvas.toDataURL('image/png');
      };

      let scale = Math.min(1, MAX_EDGE / Math.max(sw, sh));
      let dataUrl = render(scale);
      if (dataUrl.length > MAX_DATA_URL) {
        // PNG of a dense photo region can still be huge — shrink once.
        scale *= Math.sqrt(MAX_DATA_URL / dataUrl.length) * 0.9;
        dataUrl = render(scale);
      }
      if (dataUrl.length > MAX_DATA_URL) {
        throw new Error('That selection is too large to save — try a smaller box.');
      }

      const res = await fetch('/api/portal/my-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId, sourceLabel: paperName, note: note.trim(), image: dataUrl }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((body as { error?: string }).error || `HTTP ${res.status}`);

      setRect(null);
      setNote('');
      setSaved(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(
        /security|tainted/i.test(msg)
          ? "Couldn't read the page image on this device — try the PDF instead."
          : msg,
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => { reset(0); setOpen(true); }}
        className="inline-block text-sm font-semibold text-navy border border-navy/20 rounded-xl px-4 py-2 hover:bg-navy/5 transition-colors"
      >
        ✂️ Save to My Notebook
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/85 flex flex-col" role="dialog" aria-label="Save part of this paper to My Notebook">
          {/* Header */}
          <div className="flex items-center justify-between gap-3 px-4 py-3 text-white shrink-0">
            <p className="text-sm font-semibold truncate">✂️ {paperName}</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="shrink-0 text-2xl leading-none px-2 py-1 text-white/80 hover:text-white"
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          {/* Page area */}
          <div className="flex-1 min-h-0 overflow-auto px-3 pb-2 flex items-center justify-center">
            <div
              ref={surfaceRef}
              className="relative inline-block touch-none select-none cursor-crosshair"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary-size Blob image drawn to a canvas; next/image would re-proxy and break the CORS crop */}
              <img
                ref={imgRef}
                src={page.url}
                crossOrigin="anonymous"
                alt={`Marked page ${pageIdx + 1}`}
                draggable={false}
                className="block max-w-full max-h-[64vh] w-auto h-auto rounded-lg bg-white pointer-events-none"
                onError={() => setError("Couldn't load this page image.")}
              />
              {rect && (
                <div
                  className="absolute border-2 border-amber-400 bg-amber-300/15 rounded-sm pointer-events-none"
                  style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
                />
              )}
            </div>
          </div>

          {/* Pager */}
          {pages.length > 1 && (
            <div className="flex items-center justify-center gap-4 pb-2 text-white/90 text-sm shrink-0">
              <button
                type="button"
                onClick={() => reset(Math.max(0, pageIdx - 1))}
                disabled={pageIdx === 0}
                className="px-3 py-1.5 rounded-lg bg-white/10 disabled:opacity-30"
                aria-label="Previous page"
              >
                ‹
              </button>
              <span>Page {pageIdx + 1} of {pages.length}</span>
              <button
                type="button"
                onClick={() => reset(Math.min(pages.length - 1, pageIdx + 1))}
                disabled={pageIdx === pages.length - 1}
                className="px-3 py-1.5 rounded-lg bg-white/10 disabled:opacity-30"
                aria-label="Next page"
              >
                ›
              </button>
            </div>
          )}

          {/* Footer: hint → save bar → saved */}
          <div className="shrink-0 bg-white rounded-t-2xl p-4 space-y-2.5" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
            {error && <p className="text-sm text-rose-700">{error}</p>}
            {saved ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-emerald-700">✅ Saved to My Notebook</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => reset()}
                    className="text-sm font-semibold text-navy border border-navy/20 rounded-xl px-3.5 py-2 hover:bg-navy/5"
                  >
                    ✂️ Clip another
                  </button>
                  <Link
                    href="/app/my-notes"
                    className="text-sm font-semibold bg-navy text-[hsl(45,100%,96%)] rounded-xl px-3.5 py-2 hover:opacity-90"
                  >
                    View My Notebook ›
                  </Link>
                </div>
              </div>
            ) : rect ? (
              <>
                <input
                  type="text"
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  maxLength={300}
                  placeholder="Add a note (optional)"
                  className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-navy/20"
                />
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-gray-400">Drag again to redo the box.</p>
                  <button
                    type="button"
                    onClick={save}
                    disabled={saving}
                    className="shrink-0 text-sm font-semibold bg-navy text-[hsl(45,100%,96%)] rounded-xl px-4 py-2 hover:opacity-90 disabled:opacity-50"
                  >
                    {saving ? 'Saving…' : '💾 Save selection'}
                  </button>
                </div>
              </>
            ) : (
              <p className="text-sm text-gray-600">
                Drag a box around the part you want to keep — a worked correction, a red-pen
                comment, anything worth coming back to.
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
