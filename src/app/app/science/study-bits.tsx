// Small pieces the science study pages share: a line with its **bold** words
// highlighted, the card look, and the page header.
import type { ReactNode } from 'react';
import { splitBold } from '@/lib/science-definitions';
import PortalIcon from '@/components/PortalIcon';

export const STUDY_CARD = 'bg-white rounded-3xl shadow-[0_1px_2px_rgba(15,23,42,0.04),0_6px_16px_-4px_rgba(15,23,42,0.08)]';

/** A line with the scoring words highlighted. */
export function Marked({ text }: { text: string }) {
  return (
    <>
      {splitBold(text).map((r, i) => r.bold
        ? <strong key={i} className="font-semibold text-navy bg-amber-100/70 rounded px-0.5">{r.text}</strong>
        : <span key={i}>{r.text}</span>)}
    </>
  );
}

export function StudyHeader({ tile, icon, title, sub }: { tile: string; icon: 'book' | 'flask'; title: string; sub: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 pt-1">
      <span className={`flex items-center justify-center w-9 h-9 rounded-2xl shrink-0 ${tile} text-white`}>
        <PortalIcon name={icon} className="w-5 h-5" />
      </span>
      <div className="min-w-0">
        <h1 className="text-xl font-bold text-navy leading-tight">{title}</h1>
        <p className="text-[12px] text-gray-500">{sub}</p>
      </div>
    </div>
  );
}
