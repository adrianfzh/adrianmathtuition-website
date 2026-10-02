// The sources a question is read against — shown on the question page and again
// (folded) on the report, so the student never has to go back to compare.
import type { HumanitiesSource } from '@/lib/humanities-questions';

export function SourceCards({ sources }: { sources: HumanitiesSource[] }) {
  return (
    <div className="space-y-3">
      {sources.map(s => (
        <div key={s.id} className="bg-white rounded-3xl p-4 border border-black/5 shadow-sm">
          <p className="text-sm font-bold text-navy">Source {s.id}</p>
          <p className="text-[12px] text-gray-500 italic mt-0.5">{s.provenance}</p>
          <p className="text-[15px] text-gray-800 leading-relaxed mt-2 whitespace-pre-line">{s.text}</p>
        </div>
      ))}
    </div>
  );
}
