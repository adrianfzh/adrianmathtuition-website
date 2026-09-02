'use client';

// The exam-style question renderer + the inline-math helpers, shared by the
// practice flow and the timed set (extracted from practice-flow.tsx on
// 2026-09-02 when /app/practice/timed needed the identical layout).
//
// Every markdown/KaTeX string goes through the ONE shared pipeline in
// lib/math-markdown.tsx (fixMathFences + prepareMath + KaTeX options).

import { memo } from 'react';
import { MathMarkdown } from '@/lib/math-markdown';

// Inline KaTeX for grader output (transcribed lines, comments, fixes). Typed
// student lines and plain-text comments pass through untouched — markdown
// rendering only kicks in when the string actually carries $...$ math, so a
// hand-typed "3*4*5" can never get italicised by markdown rules.
const INLINE_P = { p: ({ children }: { children?: React.ReactNode }) => <>{children}</> };
export function MathText({ text }: { text: string }) {
  if (!text.includes('$')) return <>{text}</>;
  return <MathMarkdown content={text} components={INLINE_P} />;
}

// Mirrors StructuredPart in lib/bank-question-markdown.ts (server module).
export type QPart = { label: string; text: string; marks: number | null; subparts: QPart[] };
export type Question = {
  id: string; markdown: string; stem: string; parts: QPart[];
  marks: number | null; figureUrl?: string | null; source: string | null; hasSolution: boolean;
  /** Science bank rows (lib/science-bank.toPayload): the subject the grade /
   *  solution routes need to look the id up in the other project, and whether
   *  the answer is a bare A–D letter (marked deterministically). */
  subject?: string; mcq?: boolean; topic?: string | null;
};

// A–D chips for MCQ rows: the option letters found in the stem, else all four.
export const MCQ_FALLBACK = ['A', 'B', 'C', 'D'] as const;
export function mcqLettersIn(text: string): string[] {
  const found: string[] = [];
  for (const line of (text || '').split('\n')) {
    const m = line.match(/^\s*\(?([A-D])[).:]\s+\S/);
    if (m && !found.includes(m[1])) found.push(m[1]);
  }
  return found.length >= 2 ? found : [...MCQ_FALLBACK];
}
export function McqChips({ letters, value, onPick, disabled }: { letters: string[]; value: string; onPick: (l: string) => void; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap gap-2 mb-3">
      {letters.map(l => (
        <button key={l} type="button" onClick={() => onPick(l)} disabled={disabled}
          className={`w-14 h-14 rounded-2xl text-lg font-bold border transition-colors disabled:opacity-50 ${
            value === l ? 'bg-navy text-[hsl(45,100%,96%)] border-navy' : 'bg-white text-slate-700 border-slate-300 hover:border-navy/40'}`}>
          {l}
        </button>
      ))}
    </div>
  );
}

export function Md({ text }: { text: string }) {
  return <MathMarkdown content={text} />;
}

// Exam-style layout: a 4-column grid — part label · sub-part label · text ·
// marks. A part with its own text spans the two inner columns; a bare "(b)"
// that only carries sub-parts puts its label on the same row as "(i)", so
// "(b) (i) …" reads as one line the way it does on the paper. Marks sit in
// the last column, bottom-aligned, as "[3]". Only the text cells go through
// markdown, so KaTeX keeps working inside them.
// memo: the timed set re-renders its parent once a second for the clock; the
// KaTeX-heavy question must not re-render with it.
export const QuestionView = memo(function QuestionView({ q }: { q: Question }) {
  const rows: React.ReactNode[] = [];
  const label = 'font-semibold text-slate-800 whitespace-nowrap pr-1 self-baseline';
  const text = 'prose prose-sm max-w-none text-slate-800 leading-relaxed min-w-0 [&>p]:my-0 [&>p+p]:mt-2';
  const marks = 'self-end text-xs text-slate-500 tabular-nums pl-2 pb-0.5 whitespace-nowrap';
  const fmt = (l: string) => (l ? `(${l})` : '');
  q.parts.forEach((p, i) => {
    const hasText = p.text.trim().length > 0;
    if (hasText || p.subparts.length === 0) {
      rows.push(
        <div key={`p${i}`} className={label} style={{ gridColumn: 1 }}>{fmt(p.label)}</div>,
        <div key={`t${i}`} className={text} style={{ gridColumn: '2 / 4' }}><Md text={p.text} /></div>,
        <div key={`m${i}`} className={marks} style={{ gridColumn: 4 }}>{p.marks ? `[${p.marks}]` : ''}</div>,
      );
    }
    p.subparts.forEach((sp, j) => {
      rows.push(
        <div key={`p${i}s${j}`} className={label} style={{ gridColumn: 1 }}>{!hasText && j === 0 ? fmt(p.label) : ''}</div>,
        <div key={`l${i}s${j}`} className={label} style={{ gridColumn: 2 }}>{fmt(sp.label)}</div>,
        <div key={`t${i}s${j}`} className={text} style={{ gridColumn: 3 }}><Md text={sp.text} /></div>,
        <div key={`m${i}s${j}`} className={marks} style={{ gridColumn: 4 }}>{sp.marks ? `[${sp.marks}]` : ''}</div>,
      );
    });
  });
  const hasSub = q.parts.some(p => p.subparts.length > 0);
  // Both label columns size to their widest label ("(iii)"); an unused
  // sub-part column collapses to nothing.
  const cols = `max-content ${hasSub ? 'max-content' : '0'} minmax(0, 1fr) max-content`;
  return (
    <div className="math-working">
      {q.stem && (
        <div className={`prose prose-sm max-w-none text-slate-800 leading-relaxed ${q.parts.length ? 'mb-3' : ''}`}>
          <Md text={q.stem} />
        </div>
      )}
      {rows.length > 0 && (
        <div className="grid items-start" style={{ gridTemplateColumns: cols, columnGap: '0.35rem', rowGap: '0.6rem' }}>
          {rows}
        </div>
      )}
    </div>
  );
});
