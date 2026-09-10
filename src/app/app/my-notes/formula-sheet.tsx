// The formula sheet, rendered (SPEC-NOTEBOOK-V2 §5) — one component for both
// doors: /app/my-notes/formulas (every topic the student has met) and Before
// the paper (the exam's topics only). Server component, no client JS: the
// statements are Adrian's own plain-text lines from formula_ref, shown as
// written, and the /formulas pages carry the full KaTeX versions.
import Link from 'next/link';
import type { FormulaSection } from '@/lib/formula-sheet';
import { viaLine } from '@/lib/formula-sheet';

const CARD = 'bg-white rounded-2xl border border-black/5 shadow-sm';

const STATUS: Record<string, { text: string; cls: string }> = {
  given: { text: 'on the formula list', cls: 'bg-emerald-50 text-emerald-800' },
  memorise: { text: 'memorise', cls: 'bg-amber-50 text-amber-800' },
  derive: { text: 'derive it', cls: 'bg-sky-50 text-sky-800' },
};

export default function FormulaSheet({ sections, emptyLine }: { sections: FormulaSection[]; emptyLine: string }) {
  if (!sections.length) {
    return <div className={`${CARD} p-5 text-sm text-gray-600`} data-formula-sheet-empty>{emptyLine}</div>;
  }
  return (
    <div className="space-y-3" data-formula-sheet>
      {sections.map(s => (
        <section key={`${s.levelKey}|${s.topic}`} className={`${CARD} p-4`} data-formula-topic={s.topic}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-navy leading-snug">{s.topic}</h2>
              <p className="text-[12px] text-gray-500 mt-0.5">{viaLine(s.via)}</p>
            </div>
            {s.page && (
              <Link href={s.page.href} className="shrink-0 text-[12px] font-semibold text-navy border border-black/10 rounded-full px-3 py-1 hover:bg-navy/5">
                📐 {s.page.title} page
              </Link>
            )}
          </div>

          {s.watch && (
            <p className="mt-2 text-[12px] font-semibold text-rose-700" data-formula-watch>
              ⚠ Marks lost here — {s.watch.title}{s.watch.where ? ` (${s.watch.where})` : ''}
            </p>
          )}

          {s.formulae.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {s.formulae.map(f => {
                const st = f.given_status ? STATUS[f.given_status] : null;
                return (
                  <li key={f.result} className="rounded-xl bg-[hsl(45,100%,98%)] border border-black/5 px-3 py-2" data-formula={f.result}>
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[13px] font-semibold text-navy">{f.result}</p>
                      {st && <span className={`shrink-0 text-[10px] font-semibold rounded-full px-2 py-0.5 ${st.cls}`}>{st.text}</span>}
                    </div>
                    {f.statement && <p className="mt-1 font-mono text-[12.5px] text-gray-800 whitespace-pre-wrap break-words">{f.statement}</p>}
                    {f.misapplied && (
                      <p className="mt-1.5 text-[12px] font-semibold text-rose-700" data-formula-misapplied>
                        ⚠ This one cost marks — {f.misapplied.title}{f.misapplied.where ? ` (${f.misapplied.where})` : ''}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-2 text-[12px] text-gray-500">
              {s.page ? 'No lines filed for this topic yet — the page has the full set.' : 'No formulas filed for this topic yet.'}
            </p>
          )}
        </section>
      ))}
    </div>
  );
}
