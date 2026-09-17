'use client';
// "Review my mistakes" at the foot of a subject tab (17 Sep 2026): tap → a tick
// list of the papers that lost marks → Review opens the deck for the ticked ones.
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export type ReviewPickPaper = { id: string; name: string; when: string; lost: number };

export default function ReviewPicker({ papers, prominent = false }: { papers: ReviewPickPaper[]; prominent?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [ticked, setTicked] = useState<string[]>([]);
  if (papers.length === 0) return null;
  const go = () => router.push(`/app/marking/review?papers=${ticked.join(',')}`);
  if (!open) {
    return (
      <button type="button" onClick={() => { setOpen(true); setTicked(papers.slice(0, 3).map(p => p.id)); }}
        className={`w-full rounded-2xl px-4 py-3 text-left font-semibold ${prominent ? 'bg-navy text-white shadow-sm' : 'bg-white border border-black/10 text-navy'}`}>
        🔁 Review my mistakes <span className={`ml-1 font-normal ${prominent ? 'text-white/70' : 'text-gray-400'}`}>— pick papers, scroll the questions you lost marks on</span>
      </button>
    );
  }
  return (
    <div className="bg-white rounded-3xl border border-black/5 shadow-sm p-4 space-y-3" data-review-picker>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-bold text-navy">Which papers?</p>
        <button type="button" onClick={() => setOpen(false)} className="text-xs font-semibold text-gray-500 border border-black/10 rounded-xl px-3 py-1.5">Close</button>
      </div>
      <ul className="divide-y divide-black/5">
        {papers.map(p => (
          <li key={p.id}>
            <label className="flex items-center gap-3 py-2 cursor-pointer">
              <input type="checkbox" checked={ticked.includes(p.id)} onChange={() => setTicked(t => t.includes(p.id) ? t.filter(x => x !== p.id) : [...t, p.id])} className="w-5 h-5 accent-navy" />
              <span className="min-w-0 flex-1 text-sm font-semibold text-navy break-words">{p.name} <span className="font-normal text-gray-400">· {p.when}</span></span>
              <span className="shrink-0 text-xs text-rose-700 font-semibold">−{p.lost}</span>
            </label>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setTicked(papers.map(p => p.id))} className="text-xs font-semibold text-navy underline underline-offset-2">All</button>
        <button type="button" onClick={go} disabled={ticked.length === 0} className="ml-auto text-sm font-bold text-white bg-navy rounded-xl px-4 py-2 disabled:opacity-40">Review {ticked.length || ''} ›</button>
      </div>
    </div>
  );
}
