// 🔀 Another way to solve this (SPEC-ANOTHER-WAY.md, 4 Nov 2026). A drop-down under a worked
// solution, CLOSED by default (Adrian: "as a dropdown (closed by default), so students can click
// or tap if they want"). Opened: the second method's name, its working in the house layout
// (SolutionText), then ONE line on which method is better here and why — that line is the point.
// No hooks: renders in the practice page (client) and on a marked paper (server) alike.
import SolutionText from './SolutionText';
import { mathHtml } from '@/lib/math-inline';
import { splitAltWorking, type AltView } from '@/lib/alt-method';

export default function AnotherWay({ alt, className = '' }: { alt: AltView; className?: string }) {
  const { body, answer } = splitAltWorking(alt.working);
  return (
    <details className={`group/alt rounded-xl border border-slate-200 bg-slate-50/60 ${className}`} data-another-way>
      <summary className="cursor-pointer list-none flex items-center gap-1.5 px-3 py-2 text-[13px] font-semibold text-slate-700">
        <span className="text-slate-400 inline-block transition-transform group-open/alt:rotate-90">›</span>
        🔀 Another way to solve this
        {alt.waiting && <span className="ml-auto rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[11px] font-medium text-amber-800">Waiting for your approval</span>}
      </summary>
      <div className="px-3 pb-3 text-[14px] text-slate-800">
        <div className="text-[12px] font-semibold text-slate-500 mb-1.5">Method: {alt.method}</div>
        <SolutionText text={body} answer={answer} />
        <div className="mt-3 rounded-lg border border-sky-100 bg-sky-50 px-2.5 py-2 text-[13px] leading-snug text-slate-800">
          <span className="font-semibold text-sky-900">Which is better here? </span>
          <span dangerouslySetInnerHTML={{ __html: mathHtml(alt.better) }} />
        </div>
      </div>
    </details>
  );
}
