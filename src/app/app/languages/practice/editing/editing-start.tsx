'use client';
// Editing practice starts here (8 Oct 2026, Adrian: "they should select difficulty, then start"):
// choose a level, tap Start, and the passages come one at a time — no list of titles.
import { useState } from 'react';
import Link from 'next/link';

export interface LevelChoice { level: number; name: string; sub: string; total: number; done: number }

export default function EditingStart({ levels }: { levels: LevelChoice[] }) {
  const [level, setLevel] = useState<number>(levels.find(l => l.level === 2)?.level ?? levels[0]?.level ?? 1);
  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label="Difficulty" className="space-y-2 mt-2">
        {levels.map(l => {
          const on = l.level === level;
          return (
            <button key={l.level} type="button" role="radio" aria-checked={on} onClick={() => setLevel(l.level)}
              className={`w-full flex items-center gap-3 text-left rounded-2xl border px-3.5 py-3 ${on ? 'border-violet-600 bg-violet-50' : 'border-black/10 bg-white'}`}>
              <span aria-hidden className={`shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center ${on ? 'border-violet-600' : 'border-gray-300'}`}>
                {on && <span className="w-2.5 h-2.5 rounded-full bg-violet-600" />}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[15px] font-semibold text-navy leading-tight">{l.name}</span>
                <span className="block text-[12px] text-gray-500">{l.sub}</span>
              </span>
              <span className="shrink-0 text-[12px] text-gray-500">{l.done} of {l.total} done</span>
            </button>
          );
        })}
      </div>
      <Link href={`/app/languages/practice/editing?level=${level}`} className="block text-center w-full rounded-xl bg-violet-600 text-white text-[15px] font-semibold px-4 py-3">Start</Link>
    </div>
  );
}
