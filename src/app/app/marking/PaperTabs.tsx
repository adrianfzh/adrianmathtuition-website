'use client';
// The paper page in two tabs (18 Sep 2026, Adrian): it OPENS on the marked pages —
// one continuous scroll you can write on, like a PDF — and "Where my marks went"
// (the cover, every question that dropped marks, the worked solutions) is the
// second tab. Both stay mounted, so the ink and any open solution survive a switch.
// ?view=marks opens the second tab; a "See it on my paper" link (?page=) always
// lands on the first.
import { useState, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';

export default function PaperTabs({ paper, marks, paperLabel = 'My paper', hasPaper, hasMarks }: {
  paper: ReactNode; marks: ReactNode; paperLabel?: string; hasPaper: boolean; hasMarks: boolean;
}) {
  const sp = useSearchParams();
  const wantsMarks = sp?.get('view') === 'marks' && !sp?.get('page');
  const [picked, setTab] = useState<'paper' | 'marks' | null>(null);
  const tab = picked ?? (hasPaper && !wantsMarks ? 'paper' : 'marks');
  if (!hasPaper || !hasMarks) return <>{hasPaper ? paper : marks}</>;
  const cls = (on: boolean) => `flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${on ? 'bg-navy text-white shadow-sm' : 'text-navy hover:bg-navy/5'}`;
  return (
    <div className="space-y-3">
      <div role="tablist" aria-label="This paper" className="flex gap-1 rounded-2xl border border-black/5 bg-white p-1">
        <button type="button" role="tab" aria-selected={tab === 'paper'} onClick={() => setTab('paper')} className={cls(tab === 'paper')}>📄 {paperLabel}</button>
        <button type="button" role="tab" aria-selected={tab === 'marks'} onClick={() => setTab('marks')} className={cls(tab === 'marks')}>📊 Where my marks went</button>
      </div>
      <div role="tabpanel" hidden={tab !== 'paper'} className="space-y-4">{paper}</div>
      <div role="tabpanel" hidden={tab !== 'marks'} className="space-y-4">{marks}</div>
    </div>
  );
}
