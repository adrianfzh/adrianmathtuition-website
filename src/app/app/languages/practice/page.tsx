// /app/languages/practice — English practice on our OWN sets
// (SPEC-ENGLISH-PRACTICE.md; own content only since 7 Oct 2026): editing passages,
// texts with their questions, visual texts. A list only.
// Closed: englishPracticeOpen() = Adrian's cookie until the switch flips.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { englishPracticeOpen } from '@/lib/portal-beta';
import { loadEditingList, loadReadingList, type ReadingListing } from '@/lib/english-practice-store';
import { STUDY_CARD, StudyHeader } from '../../science/study-bits';

export const dynamic = 'force-dynamic';

const HEAD = 'text-[12px] font-bold uppercase tracking-wide text-violet-700';
const ROW = 'flex items-center gap-3 py-2.5 active:bg-violet-50/60';
const TABS = [
  { key: 'editing', label: 'Editing' },
  { key: 'passages', label: 'Comprehension' },
  { key: 'visual', label: 'Visual text' },
  { key: 'summary', label: 'Summary' },
] as const;
type Tab = (typeof TABS)[number]['key'];

function ReadingRows({ rows }: { rows: ReadingListing[] }) {
  if (rows.length === 0) return <p className="py-3 text-[14px] text-gray-500">Nothing here yet.</p>;
  return (
    <div className="divide-y divide-gray-100">
      {rows.map(r => (
        <Link key={r.textId} href={`/app/languages/practice/text/${r.textId}`} className={ROW}>
          <span className="flex-1 min-w-0">
            <span className="block text-[15px] font-semibold text-navy leading-snug truncate">{r.label}</span>
            <span className="block text-[12px] text-gray-500">{r.group === 'narrative' ? 'Story · ' : r.group === 'non_narrative' ? 'Article · ' : ''}{r.questions} question{r.questions === 1 ? '' : 's'}{r.summary ? ' · with a summary' : ''}</span>
          </span>
          <span className="shrink-0 text-gray-300 text-lg">›</span>
        </Link>
      ))}
    </div>
  );
}

export default async function EnglishPracticePage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  if (!(await englishPracticeOpen())) redirect('/app/languages');
  const t = (await searchParams).t;
  const tab: Tab = TABS.some(x => x.key === t) ? (t as Tab) : 'editing';
  const [editing, reading] = await Promise.all([loadEditingList().catch(() => []), loadReadingList().catch(() => [])]);
  const passages = reading.filter(r => r.group !== 'visual');
  const visual = reading.filter(r => r.group === 'visual');
  const summaries = passages.filter(r => r.summary);

  return (
    <div className="space-y-4 pb-24 sm:pb-4">
      <StudyHeader tile="bg-violet-600" icon="book" title="Practise" sub="Paper 1 editing · Paper 2 comprehension" />

      <nav className="flex gap-1.5 overflow-x-auto" aria-label="Kinds of practice">
        {TABS.map(x => (
          <Link key={x.key} href={`/app/languages/practice?t=${x.key}`}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-semibold border ${tab === x.key ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-violet-800 border-violet-200'}`}>
            {x.label}
          </Link>
        ))}
      </nav>

      {tab === 'editing' && (
        <section className={`${STUDY_CARD} px-4 py-3`} aria-label="Editing">
          <h2 className={HEAD}>Editing · 10 marks each</h2>
          <p className="text-[13px] text-gray-500 mt-0.5">Twelve lines. Find the wrong word in eight of them.</p>
          <div className="divide-y divide-gray-100 mt-1">
            {editing.map((e, i) => (
              <Link key={e.itemId} href={`/app/languages/practice/editing/${e.itemId}`} className={ROW}>
                <span className="shrink-0 w-7 h-7 rounded-full bg-violet-100 text-violet-800 text-[12px] font-bold flex items-center justify-center" aria-hidden>{i + 1}</span>
                <span className="flex-1 min-w-0 text-[15px] font-semibold text-navy leading-snug truncate">{e.about}</span>
                <span className="shrink-0 text-gray-300 text-lg">›</span>
              </Link>
            ))}
            {editing.length === 0 && <p className="py-3 text-[14px] text-gray-500">Nothing here yet.</p>}
          </div>
        </section>
      )}

      {tab === 'passages' && (
        <section className={`${STUDY_CARD} px-4 py-3`} aria-label="Comprehension">
          <h2 className={HEAD}>Read the text, then answer</h2>
          <p className="text-[13px] text-gray-500 mt-0.5">Each answer is checked against the mark scheme, one question at a time.</p>
          <ReadingRows rows={passages} />
        </section>
      )}

      {tab === 'visual' && (
        <section className={`${STUDY_CARD} px-4 py-3`} aria-label="Visual text">
          <h2 className={HEAD}>Visual text · Section A</h2>
          <p className="text-[13px] text-gray-500 mt-0.5">A poster, webpage or post, and the questions on it.</p>
          <ReadingRows rows={visual} />
        </section>
      )}

      {tab === 'summary' && (
        <section className={`${STUDY_CARD} px-4 py-3`} aria-label="Summary">
          <h2 className={HEAD}>Summary · 80 words</h2>
          <p className="text-[13px] text-gray-500 mt-0.5">The summary is the last question on each text.</p>
          <ReadingRows rows={summaries} />
        </section>
      )}

      <p className="text-[12px] text-gray-400"><Link href="/app/languages" className="underline underline-offset-2">Back to Languages</Link></p>
    </div>
  );
}
