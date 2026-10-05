// ✍️ /app/practice/stats — the statistics write-up trainer for JC H2 (5 Oct 2026;
// SPEC-H2-TOOLS.md). The list by kind; ?id= opens one: the situation, the task, a box
// to type in, then each point the scheme looks for ✓/✗ with "The scheme says" / "You
// wrote", then the model answer. Closed switch: Adrian's cookie + the demo student.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { sessionAccount } from '@/lib/portal-auth';
import { h2ToolOpen, viewingAsStudent } from '@/lib/portal-beta';
import { isNotesAuthed } from '@/lib/notes-auth';
import { STATS_KINDS } from '@/lib/h2-tools';
import { loadStatsItem, loadStatsItems } from '@/lib/h2-tools-store';
import { MathText } from '../question-view';
import WriteupForm from './writeup-form';

export const dynamic = 'force-dynamic';
const CARD = 'bg-white rounded-2xl border border-black/5 shadow-sm';
const UUID = /^[0-9a-f-]{36}$/i;

export default async function StatsPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const account = await sessionAccount().catch(() => null);
  const isAdmin = !(await viewingAsStudent()) && (await isNotesAuthed());
  if (!account && !isAdmin) redirect('/login');
  if (!(await h2ToolOpen('stats', account))) redirect('/app/practice');
  const { id } = await searchParams;
  const items = await loadStatsItems().catch(() => []);

  if (id && UUID.test(id)) {
    const item = await loadStatsItem(id);
    if (!item) redirect('/app/practice/stats');
    const at = items.findIndex(x => x.id === item.id);
    const nextId = at >= 0 && at + 1 < items.length ? items[at + 1].id : null;
    return (
      <WriteupForm
        item={{ id: item.id, context: item.context, task: item.task, points: item.elements.map(e => e.label), kindLabel: STATS_KINDS.find(k => k.key === item.kind)?.label ?? '' }}
        nextHref={nextId ? `/app/practice/stats?id=${nextId}` : null}
      />
    );
  }

  return (
    <div className="space-y-4 pb-24 sm:pb-4">
      <div className="pt-1">
        <Link href="/app/practice" className="text-xs text-gray-500">‹ Practice</Link>
        <h1 className="text-xl font-bold text-navy mt-1">Statistics write-ups</h1>
        <p className="text-sm text-gray-600 mt-1">The parts marked on wording.</p>
        <p className="text-sm text-gray-600">Type your answer. Each point is checked.</p>
      </div>
      {items.length === 0 && <div className={`${CARD} p-4 text-sm text-gray-600`}>Nothing here yet.</div>}
      {STATS_KINDS.map(k => {
        const mine = items.filter(i => i.kind === k.key);
        if (mine.length === 0) return null;
        return (
          <section key={k.key} className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{k.label}</p>
            {mine.map(i => (
              <Link key={i.id} href={`/app/practice/stats?id=${i.id}`} className={`${CARD} flex items-center gap-3 px-4 py-3 hover:bg-[hsl(45,100%,99%)] active:scale-[0.99] transition`}>
                <span className="flex-1 min-w-0 text-sm text-gray-800 line-clamp-2"><MathText text={i.context} /></span>
                <span aria-hidden className="text-gray-300">›</span>
              </Link>
            ))}
          </section>
        );
      })}
    </div>
  );
}
