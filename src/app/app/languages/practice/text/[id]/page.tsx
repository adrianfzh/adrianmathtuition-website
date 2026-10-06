// /app/languages/practice/text/<id> — one text and the questions on it
// (SPEC-ENGLISH-PRACTICE.md): the passage (and its picture), then each question with
// its own box and Check. The scheme is not in this page; it comes back with the check.
import { redirect } from 'next/navigation';
import { englishPracticeOpen } from '@/lib/portal-beta';
import { publicUnit, SUMMARY_WORD_LIMIT } from '@/lib/english-practice';
import { loadReadingSet } from '@/lib/english-practice-store';
import ReadingForm from '../reading-form';

export const dynamic = 'force-dynamic';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ReadingPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await englishPracticeOpen())) redirect('/app/languages');
  const { id } = await params;
  const set = UUID.test(id) ? await loadReadingSet(id).catch(() => null) : null;
  if (!set) redirect('/app/languages/practice?t=passages');
  const visual = set.units.every(u => u.sectionKind === 'visual_text');
  return (
    <ReadingForm
      title={set.title}
      text={set.text}
      imageSrc={set.hasImage ? `/api/portal/english/practice?image=${set.textId}` : null}
      units={set.units.map(publicUnit)}
      backHref={`/app/languages/practice?t=${visual ? 'visual' : 'passages'}`}
      wordLimit={SUMMARY_WORD_LIMIT}
    />
  );
}
