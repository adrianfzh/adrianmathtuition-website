// 🧭 /app/practice/methods — "Which method?" drills for JC H2 (5 Oct 2026, Adrian: "build
// the which method drills and stats trainer"; SPEC-H2-TOOLS.md). The start of a question,
// three or four approaches, tap one WITHOUT solving it — marked on the spot, one line on
// why, one line on why the tempting wrong one fails, next. ?area= opens a run.
// Closed switch: Adrian's cookie + the demo student (lib/portal-beta h2ToolOpen).
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { sessionAccount } from '@/lib/portal-auth';
import { h2ToolOpen, viewingAsStudent } from '@/lib/portal-beta';
import { isNotesAuthed } from '@/lib/notes-auth';
import { METHOD_AREAS, parseMethodArea } from '@/lib/h2-tools';
import { methodDrillCounts } from '@/lib/h2-tools-store';
import DrillRun from './drill-run';

export const dynamic = 'force-dynamic';
const CARD = 'bg-white rounded-2xl border border-black/5 shadow-sm';

export default async function MethodsPage({ searchParams }: { searchParams: Promise<{ area?: string }> }) {
  const account = await sessionAccount().catch(() => null);
  const isAdmin = !(await viewingAsStudent()) && (await isNotesAuthed());
  if (!account && !isAdmin) redirect('/login');
  if (!(await h2ToolOpen('methods', account))) redirect('/app/practice');
  const area = parseMethodArea((await searchParams).area);
  if (area) {
    const label = METHOD_AREAS.find(a => a.key === area)!.label;
    return <DrillRun area={area} label={label} />;
  }
  const counts = await methodDrillCounts().catch(() => ({} as Record<string, number>));
  const areas = METHOD_AREAS.filter(a => (counts[a.key] ?? 0) > 0);
  return (
    <div className="space-y-4 pb-24 sm:pb-4">
      <div className="pt-1">
        <Link href="/app/practice" className="text-xs text-gray-500">‹ Practice</Link>
        <h1 className="text-xl font-bold text-navy mt-1">Which method?</h1>
        <p className="text-sm text-gray-600 mt-1">You see the start of a question.</p>
        <p className="text-sm text-gray-600">Pick how you would begin. Do not solve it.</p>
      </div>
      <section className="space-y-2">
        {areas.length === 0 && <div className={`${CARD} p-4 text-sm text-gray-600`}>No drills here yet.</div>}
        {areas.map(a => (
          <Link key={a.key} href={`/app/practice/methods?area=${a.key}`} className={`${CARD} flex items-center gap-3 px-4 py-3 hover:bg-[hsl(45,100%,99%)] active:scale-[0.99] transition`}>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-semibold text-navy">{a.label}</span>
              <span className="block text-xs text-gray-500">{a.blurb}</span>
            </span>
            <span aria-hidden className="text-gray-300">›</span>
          </Link>
        ))}
      </section>
    </div>
  );
}
