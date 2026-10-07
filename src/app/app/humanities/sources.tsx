// The sources a question is read against — shown on the question page and again
// (folded) on the report, so the student never has to go back to compare.
import type { HumanitiesSource } from '@/lib/humanities-questions';

/** A case study's Background Information — folded once the student is past the first question. */
export function BackgroundCard({ text, open }: { text: string; open?: boolean }) {
  return (
    <details open={open} className="group bg-white rounded-3xl p-4 border border-black/5 shadow-sm">
      <summary className="flex items-center cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <span className="flex-1 text-sm font-bold text-navy">Background information</span>
        <span className="shrink-0 text-gray-400 transition group-open:rotate-90">›</span>
      </summary>
      <div className="mt-2 space-y-2">
        {text.split(/\n\s*\n/).map((p, i) => <p key={i} className="text-[15px] text-gray-800 leading-relaxed">{p}</p>)}
      </div>
    </details>
  );
}

export function SourceCards({ sources }: { sources: HumanitiesSource[] }) {
  return (
    <div className="space-y-3">
      {sources.map(s => (
        <div key={s.id} className="bg-white rounded-3xl p-4 border border-black/5 shadow-sm">
          <p className="text-sm font-bold text-navy">{/^[A-Z]$/.test(s.id) ? `Source ${s.id}` : s.id}</p>
          <p className="text-[12px] text-gray-500 italic mt-0.5">{s.provenance}</p>
          <p className="text-[15px] text-gray-800 leading-relaxed mt-2 whitespace-pre-line">{s.text}</p>
        </div>
      ))}
    </div>
  );
}
