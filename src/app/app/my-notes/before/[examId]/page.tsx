// /app/my-notes/before/[examId] — Before the paper (SPEC-NOTEBOOK-V2 §4, Adrian
// 11 Sep 2026: "yes do it", at five days). The Notebook, narrowed to one exam's
// tested topics: the live mistakes there, the skills that keep coming up, the
// answers saved, the photos and clippings, and the formulas met in those topics
// (the §5 sheet, filtered). The card that opens this appears on /app/my-notes
// when the exam is within BEFORE_PAPER_DAYS; the page itself answers for any
// upcoming exam of the student's (the exam id is Airtable's, checked against
// the student's own Exams rows — never a stranger's).
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { portalIdentity, sessionAccount } from '@/lib/portal-auth';
import { loadNotebook } from '@/lib/notebook-load';
import { beforePaperGroups, beforePaperLine, topicMatches } from '@/lib/before-paper';
import { buildFormulaSheet, sectionsForTopics, topicsMet } from '@/lib/formula-sheet';
import { loadFormulaeByLevel } from '@/lib/formula-sheet-store';
import type { StreamItem } from '@/lib/notebook-stream';
import { fileHref } from '@/lib/student-files-url';
import FormulaSheet from '../../formula-sheet';

export const dynamic = 'force-dynamic';

const CARD = 'bg-white rounded-2xl border border-black/5 shadow-sm';
const ICON: Record<string, string> = { mistake: '⚠️', saved: '💾', photo: '📷', clip: '✂️', skill: '💬' };

function Row({ it }: { it: StreamItem }) {
  return (
    <Link href={`/app/my-notes?open=${encodeURIComponent(it.id)}`} className="flex items-start gap-3 px-4 py-3 hover:bg-[hsl(45,100%,99%)]" data-before-item={it.id}>
      {it.note ? (
        /* eslint-disable-next-line @next/next/no-img-element -- the student's own stored image */
        <img src={fileHref(it.note.image_url)} alt="" loading="lazy" className="w-12 h-12 object-cover object-top rounded-lg border border-black/5 shrink-0" />
      ) : (
        <span className="text-lg leading-none mt-0.5 shrink-0" aria-hidden>{ICON[it.kind] ?? '📓'}</span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-navy leading-snug">{it.title}</p>
        <p className="text-[12px] text-gray-500 mt-0.5">{it.subtitle}</p>
      </div>
      {it.tag && <span className="shrink-0 text-[11px] rounded-full px-2.5 py-0.5 font-semibold bg-gray-100 text-gray-600">{it.tag.text}</span>}
    </Link>
  );
}

function Group({ title, lead, items, empty }: { title: string; lead: string; items: StreamItem[]; empty: string }) {
  return (
    <section className={`${CARD} overflow-hidden`} data-before-group={title}>
      <div className="px-4 pt-4 pb-2">
        <h2 className="text-sm font-bold text-navy">{title}</h2>
        <p className="text-[12px] text-gray-500 mt-0.5">{lead}</p>
      </div>
      {items.length ? <div className="divide-y divide-gray-100 border-t border-gray-100">{items.map(it => <Row key={it.id} it={it} />)}</div>
        : <p className="px-4 pb-4 text-[13px] text-gray-500">{empty}</p>}
    </section>
  );
}

export default async function BeforePaperPage({ params }: { params: Promise<{ examId: string }> }) {
  const { examId } = await params;
  const account = await sessionAccount();
  const sid = account ? portalIdentity(account) : null;
  if (!account || !sid) {
    return (
      <div className="space-y-4 pb-24 sm:pb-4">
        <h1 className="text-xl font-bold text-navy pt-1">Before the paper</h1>
        <div className={`${CARD} p-5 text-sm text-gray-600`}>
          <Link href="/login" className="font-semibold text-navy underline">Log in as a student</Link> to see your exam-week page.
        </div>
      </div>
    );
  }

  const { items, exams, levelKeys } = await loadNotebook(account, sid);
  const exam = exams.find(e => e.id === examId);
  if (!exam) notFound();

  const groups = beforePaperGroups(exam, items);
  const inExam = (topic: string) => exam.testedTopics.some(t => topicMatches(t, topic));
  const topics = topicsMet(items).filter(t => inExam(t.topic));
  const formulaeByLevel = await loadFormulaeByLevel(levelKeys, topics);
  const sections = sectionsForTopics(
    buildFormulaSheet({ topics, levelKeys, formulaeByLevel, liveMistakes: groups.mistakes }),
    inExam,
  );
  const when = exam.daysLeft === 0 ? 'Today' : exam.daysLeft === 1 ? 'Tomorrow' : `In ${exam.daysLeft} days`;

  return (
    <div className="space-y-4 pb-24 sm:pb-4" data-before-paper-page={exam.id}>
      <div className="pt-1">
        <Link href="/app/my-notes" className="text-[12px] font-semibold text-gray-500 hover:text-navy">← My Notebook</Link>
        <h1 className="text-xl font-bold text-navy mt-1">📝 Before the paper</h1>
        <p className="text-sm font-semibold text-navy mt-1">{beforePaperLine(exam)}</p>
        <p className="text-[12px] text-gray-500">{exam.approx ? 'Date approximate · ' : ''}{when}{exam.date ? ` · ${new Date(`${exam.date}T00:00:00+08:00`).toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Singapore' })}` : ''}</p>
        {exam.testedTopics.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5" data-tested-topics>
            {exam.testedTopics.map(t => (
              <span key={t} className={`text-[11px] font-semibold rounded-full px-2.5 py-0.5 ${groups.untouched.includes(t) ? 'bg-gray-100 text-gray-500' : 'bg-navy/10 text-navy'}`}>{t}</span>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-[12px] text-gray-500">No tested topics keyed for this paper yet — everything in your book is shown.</p>
        )}
      </div>

      <Group title="⚠️ Still costing you marks" lead="Live mistakes in the tested topics. Thirty seconds each: what went wrong, what you do instead." items={groups.mistakes} empty="No live mistakes in these topics. Good." />
      {groups.skills.length > 0 && (
        <Group title="💬 Keeps coming up" lead="Skills you keep asking the app about in these topics." items={groups.skills} empty="" />
      )}
      <Group title="💾 Answers you saved" lead="Cover the answer, try it again, then compare." items={groups.saves} empty="Nothing saved in these topics." />
      <Group title="📷 Your photos and clippings" lead="School notes and cut-outs from marked papers in these topics." items={groups.photos} empty="No photos or clippings in these topics." />

      <section className="space-y-2">
        <div>
          <h2 className="text-sm font-bold text-navy">📐 Formulas you have met here</h2>
          <p className="text-[12px] text-gray-500 mt-0.5">The ones that cost marks are flagged. <Link href="/app/my-notes/formulas" className="font-semibold text-navy underline">Whole sheet</Link></p>
        </div>
        <FormulaSheet sections={sections} emptyLine="No formulas filed for these topics yet." />
      </section>

      {groups.untouched.length > 0 && (
        <p className="text-[12px] text-gray-500" data-before-untouched>
          Nothing in your book touches {groups.untouched.join(', ')} yet.
        </p>
      )}
    </div>
  );
}
