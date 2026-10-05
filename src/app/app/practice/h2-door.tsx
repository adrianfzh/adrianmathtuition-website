// The "JC drills" section on the Practice tab (5 Oct 2026, SPEC-H2-TOOLS.md): one row
// per H2 tool the viewer may open (lib/portal-beta h2ToolOpen — closed switches show it
// to Adrian's cookie and the demo student only). Server component, no data fetch.
import Link from 'next/link';

const CARD = 'bg-white rounded-2xl border border-black/5 shadow-sm';

export default function H2Door({ methods, stats }: { methods: boolean; stats: boolean }) {
  if (!methods && !stats) return null;
  return (
    <section className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">JC drills</p>
      {methods && (
        <Link href="/app/practice/methods" className={`${CARD} flex items-center gap-3 px-4 py-3 hover:bg-[hsl(45,100%,99%)] active:scale-[0.99] transition`}>
          <span aria-hidden className="text-xl leading-none">🧭</span>
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-semibold text-navy">Which method?</span>
            <span className="block text-xs text-gray-500">See the start of a question. Pick the approach. No solving.</span>
          </span>
          <span aria-hidden className="text-gray-300">›</span>
        </Link>
      )}
      {stats && (
        <Link href="/app/practice/stats" className={`${CARD} flex items-center gap-3 px-4 py-3 hover:bg-[hsl(45,100%,99%)] active:scale-[0.99] transition`}>
          <span aria-hidden className="text-xl leading-none">✍️</span>
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-semibold text-navy">Statistics write-ups</span>
            <span className="block text-xs text-gray-500">Hypotheses, conclusions, assumptions. Checked point by point.</span>
          </span>
          <span aria-hidden className="text-gray-300">›</span>
        </Link>
      )}
    </section>
  );
}
