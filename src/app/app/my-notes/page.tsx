// /app/my-notes — "My Notebook": the student's one personal tab (Adrian,
// 2026-08-28: "yes do My Plan → My Notebook"), folding the three
// marking-derived fragments into a single page at the URL My Notes already
// owned (no URL churn):
//
//   1. This week's focus — buildPlan (lib/plan.ts, pure) over the shared
//      papers+notebook assembly (lib/notebook-data.ts), the same derivation
//      Home's focus card uses. Fail-soft: hidden when there is nothing to say.
//   2. Questions to retry — the notebook's dropped-marks entries (live only,
//      retryOrder in lib/notebook.ts), each expandable to the full picture
//      from the run: the question as marked, the marker's comment, per-part
//      slips, and the worked solution when the run is still inside the
//      papers window. A bank twin (variant_qb_id) also gets a "Try a similar
//      one" deep link into /app/practice?qid=….
//   3. ✂️ My clippings — the existing gallery (edit note / delete, in
//      my-notes-gallery.tsx, talking to /api/portal/my-notes).
//
// /app/plan now redirects here. Server component: reads with the service key
// scoped to the logged-in student's portal identity (rec… / acct:<uuid>,
// lib/portal-auth.portalIdentity) — portal_notes and notebook_entries have
// RLS with no policies, so this filter IS the access control (the
// /app/marking pattern).
//
// Deliberately NOT behind requireFullPortal(): everything here derives from
// marked papers (which are in the marking-only beta allowlist) or is the
// student's own clippings — an allowed page simply never calls the gate
// (lib/portal-beta.ts).
import Link from 'next/link';
import { portalIdentity, sessionAccount } from '@/lib/portal-auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { createServiceClient } from '@/lib/supabase-server';
import { loadPapersAndNotebook, type NotebookEntryRow, type PapersAndNotebook } from '@/lib/notebook-data';
import { buildPlan, type RevisionPlan } from '@/lib/plan';
import { retryOrder, sgtToday } from '@/lib/notebook';
import { MAX_NOTES_PER_STUDENT, type MyNoteRow } from '@/lib/portal-notes';
import type { StudentQuestion } from '@/lib/portal-marking';
import AnnotatedSolution from '../marking/AnnotatedSolution';
import { mathHtml } from '@/lib/math-inline';
import MyNotesGallery from './my-notes-gallery';
// Retry-card detail carries inline $…$ TeX (question prompt, comment, slips)
// — mathHtml KaTeXes only the math spans, and this stylesheet is what makes
// the output render as maths (same treatment /app/marking gives these fields).
import 'katex/dist/katex.min.css';

export const dynamic = 'force-dynamic';

const CARD = 'bg-white rounded-2xl border border-black/5 shadow-sm';
const BAND = 'text-xs font-semibold uppercase tracking-wide text-gray-400';

/** Entries shown before the "Show all" expander. */
const RETRY_CAP = 12;

export default async function MyNotebookPage() {
  // The plan-page pattern: Adrian's admin cookie may browse /app/* without a
  // student session, but a notebook belongs to a student — show the pointer
  // card. sessionAccount() is per-request cached (lib/portal-auth.ts), so this
  // shares the layout's auth lookup instead of repeating it.
  const account = await sessionAccount();
  // rec… for tuition, acct:<uuid> for strangers (lib/portal-auth.portalIdentity)
  // — a paying stranger's notebook builds from their own hand-ins; only a truly
  // account-less session (Adrian's admin cookie browsing) gets the pointer card.
  const sid: string | null = account ? portalIdentity(account) : null;

  if (!sid) {
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

  // The clippings and the papers+notebook assembly are independent — one
  // parallel batch. Both fail soft: a load error hides its band, never the page.
  const svc = createServiceClient();
  const [assembly, clippings] = await Promise.all([
    loadPapersAndNotebook(svc, sid, sgtToday()).catch(
      (): PapersAndNotebook => ({ ok: false, error: 'papers' }),
    ),
    getSupabaseAdmin()
      .from('portal_notes')
      .select('id, run_id, source_label, topic, image_url, note, created_at')
      .eq('airtable_student_id', sid)
      .order('created_at', { ascending: false })
      .limit(MAX_NOTES_PER_STUDENT)
      .then(r => (r.data ?? []) as MyNoteRow[], () => [] as MyNoteRow[]),
  ]);

  let plan: RevisionPlan | null = null;
  let retry: NotebookEntryRow[] = [];
  // The solution reveal lives on the run, never on the notebook row (a
  // dropped-marks entry only mirrors the score) — index every marked
  // question by run+number once so each card can look its own up in O(1).
  const questionByKey = new Map<string, StudentQuestion>();
  if (assembly.ok) {
    plan = buildPlan(
      assembly.papers,
      assembly.entries.map(e => ({
        topic: e.topic,
        attempts: e.attempts,
        questionNumber: e.question_number,
        paperName: e.paper_name,
      })),
    );
    retry = retryOrder(assembly.entries);
    for (const paper of assembly.papers) {
      for (const q of paper.questions) questionByKey.set(`${paper.id}|${q.questionNumber}`, q);
    }
  }
  // Null when the run fell outside the papers window (MAX_RUNS) or the entry
  // is otherwise orphaned — RetryCard treats that as fail-soft, not an error.
  const questionFor = (e: NotebookEntryRow): StudentQuestion | null =>
    questionByKey.get(`${e.run_id}|${e.question_number}`) ?? null;
  // Under EVIDENCE_MIN marks of evidence the plan has nothing honest to say —
  // treat it as absent (the old /app/plan showed its hand-in funnel here; on
  // this page the clippings band's empty state carries that job).
  const planHasContent =
    !!plan && !plan.empty &&
    (plan.focus.length > 0 || plan.keepWarm.length > 0 || plan.wins.length > 0);

  const shown = retry.slice(0, RETRY_CAP);
  const extra = retry.slice(RETRY_CAP);

  return (
    <div className="space-y-5 pb-24 sm:pb-4">
      <div className="pt-1">
        <h1 className="text-xl font-bold text-navy">My Notebook</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Built from your marked papers — focus topics, questions to retry, and your saved clippings.
        </p>
      </div>

      {/* Band 1 — This week's focus (Home's derivation; hidden when empty) */}
      {plan && planHasContent && (
        <section>
          <p className={`${BAND} mb-2`}>This week&apos;s focus</p>
          <div className={`${CARD} p-4 space-y-3`}>
            {plan.focus.length > 0 && (
              <div>
                <div className="flex flex-wrap gap-2">
                  {plan.focus.map(f => (
                    <Link
                      key={f.topic}
                      href={f.practiceHref}
                      className="text-sm bg-rose-50 text-rose-800 rounded-full px-3 py-1 hover:bg-rose-100 transition-colors"
                    >
                      {f.topic} <span className="text-rose-500">›</span>
                    </Link>
                  ))}
                </div>
                <p className="text-[11px] text-slate-400 mt-2">
                  Where your marked papers say the marks are going — tap one to practise it.
                </p>
              </div>
            )}
            {plan.keepWarm.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700/80">Keep warm</span>
                {plan.keepWarm.map(t => (
                  <Link
                    key={t.topic}
                    href={t.practiceHref}
                    className="text-[13px] bg-amber-50 text-amber-800 rounded-full px-2.5 py-0.5 hover:bg-amber-100 transition-colors"
                  >
                    {t.topic} <span className="font-semibold">{t.score}%</span>
                  </Link>
                ))}
              </div>
            )}
            {plan.wins.length > 0 && (
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700/80">Wins</span>
                <ul className="mt-1 space-y-0.5">
                  {plan.wins.map((w, i) => (
                    <li key={i} className="flex items-center justify-between gap-3 text-[12px] text-gray-600">
                      <span className="min-w-0 truncate">{w.kind === 'paper' ? '📄' : '🏆'} {w.label}</span>
                      <span className="shrink-0 text-gray-400">{w.dateLabel}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Band 2 — Questions to retry (live dropped-marks notebook entries,
          grouped by topic; hidden at zero like the hub cards) */}
      {retry.length > 0 && (
        <section>
          <p className={`${BAND} mb-2`}>
            Questions to retry <span className="normal-case font-medium">· {retry.length}</span>
          </p>
          <div className="space-y-2">
            {shown.map(e => (
              <RetryCard key={e.id} e={e} question={questionFor(e)} />
            ))}
          </div>
          {extra.length > 0 && (
            <details className="group mt-2">
              <summary className={`${CARD} block cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden px-4 py-2.5 text-center text-sm font-semibold text-navy hover:bg-navy/5 transition-colors`}>
                <span className="group-open:hidden">Show all {retry.length} ▾</span>
                <span className="hidden group-open:inline">Show fewer ▴</span>
              </summary>
              <div className="space-y-2 mt-2">
                {extra.map(e => (
                  <RetryCard key={e.id} e={e} question={questionFor(e)} />
                ))}
              </div>
            </details>
          )}
        </section>
      )}

      {/* Band 3 — the clippings gallery, behaviour unchanged (lightbox, edit
          note, delete with confirm — my-notes-gallery.tsx). */}
      <section>
        <p className={`${BAND} mb-2`}>✂️ My clippings</p>
        <MyNotesGallery initialNotes={clippings} />
      </section>
    </div>
  );
}

/**
 * One dropped-marks entry: topic, where it came from, and the bank-twin
 * door — expanded (native <details>, no client JS) to the full picture from
 * the run: the question as marked, the marker's comment, per-part slips, and
 * the worked solution when one is available. `question` is the matching
 * StudentQuestion from questionFor() above; null is fail-soft (run outside
 * the papers window, or an older row with nothing more to show) and simply
 * narrows what the open body renders — never a placeholder.
 */
function RetryCard({ e, question }: { e: NotebookEntryRow; question: StudentQuestion | null }) {
  const lost = Math.max(0, e.max_marks - e.awarded);
  // slips is jsonb of unknown shape — only ever render entries that are
  // actually strings, silently dropping anything else rather than crashing.
  const slips = Array.isArray(e.slips) ? e.slips.filter((s): s is string => typeof s === 'string') : [];

  const practiceLink = e.variant_qb_id ? (
    <Link
      href={`/app/practice?qid=${encodeURIComponent(e.variant_qb_id)}&from=notebook`}
      className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-800 rounded-xl px-3 py-1.5 text-[13px] font-semibold hover:bg-amber-100 transition-colors"
    >
      ✏️ Try a similar one →
    </Link>
  ) : e.topic ? (
    // No bank twin picked for this one (yet) — the card must still DO
    // something on tap (Adrian, 2026-08-29): practise the topic instead.
    <Link
      href={`/app/practice?topic=${encodeURIComponent(e.topic)}`}
      className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-800 rounded-xl px-3 py-1.5 text-[13px] font-semibold hover:bg-amber-100 transition-colors"
    >
      ✏️ Practise this topic →
    </Link>
  ) : null;

  return (
    <details className={`${CARD} group`}>
      {/* <summary>'s content model is phrasing-only — span (not div/p), forced
          to block/flex via classes, keeps the markup conformant while looking
          identical to the plain-div face this replaces. */}
      <summary className="p-4 block cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
        <span className="flex items-start justify-between gap-3">
          <span className="min-w-0 block">
            <span className="block text-sm font-bold text-navy truncate">{e.topic ?? 'General'}</span>
            <span className="block text-[12px] text-gray-500 mt-0.5 truncate">
              Q{e.question_number}
              {e.paper_name ? ` · ${e.paper_name}` : ''}
            </span>
          </span>
          <span className="shrink-0 flex items-center gap-1.5">
            <span
              className="text-[12px] rounded-full bg-rose-50 text-rose-800 px-2.5 py-0.5 font-semibold"
              title={`Dropped ${lost} mark${lost === 1 ? '' : 's'} here`}
            >
              {e.awarded}/{e.max_marks}
            </span>
            <span className="text-gray-400 group-open:rotate-90 transition-transform inline-block">›</span>
          </span>
        </span>
        <span className="block text-[11px] text-gray-400 mt-1.5 group-open:hidden">see detail</span>
      </summary>

      <div className="px-4 pb-4 pt-3 space-y-2.5 border-t border-gray-100">
        {e.question_prompt && (
          <MathText text={e.question_prompt} className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed" />
        )}
        {e.comment && (
          <MathText text={e.comment} className="text-[13px] text-gray-700 leading-snug" />
        )}
        {slips.length > 0 && (
          <ul className="space-y-1">
            {slips.map((s, i) => (
              <li key={i} className="text-[12px] text-amber-900 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5">
                <MathText text={s} />
              </li>
            ))}
          </ul>
        )}
        {question?.solution && (
          <details className="group/sol">
            <summary className="cursor-pointer text-[13px] font-semibold text-navy list-none flex items-center gap-1.5">
              <span className="text-gray-400 group-open/sol:rotate-90 transition-transform inline-block">›</span>
              📖 The worked solution, annotated
            </summary>
            <AnnotatedSolution solution={question.solution} schemes={question.schemes} />
          </details>
        )}
        {practiceLink}
      </div>
    </details>
  );
}

// Server-side KaTeX over inline $…$ spans (same treatment /app/marking gives
// these fields — lib/math-inline decides what is maths and what is a dollar sign).
function MathText({ text, className }: { text: string; className?: string }) {
  return <div className={className} dangerouslySetInnerHTML={{ __html: mathHtml(text) }} />;
}
