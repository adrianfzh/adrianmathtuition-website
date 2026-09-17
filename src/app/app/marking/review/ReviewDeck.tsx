'use client';
// The deck: cards side by side in a scroll-snapping strip (a swipe on the phone,
// a tap on the arrows anywhere), with a counter. The cards are rendered on the
// server; this only moves between them.
import { useEffect, useRef, useState, type ReactNode } from 'react';

export type DeckItem = { key: string; node: ReactNode };

export default function ReviewDeck({ items }: { items: DeckItem[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [i, setI] = useState(0);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const on = () => setI(Math.round(el.scrollLeft / el.clientWidth));
    el.addEventListener('scroll', on, { passive: true });
    return () => el.removeEventListener('scroll', on);
  }, []);
  const go = (n: number) => { const el = ref.current; if (!el) return; const k = Math.max(0, Math.min(items.length - 1, n)); el.scrollTo({ left: k * el.clientWidth, behavior: 'smooth' }); setI(k); };
  return (
    <div className="space-y-2" data-review-deck>
      <div ref={ref} className="flex overflow-x-auto snap-x snap-mandatory gap-3 -mx-4 px-4 pb-1 [scrollbar-width:none]" style={{ scrollbarWidth: 'none' }}>
        {items.map(it => (
          <div key={it.key} className="snap-center shrink-0 w-full" style={{ height: '64vh' }}>{it.node}</div>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => go(i - 1)} disabled={i <= 0} className="text-sm font-semibold text-navy border border-black/10 bg-white rounded-xl px-4 py-2 disabled:opacity-40">‹ Back</button>
        <span className="text-[12px] text-gray-500 tabular-nums">{Math.min(i + 1, items.length)} / {items.length}</span>
        <button type="button" onClick={() => go(i + 1)} disabled={i >= items.length - 1} className="text-sm font-semibold text-white bg-navy rounded-xl px-4 py-2 disabled:opacity-40">Next ›</button>
      </div>
    </div>
  );
}
