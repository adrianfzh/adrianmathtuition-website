'use client';
// 🔍 Spot the mistake — the interactive card (SPEC-SPOT-ERROR.md §4).
//
// The student reads the working, taps the line they think is wrong, and only
// then sees which line it was, why, and the fix. Used on /app/spot/[id] (the
// link from a My Notebook mistake) and on Adrian's review list
// /admin/spot-error, where `revealed` opens it fully so he reads everything.
// The /notes recap page keeps its own, always-revealed renderer (NotesUnits).
import { useState } from 'react';
import { MathMarkdown } from '@/lib/math-markdown';
import type { AutopsyPayload } from '@/lib/learn-types';
import 'katex/dist/katex.min.css';

const Md = ({ text, className }: { text: string; className?: string }) => (
  <div className={`[&_p]:my-0 [&_.katex-display]:my-1 ${className ?? ''}`}>
    <MathMarkdown content={text} />
  </div>
);

export default function SpotErrorCard({ payload, revealed = false }: { payload: AutopsyPayload; revealed?: boolean }) {
  const [picked, setPicked] = useState<number | null>(null);
  const wrong = payload.wrong_line - 1;
  const done = revealed || picked !== null;

  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-[hsl(45,100%,98%)] border border-black/5 p-3 text-[15px] text-gray-800">
        <Md text={payload.problem_md} />
      </div>
      {!done && <p className="text-sm font-semibold text-navy">Which line is wrong? Tap it.</p>}
      <ol className="space-y-1.5">
        {payload.working.map((line, i) => {
          const isWrong = done && i === wrong;
          const missed = done && picked === i && i !== wrong;
          return (
            <li key={i}>
              <button
                type="button"
                disabled={done}
                onClick={() => setPicked(i)}
                className={`w-full text-left flex items-start gap-3 rounded-xl border px-3 py-2 transition-colors ${
                  isWrong ? 'border-rose-300 bg-rose-50'
                    : missed ? 'border-gray-300 bg-gray-50'
                    : done ? 'border-black/5 bg-white'
                    : 'border-black/10 bg-white hover:border-navy/40'}`}
              >
                <span className="shrink-0 w-6 text-sm font-bold text-gray-400 pt-0.5">{i + 1}</span>
                <Md text={line} className="flex-1 min-w-0 overflow-x-auto overflow-y-hidden text-[15px]" />
                {isWrong && <span className="shrink-0 text-rose-600 font-bold" aria-label="This line is wrong">✗</span>}
              </button>
            </li>
          );
        })}
      </ol>
      {done && (
        <>
          {!revealed && (
            <p className={`text-sm font-semibold ${picked === wrong ? 'text-emerald-700' : 'text-rose-700'}`}>
              {picked === wrong ? '✅ You found it.' : `Not that one — it is line ${payload.wrong_line}.`}
            </p>
          )}
          <div className="rounded-xl border border-rose-100 bg-rose-50 p-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-rose-700 mb-1">Why it’s wrong</p>
            <Md text={payload.why_md} className="text-[14px] text-gray-800" />
          </div>
          <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-700 mb-1">Fix</p>
            <Md text={payload.fix_md} className="text-[14px] text-gray-800" />
          </div>
        </>
      )}
    </div>
  );
}
