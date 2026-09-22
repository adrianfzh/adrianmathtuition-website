'use client';
// ⬇ Download — a three-way menu (Adrian, 22 Sep 2026: "download row should be a
// three-way menu"): the marked paper as it was handed back, the marked paper with
// the student's own notes baked in, and the marked paper with Adrian's notes on
// it. Every row is a plain link to /api/portal/marking-pdf so it opens in a new
// tab the way the old single button did; a layer with nothing written in it is
// shown greyed with a reason, never hidden, so the menu always reads the same.
import { useEffect, useRef, useState } from 'react';

export default function DownloadMenu({ runId, hasMine, hasAdrian, mineLabel = 'With my notes' }: {
  runId: string; hasMine: boolean; hasAdrian: boolean; mineLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent | TouchEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away); document.addEventListener('touchstart', away); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('touchstart', away); document.removeEventListener('keydown', esc); };
  }, [open]);

  const base = `/api/portal/marking-pdf?run=${runId}&kind=marked`;
  const rows: { label: string; hint: string; href: string; on: boolean; track?: string }[] = [
    { label: 'Marked paper', hint: 'as it was handed back', href: base, on: true, track: 'marking:open' },
    { label: mineLabel, hint: hasMine ? 'the marked paper + what you wrote on it' : 'nothing written on it yet', href: `${base}&notes=mine`, on: hasMine },
    { label: "With Adrian's notes", hint: hasAdrian ? 'the marked paper + Adrian’s notes on it' : 'no notes from Adrian on this paper', href: `${base}&notes=adrian`, on: hasAdrian },
  ];

  return (
    <div ref={box} className="relative inline-block">
      <button type="button" onClick={() => setOpen(o => !o)} aria-haspopup="menu" aria-expanded={open}
        className="inline-block text-sm font-semibold text-navy border border-navy/20 rounded-xl px-4 py-2 bg-white hover:bg-navy/5">
        ⬇ Download as PDF <span aria-hidden className="text-navy/50">▾</span>
      </button>
      {open && (
        <div role="menu" className="absolute left-1/2 -translate-x-1/2 z-30 mt-1 w-72 rounded-2xl border border-black/10 bg-white shadow-lg p-1.5 text-left">
          {rows.map(r => r.on ? (
            <a key={r.label} role="menuitem" href={r.href} target="_blank" rel="noopener noreferrer" data-track={r.track} onClick={() => setOpen(false)}
              className="block rounded-xl px-3 py-2 hover:bg-navy/5">
              <span className="block text-sm font-semibold text-navy">⬇ {r.label}</span>
              <span className="block text-[11px] text-gray-500">{r.hint}</span>
            </a>
          ) : (
            <div key={r.label} role="menuitem" aria-disabled className="block rounded-xl px-3 py-2 opacity-50 cursor-not-allowed">
              <span className="block text-sm font-semibold text-navy">⬇ {r.label}</span>
              <span className="block text-[11px] text-gray-500">{r.hint}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
