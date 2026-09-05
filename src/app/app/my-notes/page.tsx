// /app/my-notes — "My Notebook": the student's one personal tab (Adrian,
// 2026-08-28: "yes do My Plan → My Notebook"), folding the three
// marking-derived fragments into a single page at the URL My Notes already
// owned (no URL churn):
//
//   1. Your mistakes — the living list of the student's mistake patterns
//      (SPEC-PORTAL-V2 §6, notebook_mistakes via lib/notebook-mistakes-store):
//      one row per pattern, born from released papers and graded practice,
//      fading as clean results arrive — Still happening, then Getting better,
//      then a compact Fixed line. "Corrected" (mistake-actions.tsx) lets the
//      student mark one fixed; evidence can bring it back. Each row links to
//      the Practice items that fix it when the hand-back has named any.
//      Fail-soft: hidden at zero. ("This week's focus", buildPlan over the
//      papers, sat here 2026-08-28 → 6 Sep 2026 and was removed with §0/§6.)
//   2. Questions to retry — the notebook's dropped-marks entries (live only,
//      retryOrder in lib/notebook.ts), each expandable to the full picture
//      from the run: the question as marked, the marker's comment, per-part
//      slips, and the worked solution when the run is still inside the
//      papers window. A bank twin (variant_qb_id) also gets a "Try a similar
//      one" deep link into /app/practice?qid=….
//   3. ✂️ My clippings & photos — the gallery (edit note / delete, in
//      my-notes-gallery.tsx, talking to /api/portal/my-notes): clippings cut
//      from marked papers + 📷 photos of work done outside the app (school
//      worksheets, homework — added via ➕ Add a photo, 2026-09-02).
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
import { retryOrder, sgtToday } from '@/lib/notebook';
import { loadMistakes, type MistakeRow } from '@/lib/notebook-mistakes-store';
import { bandOf, displayOrder, latestSighting, shortDate, sightingLine, stateLabel } from '@/lib/notebook-mistakes';
import { CorrectedButton } from './mistake-actions';
import { MAX_NOTES_PER_STUDENT, type MyNoteRow, type TopicOptionGroup } from '@/lib/portal-notes';
import { getTopicsForPaperLevel } from '@/lib/canonical-topics';
import { qbLevelsFor } from '@/lib/qb-levels';
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

  // The clippings, the papers+notebook assembly and the mistakes list are
  // independent — one parallel batch. All fail soft: a load error hides its
  // band, never the page.
  const svc = createServiceClient();
  const [assembly, clippings, mistakes] = await Promise.all([
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
    // The read applies the 14-day "Corrected" → Fixed sweep on the way out.
    loadMistakes(svc, sid).catch((): MistakeRow[] => []),
  ]);

  // Band 1 — the mistakes list in display order (entries with no evidence yet,
  // i.e. placeholders the hand-back linked before the paper released, are left
  // out by displayOrder). The Practice items that fix them: one scoped query
  // for every linked assignment across the list, titles only; anything
  // revoked or not yet released to the student is simply not linked here.
  const bands = displayOrder(mistakes);
  const liveMistakes = bands.stillHappening.length + bands.gettingBetter.length;
  const practiceById = new Map<string, { id: string; title: string }>();
  const linkedIds = [...new Set(mistakes.flatMap(m => m.practice_ids))];
  if (linkedIds.length) {
    try {
      const { data } = await svc
        .from('portal_assignments')
        .select('id, title, status')
        .eq('airtable_student_id', sid)
        .in('id', linkedIds.slice(0, 200));
      for (const a of data ?? []) {
        if (a.status === 'assigned' || a.status === 'submitted' || a.status === 'marked') {
          practiceById.set(String(a.id), { id: String(a.id), title: String(a.title || 'Practice') });
        }
      }
    } catch { /* the list still renders without its practice links */ }
  }
  const practiceFor = (m: MistakeRow) =>
    m.practice_ids.map(id => practiceById.get(id)).filter((p): p is { id: string; title: string } => !!p);

  let retry: NotebookEntryRow[] = [];
  // The solution reveal lives on the run, never on the notebook row (a
  // dropped-marks entry only mirrors the score) — index every marked
  // question by run+number once so each card can look its own up in O(1).
  const questionByKey = new Map<string, StudentQuestion>();
  if (assembly.ok) {
    retry = retryOrder(assembly.entries);
    for (const paper of assembly.papers) {
      for (const q of paper.questions) questionByKey.set(`${paper.id}|${q.questionNumber}`, q);
    }
  }
  // Null when the run fell outside the papers window (MAX_RUNS) or the entry
  // is otherwise orphaned — RetryCard treats that as fail-soft, not an error.
  const questionFor = (e: NotebookEntryRow): StudentQuestion | null =>
    questionByKey.get(`${e.run_id}|${e.question_number}`) ?? null;
  const shown = retry.slice(0, RETRY_CAP);
  const extra = retry.slice(RETRY_CAP);

  // Topic options for the ➕ Add-a-photo tagger: the canonical list for the
  // student's level(s) — the same qbLevelsFor derivation the practice picker
  // starts from — merged by category label and deduped (a Sec 3 student's
  // keys reach both the EM and AM lists twice). Purely optional in the UI.
  const seenTopics = new Set<string>();
  const topicGroups: TopicOptionGroup[] = [];
  for (const { key } of qbLevelsFor(account?.level ?? null, account?.subjects ?? null)) {
    for (const cat of getTopicsForPaperLevel(key)) {
      const fresh = cat.topics.filter(t => !seenTopics.has(t));
      if (fresh.length === 0) continue;
      fresh.forEach(t => seenTopics.add(t));
      const existing = topicGroups.find(g => g.label === cat.label);
      if (existing) existing.topics.push(...fresh);
      else topicGroups.push({ label: cat.label, topics: fresh });
    }
  }

  return (
    <div className="space-y-5 pb-24 sm:pb-4">
      <div className="pt-1">
        <h1 className="text-xl font-bold text-navy">My Notebook</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Built from your marked papers and your own photos — your mistakes as they fade, questions to retry, and everything you&apos;ve saved.
        </p>
      </div>

      {/* Band 1 — Your mistakes (SPEC-PORTAL-V2 §6): one row per mistake
          pattern, fading as clean results arrive. Still happening first, then
          Getting better, then the compact Fixed line so progress stays
          visible. Hidden at zero. */}
      {(liveMistakes > 0 || bands.fixed.length > 0) && (
        <section>
          <p className={`${BAND} mb-2`}>
            Your mistakes{liveMistakes > 0 && <span className="normal-case font-medium"> · {liveMistakes}</span>}
          </p>
          {liveMistakes > 0 && (
            <div className="space-y-2">
              {bands.stillHappening.map(m => (
                <MistakeCard key={m.id} m={m} practice={practiceFor(m)} />
              ))}
              {bands.gettingBetter.map(m => (
                <MistakeCard key={m.id} m={m} practice={practiceFor(m)} />
              ))}
            </div>
          )}
          {bands.fixed.length > 0 && (
            <div className={`${CARD} ${liveMistakes > 0 ? 'mt-2' : ''} px-4 py-3`}>
              <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700/80">Fixed</p>
              <ul className="mt-1 space-y-0.5">
                {bands.fixed.map(m => (
                  <li key={m.id} className="flex items-center justify-between gap-3 text-[12px] text-gray-600">
                    <span className="min-w-0 truncate">✓ {m.title}</span>
                    <span className="shrink-0 text-gray-400">{shortDate(m.last_clean_at ?? m.student_fixed_at)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
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

      {/* Band 3 — the gallery: ✂️ clippings from marked papers + 📷 photos of
          outside work (lightbox, edit note, delete with confirm, ➕ add a
          photo — my-notes-gallery.tsx). */}
      <section>
        <p className={`${BAND} mb-2`}>✂️ My clippings &amp; photos</p>
        <MyNotesGallery initialNotes={clippings} topicGroups={topicGroups} />
      </section>
    </div>
  );
}

/**
 * One mistake pattern: its title, where it was last seen (paper + question, or
 * the practice topic), its state word, the "came back" tag, the Practice items
 * that fix it, and — while it is still live — the Corrected button. Dark rows
 * carry the full ink; Getting-better rows fade so the eye lands on what is
 * still happening.
 */
function MistakeCard({ m, practice }: { m: MistakeRow; practice: { id: string; title: string }[] }) {
  const dark = bandOf(m.state) === 'still-happening';
  const seen = latestSighting(m);
  const where = sightingLine(seen);
  const live = m.state === 'dark' || m.state === 'light';
  return (
    <div className={`${CARD} p-4 ${dark ? '' : 'opacity-75'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`text-sm font-bold ${dark ? 'text-navy' : 'text-gray-600'}`}>{m.title}</p>
          {where && (
            <p className="text-[12px] text-gray-500 mt-0.5">
              {where}
              {m.seen_count > 1 ? ` · seen ${m.seen_count} times` : ''}
            </p>
          )}
          {m.state === 'student_fixed' && (
            <p className="text-[11px] text-gray-400 mt-0.5">you marked this fixed</p>
          )}
        </div>
        <div className="shrink-0 flex flex-col items-end gap-1">
          <span className={`text-[11px] rounded-full px-2.5 py-0.5 font-semibold whitespace-nowrap ${dark ? 'bg-rose-50 text-rose-800' : 'bg-amber-50 text-amber-800'}`}>
            {stateLabel(m.state)}
          </span>
          {m.came_back && (
            <span className="text-[10px] rounded-full bg-rose-100 text-rose-700 px-2 py-0.5 font-semibold whitespace-nowrap">came back</span>
          )}
        </div>
      </div>
      {(practice.length > 0 || live) && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {practice.map(p => (
            <Link
              key={p.id}
              href={`/app/assignments/${p.id}`}
              className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-800 rounded-xl px-3 py-1.5 text-[13px] font-semibold hover:bg-amber-100 transition-colors"
            >
              ✏️ {p.title} →
            </Link>
          ))}
          {live && <CorrectedButton id={m.id} />}
        </div>
      )}
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
