'use client';
// ✍️ A blank answer box to write in with the Apple Pencil or a finger (learning loop,
// SPEC-LEARN-LOOP.md). The marked-paper pen (app/marking/StudentInk) writes over page
// pictures; a single question needs an empty page, so this is a small one of its own:
// pen, eraser, undo, clear, more space. Once a Pencil touches it, a finger scrolls
// instead of writing (palm on the glass). `toJpeg()` gives the picture the grader reads.
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';

type Pt = { x: number; y: number };
type Stroke = { pts: Pt[]; w: number };

export type AnswerPadHandle = {
  /** The writing as a JPEG data URL (white page, cropped to what was written), or null when empty. */
  toJpeg: () => string | null;
  isEmpty: () => boolean;
};

const PEN_W = 2.4;
const ERASE_R = 14;
const OUT_W = 1400;

function drawAll(ctx: CanvasRenderingContext2D, strokes: Stroke[], scale: number) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#111827';
  for (const s of strokes) {
    ctx.lineWidth = s.w * scale;
    ctx.beginPath();
    s.pts.forEach((p, i) => (i ? ctx.lineTo(p.x * scale, p.y * scale) : ctx.moveTo(p.x * scale, p.y * scale)));
    if (s.pts.length === 1) ctx.lineTo(s.pts[0].x * scale + 0.1, s.pts[0].y * scale);
    ctx.stroke();
  }
}

const AnswerPad = forwardRef<AnswerPadHandle, { onChange?: (empty: boolean) => void }>(function AnswerPad({ onChange }, ref) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen');
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(520);
  const [pencilSeen, setPencilSeen] = useState(false);
  const live = useRef<Stroke | null>(null);

  // Size to the column; redraw on any change.
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const redraw = useCallback(() => {
    const c = canvas.current;
    if (!c || !width) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(width * dpr);
    c.height = Math.round(height * dpr);
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, c.width, c.height);
    drawAll(ctx, live.current ? [...strokes, live.current] : strokes, dpr);
  }, [strokes, width, height]);
  useEffect(redraw, [redraw]);
  useEffect(() => { onChange?.(strokes.length === 0); }, [strokes, onChange]);

  const at = (e: React.PointerEvent): Pt => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  // A finger writes until a Pencil has been used; after that only the Pencil writes.
  const writes = (e: React.PointerEvent) => e.pointerType === 'pen' || e.pointerType === 'mouse' || !pencilSeen;

  const eraseAt = (p: Pt) => setStrokes(prev => prev.filter(s => !s.pts.some(q => Math.hypot(q.x - p.x, q.y - p.y) < ERASE_R)));

  function down(e: React.PointerEvent) {
    if (e.pointerType === 'pen' && !pencilSeen) setPencilSeen(true);
    if (!writes(e)) return;
    e.preventDefault();
    canvas.current!.setPointerCapture(e.pointerId);
    const p = at(e);
    if (tool === 'eraser') { eraseAt(p); live.current = { pts: [], w: 0 }; return; }
    live.current = { pts: [p], w: PEN_W };
    redraw();
  }
  function move(e: React.PointerEvent) {
    if (!live.current || !writes(e)) return;
    e.preventDefault();
    const p = at(e);
    if (tool === 'eraser') { eraseAt(p); return; }
    live.current.pts.push(p);
    redraw();
    // Write near the bottom → more room appears.
    if (p.y > height - 60) setHeight(h => h + 300);
  }
  function up() {
    const s = live.current;
    live.current = null;
    if (s && s.pts.length) setStrokes(prev => [...prev, s]);
  }

  useImperativeHandle(ref, () => ({
    isEmpty: () => strokes.length === 0,
    toJpeg: () => {
      if (!strokes.length || !width) return null;
      const all = strokes.flatMap(s => s.pts);
      const bottom = Math.min(height, Math.max(...all.map(p => p.y)) + 40);
      const scale = OUT_W / width;
      const c = document.createElement('canvas');
      c.width = OUT_W;
      c.height = Math.max(200, Math.round(bottom * scale));
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, c.width, c.height);
      drawAll(ctx, strokes, scale);
      return c.toDataURL('image/jpeg', 0.85);
    },
  }), [strokes, width, height]);

  const btn = (on: boolean) => `rounded-full px-3 py-1.5 text-[13px] font-semibold border ${on ? 'bg-navy text-white border-navy' : 'bg-white text-slate-700 border-slate-200'}`;
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <button type="button" className={btn(tool === 'pen')} onClick={() => setTool('pen')}>✏️ Pen</button>
        <button type="button" className={btn(tool === 'eraser')} onClick={() => setTool('eraser')}>🧽 Eraser</button>
        <button type="button" className={btn(false)} onClick={() => setStrokes(s => s.slice(0, -1))} disabled={!strokes.length}>↶ Undo</button>
        <button type="button" className={btn(false)} onClick={() => { if (window.confirm('Clear everything you wrote?')) setStrokes([]); }} disabled={!strokes.length}>Clear</button>
        <button type="button" className={btn(false)} onClick={() => setHeight(h => h + 400)}>＋ More space</button>
      </div>
      <div ref={wrap} className="rounded-xl border border-slate-200 bg-white overflow-hidden"
        style={{ backgroundImage: 'repeating-linear-gradient(to bottom, transparent 0, transparent 39px, #eef2f7 39px, #eef2f7 40px)' }}>
        <canvas
          ref={canvas}
          style={{ width: '100%', height, display: 'block', touchAction: pencilSeen ? 'pan-y' : 'none' }}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          aria-label="Write your working here"
        />
      </div>
      <p className="mt-1 text-[11px] text-slate-400">
        {pencilSeen ? 'Pencil writes · finger scrolls' : 'Write with your Apple Pencil or finger, one step a line.'}
      </p>
    </div>
  );
});

export default AnswerPad;
