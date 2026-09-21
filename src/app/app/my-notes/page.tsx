// /app/my-notes — "My Notebook": the student's mistakes, grouped by the paper
// each was last seen on (21 Sep 2026, Adrian: "we should really simplify").
//
// One list. Newest paper first, older papers folded under "Earlier papers",
// fixed entries under "Fixed (n)" at the foot, the weakest-topics line on top.
// Every card carries "I've fixed this" and "Remove" (mistake-actions.tsx).
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
import { loadNotebook } from '@/lib/notebook-load';
import NotebookMistakes from './mistakes';

export const dynamic = 'force-dynamic';

const CARD = 'bg-white rounded-2xl border border-black/5 shadow-sm';

export default async function MyNotebookPage() {
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

  const { groups, weakest } = await loadNotebook(account, sid);

  return (
    <div className="space-y-4 pb-24 sm:pb-4">
      <div className="pt-1">
        <h1 className="text-xl font-bold text-navy">My Notebook</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          What each marked paper found, so you know what to fix before the next one.
        </p>
      </div>
      <NotebookMistakes initial={groups} weakest={weakest} />
    </div>
  );
}
