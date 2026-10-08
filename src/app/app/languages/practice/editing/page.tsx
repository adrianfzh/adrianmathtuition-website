// /app/languages/practice/editing?level=1|2|3[&after=<id>] — the next editing passage at a level
// (8 Oct 2026, Adrian: "select difficulty, then start, then questions will be shown one by one").
// No list: the page picks a passage this student has not done at that level (the one done longest
// ago once all are done), and Next comes back here for the following one.
import { redirect } from 'next/navigation';
import { sessionAccount, portalIdentity } from '@/lib/portal-auth';
import { englishPracticeOpen } from '@/lib/portal-beta';
import { EDIT_LEVELS, type EditLevel } from '@/lib/english-own';
import { loadEditingSet, nextEditingFor } from '@/lib/english-practice-store';
import EditingForm from './editing-form';

export const dynamic = 'force-dynamic';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditingRunPage({ searchParams }: { searchParams: Promise<{ level?: string; after?: string }> }) {
  if (!(await englishPracticeOpen())) redirect('/app/languages');
  const sp = await searchParams;
  const chosen = EDIT_LEVELS.find(l => String(l.level) === sp.level);
  if (!chosen) redirect('/app/languages/practice?t=editing');
  const level: EditLevel = chosen.level;
  const account = await sessionAccount().catch(() => null);
  const identity = account ? portalIdentity(account) : 'admin';
  const next = await nextEditingFor(identity, level, sp.after && UUID.test(sp.after) ? sp.after.toLowerCase() : null);
  const set = next.itemId ? await loadEditingSet(next.itemId) : null;
  if (!set) redirect('/app/languages/practice?t=editing');
  return (
    <EditingForm
      key={set.itemId}
      itemId={set.itemId}
      text={set.text}
      rows={set.rows ?? null}
      lines={set.lines.map(l => ({ label: l.label, where: l.where }))}
      nextHref={`/app/languages/practice/editing?level=${level}&after=${set.itemId}`}
      levelName={chosen.name}
      progress={`${Math.min(next.done + 1, next.total)} of ${next.total}`}
    />
  );
}
