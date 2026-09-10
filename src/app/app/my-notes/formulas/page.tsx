// /app/my-notes/formulas — the formula sheet that grows (SPEC-NOTEBOOK-V2 §5):
// the formulas for the topics THIS student has met, with the ones that cost
// marks flagged. The same sheet is the formulas section of Before the paper.
import Link from 'next/link';
import { portalIdentity, sessionAccount } from '@/lib/portal-auth';
import { loadNotebook } from '@/lib/notebook-load';
import { buildFormulaSheet, topicsMet } from '@/lib/formula-sheet';
import { loadFormulaeByLevel } from '@/lib/formula-sheet-store';
import FormulaSheet from '../formula-sheet';

export const dynamic = 'force-dynamic';

const CARD = 'bg-white rounded-2xl border border-black/5 shadow-sm';

export default async function MyFormulasPage() {
  const account = await sessionAccount();
  const sid = account ? portalIdentity(account) : null;
  if (!account || !sid) {
    return (
      <div className="space-y-4 pb-24 sm:pb-4">
        <h1 className="text-xl font-bold text-navy pt-1">My formulas</h1>
        <div className={`${CARD} p-5 text-sm text-gray-600`}>
          <Link href="/login" className="font-semibold text-navy underline">Log in as a student</Link> to see your formula sheet.
        </div>
      </div>
    );
  }

  const { items, levelKeys } = await loadNotebook(account, sid);
  const topics = topicsMet(items);
  const formulaeByLevel = await loadFormulaeByLevel(levelKeys, topics);
  const sections = buildFormulaSheet({
    topics, levelKeys, formulaeByLevel,
    liveMistakes: items.filter(it => it.kind === 'mistake' && it.mistake?.live),
  });

  return (
    <div className="space-y-4 pb-24 sm:pb-4">
      <div className="pt-1">
        <Link href="/app/my-notes" className="text-[12px] font-semibold text-gray-500 hover:text-navy">← My Notebook</Link>
        <h1 className="text-xl font-bold text-navy mt-1">📐 My formulas</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Not the whole syllabus — the formulas for the topics you have actually met, in your marked papers, your asks and your photos. It grows as you do. The ones that cost you marks are flagged.
        </p>
      </div>
      <FormulaSheet sections={sections} emptyLine="Nothing here yet — once a marked paper, an ask or a photo lands in your notebook, the formulas for its topics appear here." />
    </div>
  );
}
