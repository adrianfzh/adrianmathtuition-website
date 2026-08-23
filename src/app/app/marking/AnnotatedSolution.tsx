// The /solutions presentation, applied to a marked question: the correct
// solution line by line, then where the marks live for THIS student — each
// part's SEAB codes as chips (lost ones struck through), the red-ink reason,
// and the ✱ teaching note. Server component; maths typeset via mathHtml
// (the page already loads the KaTeX stylesheet).
import { mathHtml } from '@/lib/math-inline';

export interface SchemePart {
  label: string | null;
  scheme: string;
  why: string | null;
  teach: string | null;
}

const CHIP_TITLES: Record<string, string> = {
  M: 'Method mark — the correct approach, even when the arithmetic slips',
  A: 'Accuracy mark — the correct value, earned only when its method mark is',
  B: 'Independent mark — a correct stated fact or result, on its own',
};

function chip(code: string, key: number) {
  const c = code.trim();
  const lost = /0(ft)?$/i.test(c);
  const kind = c.charAt(0).toUpperCase();
  const tone = lost
    ? 'bg-rose-50 border-rose-200 text-rose-700 line-through decoration-rose-400'
    : kind === 'M'
      ? 'bg-sky-50 border-sky-200 text-sky-800'
      : kind === 'A'
        ? 'bg-amber-50 border-amber-200 text-amber-800'
        : 'bg-emerald-50 border-emerald-200 text-emerald-800';
  return (
    <span
      key={key}
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-bold font-mono ${tone}`}
      title={`${CHIP_TITLES[kind] ?? ''}${lost ? ' — this one was lost' : ''}`}
    >
      {c}
    </span>
  );
}

function Math({ text, className }: { text: string; className?: string }) {
  return <span className={className} dangerouslySetInnerHTML={{ __html: mathHtml(text) }} />;
}

export default function AnnotatedSolution({ solution, schemes }: {
  solution: string;
  schemes: SchemePart[];
}) {
  const lines = solution.split('\n').map(l => l.trim()).filter(Boolean);
  return (
    <div className="mt-2 rounded-xl border border-gray-100 bg-white p-3">
      <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-2">
        The solution, line by line
      </p>
      <ol className="list-none m-0 p-0 space-y-1.5">
        {lines.map((l, i) => (
          <li key={i} className="flex items-baseline gap-2.5">
            <span className="shrink-0 text-[11px] font-bold text-gray-300 tabular-nums">
              {String(i + 1).padStart(2, '0')}
            </span>
            <Math text={l} className="text-[13px] text-gray-800 min-w-0" />
          </li>
        ))}
      </ol>

      {schemes.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-100 space-y-2.5">
          <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">
            Where the marks live — and where yours went
          </p>
          {schemes.map((s, i) => (
            <div key={i}>
              <div className="flex flex-wrap items-center gap-1.5">
                {s.label && <span className="text-[12px] font-bold text-navy">{s.label}</span>}
                {s.scheme.split(/\s+/).filter(Boolean).map((code, j) => chip(code, j))}
              </div>
              {s.why && (
                <p className="text-[12px] text-amber-900 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5 mt-1.5">
                  <Math text={s.why} />
                </p>
              )}
              {s.teach && (
                <p className="text-[12px] text-gray-600 mt-1.5">
                  <span className="font-bold text-amber-700">✱ </span>
                  <Math text={s.teach} />
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
