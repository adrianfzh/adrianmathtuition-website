// /app/my-notes — "My Notebook": the student's one personal tab (Adrian,
// 2026-08-28: "yes do My Plan → My Notebook"), and since 11 Sep 2026 ONE STREAM
// (SPEC-NOTEBOOK-V2 §9, Adrian: "build this"): a search box, filter chips, then
// every item newest first with an icon for what it is — nothing is filed by
// hand, you scroll or search. What lands in the stream:
//
//   • Your mistakes — the living list of mistake patterns (SPEC-PORTAL-V2 §6,
//     notebook_mistakes via lib/notebook-mistakes-store): born from released
//     papers and graded practice, fading as clean results arrive — Still
//     happening, Getting better, Fixed. "Corrected" (mistake-actions.tsx) lets
//     the student mark one fixed; evidence can bring it back. Each links to the
//     Practice items that fix it when the hand-back named any.
//   • 💾 Saved answers (SPEC-NOTEBOOK-V2 §1, opt-in) — from the Ask tab, filed
//     under topic + skill, title the student's own; rename / delete inline.
//   • 📷 Photos and ✂️ clippings (portal_notes; lightbox in my-notes-gallery.tsx,
//     ➕ Add a photo beside the search box; photos are read for topic + skill +
//     searchable text, lib/photo-tag.ts).
//   • ✍️ My notes (SPEC-NOTEBOOK-V2 §8) — typed by the student, "✍️ Write"
//     beside the search box; the student's own words, read by nothing else.
//   • 📖 Pages from Adrian (SPEC-NOTEBOOK-V2 §12) — open their own route.
//   • 💬 Keeps coming up (opt-in — Settings → "Show skills I keep asking about"):
//     the bank sub-skills the student keeps asking the app about (lib/ask-signal).
//   (Questions to retry — DROPPED 10 Sep 2026: nobody ever attempted one.
//   notebook_entries rows still accrue at release for export/retention.)
//
// Above the stream, when it applies:
//   • 📝 Before the paper (§4) — one card per exam within BEFORE_PAPER_DAYS,
//     opening /app/my-notes/before/[examId]: the book, narrowed to the tested
//     topics, plus the formulas met there.
//   • 📐 My formulas (§5) — the formula sheet that grows, /app/my-notes/formulas.
//
// The items are built by lib/notebook-load.ts (one loader for the three
// Notebook pages; lib/notebook-stream.ts is the pure builder) and filtered on
// the client (stream.tsx). ?open=<item id> lands with that item open — the
// Home resurface card's door (lib/resurface.ts).
//
// /app/plan redirects here. Server component: reads with the service key
// scoped to the logged-in student's portal identity (rec… / acct:<uuid>,
// lib/portal-auth.portalIdentity) — the tables have RLS with no policies, so
// this filter IS the access control (the /app/marking pattern).
//
// Deliberately NOT behind requireFullPortal(): everything here derives from
// marked papers (in the marking-only beta allowlist) or is the student's own —
// an allowed page simply never calls the gate (lib/portal-beta.ts).
import Link from 'next/link';
import { portalIdentity, sessionAccount } from '@/lib/portal-auth';
import { loadNotebook } from '@/lib/notebook-load';
import { beforePaperLine, examsInWindow } from '@/lib/before-paper';
import { topicsMet } from '@/lib/formula-sheet';
import NotebookStream from './stream';

export const dynamic = 'force-dynamic';

const CARD = 'bg-white rounded-2xl border border-black/5 shadow-sm';

export default async function MyNotebookPage({ searchParams }: { searchParams: Promise<{ open?: string }> }) {
  const { open } = await searchParams;
  // The plan-page pattern: Adrian's admin cookie may browse /app/* without a
  // student session, but a notebook belongs to a student — show the pointer
  // card. sessionAccount() is per-request cached (lib/portal-auth.ts).
  const account = await sessionAccount();
  const sid: string | null = account ? portalIdentity(account) : null;

  if (!account || !sid) {
    return (
      <div className="space-y-4 pb-24 sm:pb-4">
        <h1 className="text-xl font-bold text-navy pt-1">My Notebook</h1>
        <div className={`${CARD} p-5`}>
          <p className="text-sm text-gray-600">
            My Notebook is built from a student&apos;s own marked papers and clippings.{' '}
            <Link href="/login" className="font-semibold text-navy underline">Log in as a student</Link> to see one.
          </p>
        </div>
      </div>
    );
  }

  const { items, exams, topicGroups } = await loadNotebook(account, sid);
  const soon = examsInWindow(exams).slice(0, 3);
  const metTopics = topicsMet(items).length;

  return (
    <div className="space-y-4 pb-24 sm:pb-4">
      <div className="pt-1">
        <h1 className="text-xl font-bold text-navy">My Notebook</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Everything lands here by itself — your mistakes as they fade, answers you saved, your photos, pages from Adrian. Scroll, or search.
        </p>
      </div>

      {soon.map(exam => (
        <Link key={exam.id} href={`/app/my-notes/before/${encodeURIComponent(exam.id)}`} data-before-paper={exam.id}
          className={`${CARD} block p-4 border-l-4 border-l-amber-400 hover:bg-[hsl(45,100%,99%)] active:scale-[0.99] transition`}>
          <p className="text-[11px] font-bold uppercase tracking-wider text-amber-700">📝 Before the paper</p>
          <p className="text-sm font-bold text-navy mt-0.5">{beforePaperLine(exam)}</p>
          <p className="text-[12px] text-gray-600 mt-1">
            Your mistakes, saved answers, photos and the formulas for the tested topics — on one page.
          </p>
        </Link>
      ))}

      {metTopics > 0 && (
        <Link href="/app/my-notes/formulas" data-formulas-link
          className="inline-flex items-center gap-1.5 text-[12px] font-semibold bg-white text-navy border border-black/10 rounded-full px-3 py-1.5 hover:bg-navy/5">
          📐 My formulas <span className="opacity-60">· {metTopics} {metTopics === 1 ? 'topic' : 'topics'}</span>
        </Link>
      )}

      <NotebookStream items={items} topicGroups={topicGroups} openId={typeof open === 'string' && open ? open : null} />
    </div>
  );
}
