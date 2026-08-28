// /app/my-notes — "My Notebook": the student's one personal tab (Adrian,
// 2026-08-28: "yes do My Plan → My Notebook"), folding the three
// marking-derived fragments into a single page at the URL My Notes already
// owned (no URL churn):
//
//   1. This week's focus — buildPlan (lib/plan.ts, pure) over the shared
//      papers+notebook assembly (lib/notebook-data.ts), the same derivation
//      Home's focus card uses. Fail-soft: hidden when there is nothing to say.
//   2. Questions to retry — the notebook's dropped-marks entries (live only,
//      retryOrder in lib/notebook.ts); a bank twin (variant_qb_id) gets a
//      "Try a similar one" deep link into /app/practice?qid=….
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
import MyNotesGallery from './my-notes-gallery';

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
  }
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
              <RetryCard key={e.id} e={e} />
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
                  <RetryCard key={e.id} e={e} />
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

/** One dropped-marks entry: topic, where it came from, and the bank-twin door. */
function RetryCard({ e }: { e: NotebookEntryRow }) {
  const lost = Math.max(0, e.max_marks - e.awarded);
  return (
    <div className={`${CARD} p-4`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-navy truncate">{e.topic ?? 'General'}</p>
          <p className="text-[12px] text-gray-500 mt-0.5 truncate">
            Q{e.question_number}
            {e.paper_name ? ` · ${e.paper_name}` : ''}
          </p>
        </div>
        <span
          className="shrink-0 text-[12px] rounded-full bg-rose-50 text-rose-800 px-2.5 py-0.5 font-semibold"
          title={`Dropped ${lost} mark${lost === 1 ? '' : 's'} here`}
        >
          {e.awarded}/{e.max_marks}
        </span>
      </div>
      {e.variant_qb_id ? (
        <Link
          href={`/app/practice?qid=${encodeURIComponent(e.variant_qb_id)}&from=notebook`}
          className="mt-2.5 inline-flex items-center gap-1.5 bg-amber-50 text-amber-800 rounded-xl px-3 py-1.5 text-[13px] font-semibold hover:bg-amber-100 transition-colors"
        >
          ✏️ Try a similar one →
        </Link>
      ) : e.topic ? (
        // No bank twin picked for this one (yet) — the card must still DO
        // something on tap (Adrian, 2026-08-29): practise the topic instead.
        <Link
          href={`/app/practice?topic=${encodeURIComponent(e.topic)}`}
          className="mt-2.5 inline-flex items-center gap-1.5 bg-amber-50 text-amber-800 rounded-xl px-3 py-1.5 text-[13px] font-semibold hover:bg-amber-100 transition-colors"
        >
          ✏️ Practise this topic →
        </Link>
      ) : null}
    </div>
  );
}
