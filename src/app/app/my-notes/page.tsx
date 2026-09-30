// /app/my-notes — "My Notebook": the student's mistakes, grouped by the paper
// each was last seen on (21 Sep 2026, Adrian: "we should really simplify").
//
// One list. Newest paper first, older papers folded under "Earlier papers",
// fixed entries under "Fixed (n)" at the foot, the weakest-topics line on top.
// Every card carries "I've fixed this" and "Remove" (mistake-actions.tsx).
//
// Since 1 Oct 2026 a card is one lost-marks QUESTION and shows the comparison
// on its face — the student's working with the wrong line marked beside the
// red pen's right steps (app/marking/MistakeCompare.tsx, rendered here on the
// server, KaTeX and all) — Adrian: "see their mistakes and the correct steps
// side by side … without clicking the review button". The Review deck went
// with it. The comparison is rendered for the OPEN paper groups; "Earlier
// papers" is a link to `?earlier=1`, which renders every group (a year of
// papers' KaTeX is too much to ship for a fold nobody opens).
// The rows come from notebook_mistakes (SPEC-PORTAL-V2 §6): born from released
// papers and graded practice, fading as clean results arrive — Still happening,
// Getting better, Fixed; evidence can bring one back.
//
// Gone with the simplification (their tables stay for export / retention):
// search, ✍️ private notes, 📷 photos and ✂️ clippings, 📖 pages from Adrian,
// 📐 My formulas, 📝 Before the paper, the filter chips, and earlier the
// opt-in bands (saved answers, keeps coming up, one thing a day).
//
// /app/plan redirects here. Server component: reads with the service key
// scoped to the logged-in student's portal identity (rec… / acct:<uuid>,
// lib/portal-auth.portalIdentity) — the table has RLS with no policies, so
// this filter IS the access control (the /app/marking pattern).
//
// Deliberately NOT behind requireFullPortal(): everything here derives from
// marked papers (in the marking-only beta allowlist) — an allowed page simply
// never calls the gate (lib/portal-beta.ts).
import Link from 'next/link';
import { portalIdentity, sessionAccount } from '@/lib/portal-auth';
import { explainClipVisible } from '@/lib/portal-beta';
import { loadNotebook, type NotebookSubjectPanel } from '@/lib/notebook-load';
import { OPEN_GROUPS } from '@/lib/notebook-groups';
import NotebookMistakes, { type CompareNodes } from './mistakes';
import MistakeCompare from '../marking/MistakeCompare';
import SubjectPanels, { type SubjectPanel } from '../marking/SubjectPanels';
import { subjectPill } from '@/lib/portal-subjects';
import 'katex/dist/katex.min.css';

export const dynamic = 'force-dynamic';

const CARD = 'bg-white rounded-2xl border border-black/5 shadow-sm';

/** The comparison for every card in the groups the page shows — open ones, or all with `?earlier=1`. */
function compareNodes(p: NotebookSubjectPanel, all: boolean, explain: boolean): CompareNodes {
  const out: CompareNodes = {};
  for (const g of all ? p.cardGroups : p.cardGroups.slice(0, OPEN_GROUPS)) {
    const paper = p.papers.get(g.key);
    if (!paper) continue;
    for (const c of g.cards) {
      const q = paper.dropped.find(x => x.questionNumber === c.questionNumber);
      if (q) out[c.key] = <MistakeCompare q={q} runId={paper.id} explain={explain} />;
    }
  }
  return out;
}

export default async function MyNotebookPage({ searchParams }: { searchParams: Promise<{ earlier?: string }> }) {
  const { earlier } = await searchParams;
  const showEarlier = earlier === '1';
  // Adrian's admin cookie may browse /app/* without a student session, but a
  // notebook belongs to a student — show the pointer card.
  const account = await sessionAccount();
  const sid: string | null = account ? portalIdentity(account) : null;

  if (!account || !sid) {
    return (
      <div className="space-y-4 pb-24 sm:pb-4">
        <h1 className="text-xl font-bold text-navy pt-1">My Notebook</h1>
        <div className={`${CARD} p-5`}>
          <p className="text-sm text-gray-600">
            My Notebook is built from a student&apos;s own marked papers.{' '}
            <Link href="/login" className="font-semibold text-navy underline">Log in as a student</Link> to see one.
          </p>
        </div>
      </div>
    );
  }

  const { subjects, defaultSubject, groups, weakest } = await loadNotebook(account, sid);
  const explain = await explainClipVisible(sid);
  // One tab per subject (30 Sep 2026), the Papers tab's own switcher; one subject → no tabs.
  const panels: SubjectPanel[] = subjects.map(p => ({
    key: p.subject,
    // Four or more tabs don't fit a phone with full names — use the pill's short text.
    label: subjects.length > 3 ? (subjectPill(p.subject)?.text ?? p.subject) : p.subject,
    tone: subjectPill(p.subject)?.tone ?? 'other',
    count: p.groups.groups.reduce((n, g) => n + g.mistakes.length, 0),
    content: <NotebookMistakes initial={p.groups} cardGroups={p.cardGroups} compare={compareNodes(p, showEarlier, explain)} showEarlier={showEarlier} weakest={p.weakest} />,
  }));

  return (
    <div className="space-y-4 pb-24 sm:pb-4">
      <div className="pt-1">
        <h1 className="text-xl font-bold text-navy">My Notebook</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          What each marked paper found, so you know what to fix before the next one.
        </p>
      </div>
      {panels.length > 0
        ? <SubjectPanels panels={panels} defaultKey={defaultSubject ?? panels[0].key} rememberKey="portal_notebook_subject" />
        : <NotebookMistakes initial={groups} cardGroups={[]} compare={{}} showEarlier={showEarlier} weakest={weakest} />}
    </div>
  );
}
