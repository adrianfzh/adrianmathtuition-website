'use client';
// 🧑‍🏫 Photo stickers on one page of the shared board (SPEC-TUTOR-TOOLS §8; Adrian, 5 Nov 2026:
// "place a photo onto a page (stuck onto a PDF page like a sticker, which you can move and resize -
// like how notability does it)").
//
// Drawn over the page picture and UNDER the writing (StudentInk's `pageExtra` slot), so either
// person can write on top of a photo. In "Move photos" mode a photo takes the touch: drag it to
// move, drag the round corner to resize (it keeps its shape), ✕ removes it. The box is in the
// page's image pixels (lib/shared-board Sticker), so it sits in the same place on every screen.
import { useRef, useState } from 'react';
import { clampBox, resizeKeepShape, type Sticker } from '@/lib/shared-board';

export type ShownSticker = Sticker & { ref?: string };
type Box = { x: number; y: number; w: number; h: number };

export default function BoardStickers({ list, page, box, arrange, onMove, onCommit, onDelete }: {
  list: ShownSticker[]; page: number; box: { w: number; h: number }; arrange: boolean;
  /** While a finger drags (for the live view on the other screen) — throttled by the caller. */
  onMove: (id: string, b: Box) => void;
  /** The drag ended: save it. */
  onCommit: (id: string, b: Box) => void;
  onDelete: (id: string) => void;
}) {
  const mine = list.filter(s => s.page === page);
  const [drag, setDrag] = useState<{ id: string; b: Box } | null>(null);
  const start = useRef<{ id: string; kind: 'move' | 'size'; px: number; py: number; b: Box; scale: number } | null>(null);
  if (!mine.length) return null;

  const down = (e: React.PointerEvent, s: ShownSticker, kind: 'move' | 'size') => {
    if (!arrange) return;
    e.preventDefault(); e.stopPropagation();
    const host = (e.currentTarget as HTMLElement).closest('[data-sticker-layer]') as HTMLElement | null;
    const scale = (host?.clientWidth || box.w) / box.w;            // screen px per page px
    start.current = { id: s.id, kind, px: e.clientX, py: e.clientY, b: { x: s.x, y: s.y, w: s.w, h: s.h }, scale };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const move = (e: React.PointerEvent) => {
    const st = start.current; if (!st) return;
    const dx = (e.clientX - st.px) / st.scale, dy = (e.clientY - st.py) / st.scale;
    const b = clampBox(st.kind === 'move' ? { ...st.b, x: st.b.x + dx, y: st.b.y + dy } : resizeKeepShape(st.b, dx), box);
    setDrag({ id: st.id, b });
    onMove(st.id, b);
  };
  const up = () => {
    const st = start.current; start.current = null;
    if (st && drag && drag.id === st.id) onCommit(st.id, drag.b);
    setDrag(null);
  };

  return (
    <div data-sticker-layer className="absolute inset-0" style={{ pointerEvents: 'none' }}>
      {mine.map(s => {
        const b = drag?.id === s.id ? drag.b : s;
        const pct = { left: `${(b.x / box.w) * 100}%`, top: `${(b.y / box.h) * 100}%`, width: `${(b.w / box.w) * 100}%`, height: `${(b.h / box.h) * 100}%` };
        return (
          <div key={s.id} className={`absolute ${arrange ? 'ring-2 ring-sky-500 rounded-sm cursor-move' : ''}`}
            style={{ ...pct, pointerEvents: arrange ? 'auto' : 'none', touchAction: arrange ? 'none' : 'auto' }}
            onPointerDown={e => down(e, s, 'move')} onPointerMove={move} onPointerUp={up} onPointerCancel={up} data-sticker={s.id}>
            {s.url
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={s.url} alt="" draggable={false} className="block w-full h-full object-fill select-none" />
              : <div className="w-full h-full bg-slate-100" />}
            {arrange && (
              <>
                <button type="button" aria-label="Remove this photo" onPointerDown={e => e.stopPropagation()} onClick={() => onDelete(s.id)}
                  className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-white text-slate-700 shadow ring-1 ring-black/10 grid place-items-center text-sm">✕</button>
                <span aria-label="Drag to resize" role="slider" aria-valuenow={Math.round(b.w)}
                  onPointerDown={e => down(e, s, 'size')} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
                  className="absolute -bottom-3 -right-3 w-8 h-8 rounded-full bg-sky-500 ring-4 ring-white shadow cursor-nwse-resize" style={{ touchAction: 'none' }} />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
