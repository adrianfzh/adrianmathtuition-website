// /app/languages/practice/editing/<id> — one editing passage (SPEC-ENGLISH-PRACTICE.md).
// The passage as printed, ten answer boxes, Check → each line ✓/✗ with the right word.
// The scheme never leaves the server before the check.
import { redirect } from 'next/navigation';
import { englishPracticeOpen } from '@/lib/portal-beta';
import { loadEditingList, loadEditingSet } from '@/lib/english-practice-store';
import EditingForm from '../editing-form';

export const dynamic = 'force-dynamic';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditingPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await englishPracticeOpen())) redirect('/app/languages');
  const { id } = await params;
  const set = UUID.test(id) ? await loadEditingSet(id) : null;
  if (!set) redirect('/app/languages/practice?t=editing');
  const list = await loadEditingList().catch(() => []);
  const at = list.findIndex(x => x.itemId === set.itemId);
  const next = at >= 0 && at + 1 < list.length ? list[at + 1].itemId : null;
  return (
    <EditingForm
      itemId={set.itemId}
      text={set.text}
      lines={set.lines.map(l => ({ label: l.label, where: l.where }))}
      nextHref={next ? `/app/languages/practice/editing/${next}` : null}
    />
  );
}
