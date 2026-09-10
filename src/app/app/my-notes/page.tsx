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
//   1b. Keeps coming up (10 Sep 2026, OPT-IN — Settings → "Show skills I
//      keep asking about"): the bank sub-skills the student keeps asking the
//      app about, from Supabase ask_skills (lib/ask-signal.ts, pure/tested).
//      An ask is not a verdict, so this is a softer band beside the mistakes,
//      not a row in them.
//   2. (Questions to retry — DROPPED 10 Sep 2026, Adrian: nobody ever
//      attempted one in a fortnight of being live. notebook_entries rows still
//      accrue at release for export/retention; the band and RetryCard are gone.)
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
import { loadMistakes, type MistakeRow } from '@/lib/notebook-mistakes-store';
import { bandOf, displayOrder, latestSighting, shortDate, sightingLine, stateLabel } from '@/lib/notebook-mistakes';
import { askLineContext, askLineTitle, askSignalLine, askSignalOn, askStateLabel, type AskSignalLine } from '@/lib/ask-signal';
import { loadAskSignal } from '@/lib/ask-signal-store';
import { listStudentAssignments } from '@/lib/portal-assignments';
import { isPage } from '@/lib/assignments';
import { CorrectedButton } from './mistake-actions';
import { MAX_NOTES_PER_STUDENT, type MyNoteRow, type TopicOptionGroup } from '@/lib/portal-notes';
import { getTopicsForPaperLevel } from '@/lib/canonical-topics';
import { qbLevelsFor } from '@/lib/qb-levels';
import MyNotesGallery from './my-notes-gallery';

export const dynamic = 'force-dynamic';

const CARD = 'bg-white rounded-2xl border border-black/5 shadow-sm';
const BAND = 'text-xs font-semibold uppercase tracking-wide text-gray-400';


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
  const [clippings, mistakes, askLines, pages] = await Promise.all([
    getSupabaseAdmin()
      .from('portal_notes')
      .select('id, run_id, source_label, topic, image_url, note, created_at')
      .eq('airtable_student_id', sid)
      .order('created_at', { ascending: false })
      .limit(MAX_NOTES_PER_STUDENT)
      .then(r => (r.data ?? []) as MyNoteRow[], () => [] as MyNoteRow[]),
    // The read applies the 14-day "Corrected" → Fixed sweep on the way out.
    loadMistakes(svc, sid).catch((): MistakeRow[] => []),
    // Keeps coming up (opt-in — Settings → "Show skills I keep asking about"):
    // the student's own asks from Supabase ask_skills, folded on the fly,
    // never stored on this side. Off → no read, no band.
    askSignalOn(account?.prefs) ? loadAskSignal(svc, sid) : Promise.resolve([] as AskSignalLine[]),
    // Pages Adrian pushed (SPEC-NOTEBOOK-V2 §12) — the "From Adrian" band, newest first.
    listStudentAssignments(sid, account).then(rows => rows.filter(isPage), () => []),
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
          Built from your marked papers and your own photos — your mistakes as they fade, and everything you&apos;ve saved.
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

      {/* From Adrian — pages he pushed to the class (11 Sep 2026, SPEC-NOTEBOOK-V2
          §12: a formula sheet, notes, a worked example). Read-only, nothing to
          hand in; the full page lives on /app/assignments/[id]. Hidden at zero. */}
      {pages.length > 0 && (
        <section data-pages-band>
          <p className={`${BAND} mb-2`}>📖 From Adrian <span className="normal-case font-medium">· {pages.length}</span></p>
          <div className="space-y-2">
            {pages.map(p => (
              <Link key={p.id} href={`/app/assignments/${p.id}`} className={`${CARD} block p-4 hover:bg-[hsl(45,100%,99%)] active:scale-[0.99] transition`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-navy truncate">{p.title}</p>
                    <p className="text-[12px] text-gray-500 mt-0.5">
                      {p.topic ? `${p.topic} · ` : ''}sent {new Date(p.created_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', timeZone: 'Asia/Singapore' })}
                    </p>
                    {p.note && <p className="text-[13px] text-gray-700 mt-1 italic">&ldquo;{p.note}&rdquo;</p>}
                  </div>
                  <span className="text-gray-400 shrink-0">›</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Band 1b — Keeps coming up (10 Sep 2026, OPT-IN via Settings →
          "Show skills I keep asking about"): the bank sub-skills the student
          asked the app about ASK_SIGNAL_MIN+ times in the last fortnight, from
          Supabase ask_skills (the bot files every linked ask under a
          subgroups.name). Folded at render time, so the line fades by
          itself — Coming up less for the following fortnight, then gone.
          Asking is not a mistake: softer ink, no Corrected button, no
          evidence, no practice links. Hidden at zero like every band. */}
      {askLines.length > 0 && (
        <section data-ask-signal-band>
          <p className={`${BAND} mb-2`}>
            Keeps coming up in your questions <span className="normal-case font-medium">· {askLines.length}</span>
          </p>
          <div className="space-y-2">
            {askLines.map(l => (
              <div key={l.key} className={`${CARD} p-4 ${l.state === 'up' ? '' : 'opacity-75'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className={`text-sm font-bold ${l.state === 'up' ? 'text-navy' : 'text-gray-600'}`}>{askLineTitle(l)}</p>
                    {askLineContext(l) && (
                      <p className="text-[12px] text-gray-500 mt-0.5">{askLineContext(l)}</p>
                    )}
                    <p className="text-[12px] text-gray-500 mt-0.5">{askSignalLine(l)}</p>
                  </div>
                  <span className={`shrink-0 text-[11px] rounded-full px-2.5 py-0.5 font-semibold whitespace-nowrap ${l.state === 'up' ? 'bg-sky-50 text-sky-800' : 'bg-gray-100 text-gray-600'}`}>
                    {askStateLabel(l.state)}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-gray-400 mt-1.5">
            From what you ask in the app. Asking isn&apos;t a mistake — this is only what keeps coming up.{' '}
            <Link href="/app/settings" className="underline">Turn it off in Settings</Link>.
          </p>
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

