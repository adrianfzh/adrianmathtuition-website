// /app/marking — the student's own marked scripts.
//
// This is the destination the release nudge points at: triage stamps
// `released_at`, Telegram rings the doorbell with a link to here, and this page
// is where the marks actually live (HANDOFF-MARKING-LOOP.md — portal is the
// destination, Telegram is the doorbell). Until this existed, that link 404'd.
//
// Server component: reads Supabase with the service key and scopes to the
// logged-in student's portal identity (Airtable rec… id, or acct:<uuid> for
// self-serve accounts). `paper_marking_runs` has no per-student RLS
// policy, so the ownership filter below IS the access control — it must never
// be driven by anything the client can set.
//
// 17 Sep 2026 — the simpler list (Adrian: "make the whole interface simpler,
// more user friendly", after Alexis could not find her 2023 papers under two
// screens of cards): one panel per subject (A Math | E Math tabs), the tiles
// and a sparkline at the top of each, then ONE COMPACT ROW per paper — name,
// "Handed in 8 Sept · marked 9 Sept", a big score — with the Practice Again
// state as one coloured line inside the row (done / handed in / not done yet;
// the "compulsory" chip went). Papers that share a merged sheet sit in one
// frame whose caption says what the sheet is. Everything else (open the paper,
// clip to notebook, where you lost marks, request Practice Again) lives on the
// paper's own page.
import Link from 'next/link';
import type { ReactNode } from 'react';
import { currentAccount, portalIdentity } from '@/lib/portal-auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { buildStudentMarking, type MarkingRunRow, type StudentPaper } from '@/lib/portal-marking';
import { allowedSubjects, subjectAllowed, subjectPill, type SubjectTone } from '@/lib/portal-subjects';
import { subjectStats, isTileSubject } from '@/lib/portal-papers-stats';
import { coveredRunIds } from '@/lib/sheet-queue';
import { isPracticeAgainHandin } from '@/lib/desk-state';
import {
  shelvedGaps, shelfWorthAWave, outsideWindow, NOTE_STALE, NOTE_IN_FLIGHT, NOTE_PRACTICE_AGAIN, type PickPaper,
} from '@/lib/student-batch';
import ChoosePapers from './ChoosePapers';
import NextWave from './NextWave';
import { groupPracticeAgain, sheetParents } from '@/lib/portal-marking-group';
import { bundleList } from '@/lib/portal-paper-bundles';
import { sheetLine, sheetJobLine, bundleCaption, type SheetLine } from '@/lib/practice-again-line';
import { starredFirst } from '@/lib/paper-star';
import { noteFirstLine } from '@/lib/paper-label';
import StarPaper from './StarPaper';
import ArchivePaper from './ArchivePaper';
import PaperSearch, { type SearchEntry } from './PaperSearch';
import { readNoSheet } from '@/lib/sheet-jobs';
import MarkingBeacon from './MarkingBeacon';
import SubjectTiles from './SubjectTiles';
import SubjectPanels, { type SubjectPanel } from './SubjectPanels';
import { SURFACES } from '@/lib/portal-theme';
import { fileHref } from '@/lib/student-files-url';
import PortalIcon from '@/components/PortalIcon';
import { sgtTodayISO } from '@/lib/sgt';

export const dynamic = 'force-dynamic';

// A year of papers is more than any student will scroll, and keeps the payload
// bounded for someone on a phone in a corridor.
const MAX_PAPERS = 40;

// One literal, not a concatenation: supabase-js parses the select string at the
// type level, and a `+` here widens it to `string` and loses the row type.
const COLUMNS =
  'id, created_at, paper_name, total_awarded, total_max, annotated_pdf_url, photos_pdf_url, pdf_url, released_at, result_json, student_label, student_starred_at, student_archived_at, student_note, paper_subject';

// Home's soft elevated card (lib/portal-theme's visual language) — this tab
// wears the marked-work violet and the hand-in teal the way Home's tiles do,
// so the colours mean the same thing everywhere.
const CARD = 'bg-white rounded-3xl shadow-[0_1px_2px_rgba(15,23,42,0.04),0_6px_16px_-4px_rgba(15,23,42,0.08)]';
const M = SURFACES.marking;
const S = SURFACES.submit;

// Celebration is earned, not decoration: the score goes solid emerald only at
// 75%+ — the same bar the streak notice uses.
function scoreTone(pct: number | null): string {
  if (pct === null) return 'bg-gray-100 text-gray-600';
  if (pct >= 75) return 'bg-emerald-500 text-white shadow-[0_4px_12px_-4px_rgba(16,185,129,0.7)]';
  if (pct >= 50) return 'bg-amber-100 text-amber-900';
  return 'bg-rose-100 text-rose-900';
}

/** "8 Sept", with the year only when it is not this year. */
function shortDate(iso: string, todayISO: string): string {
  const sameYear = iso.slice(0, 4) === todayISO.slice(0, 4);
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-SG', {
    day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }), timeZone: 'UTC',
  });
}

function niceDate(d: string): string {
  return new Date(d + 'T00:00:00Z').toLocaleDateString('en-SG', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  });
}

/** "Handed in 8 Sept · marked 9 Sept" — or one phrase when both fell on the same day. */
function whenLine(paper: StudentPaper, todayISO: string): string {
  const handedIn = paper.handedInDate ?? paper.date;
  const handed = shortDate(handedIn, todayISO);
  if (!paper.markedDate) return `Handed in ${handed}`;
  if (paper.markedDate === handedIn) return `Handed in and marked ${handed}`;
  return `Handed in ${handed} · marked ${shortDate(paper.markedDate, todayISO)}`;
}

/** Which panel a paper lists in — a tile subject, else "Other". */
function bucketOf(subject: string | null | undefined): string {
  return isTileSubject(subject) ? subject : 'Other';
}

type SheetRow = { id: string; source_run_id: string | null; source_run_ids: string[] | null; run_id: string | null; status: string; pdf_url: string | null; submitted_at: string | null; marked_at: string | null; score: number | null; out_of: number | null; required_at: string | null };
type JobLite = { run_id: string; run_ids: string[] | null; status: string; result: unknown };
type Wave = { count: number; runIds: string[] };

export default async function MarkingPage() {
  const account = await currentAccount();
  // rec… for tuition, acct:<uuid> for strangers — runs are stamped with this
  // same identity by /api/portal/submit, so paying strangers see their papers.
  const sid = portalIdentity(account);
  const todayISO = sgtTodayISO();

  const sb = getSupabaseAdmin();
  // The released list, the pending list (papers this student handed in through
  // /app/submit that Adrian hasn't released yet — portal submissions ONLY, the
  // result_json stamp: a paper Adrian uploaded himself and chose not to
  // release must never surface as a phantom "being marked"; name + date +
  // page count, never a mark).
  const [{ data }, { data: pendingRows }] = await Promise.all([
    sb
      .from('paper_marking_runs')
      .select(COLUMNS)
      .eq('student_id', sid)
      .not('released_at', 'is', null)
      .is('superseded_by', null)   // a re-marked paper shows once, at its current mark
      .order('created_at', { ascending: false })
      .limit(MAX_PAPERS),
    sb
      .from('paper_marking_runs')
      .select('id, created_at, paper_name, num_photos')
      .eq('student_id', sid)
      .eq('result_json->>portal_submission', 'true')
      .is('released_at', null)
      .order('created_at', { ascending: false })
      .limit(5),
  ]);
  const pending = pendingRows ?? [];

  // Earlier markings (Adrian, 7 Sep 2026: Alessi's defective 38/66 "should be
  // archived — still allow access, but not shown at the main screen"): a paper
  // marked again keeps its old released marking reachable under a folded
  // "Earlier markings" list at the bottom, never in the main list or the tiles.
  // Same released + subject gates; the paper view opens them like any other.
  const { data: earlierRows } = await sb
    .from('paper_marking_runs')
    .select(COLUMNS)
    .eq('student_id', sid)
    .not('released_at', 'is', null)
    .not('superseded_by', 'is', null)
    .order('created_at', { ascending: false })
    .limit(20);
  const earlier = buildStudentMarking(
    ((earlierRows ?? []) as MarkingRunRow[]).filter(r => subjectAllowed(account, r.paper_subject)),
    { studentName: account?.display_name ?? null },
  ).papers;

  // The subject gate (SPEC-PORTAL-V2 §2): an E Math-only account never sees an
  // A Math paper, whoever tagged it. Applied to the rows BEFORE the build so
  // the tiles, the streak note and "Work on next" all describe the same list
  // the student is looking at. "Other" and untagged rows pass (they list, but
  // count in no tile — lib/portal-papers-stats).
  const rows = ((data ?? []) as MarkingRunRow[]).filter(r => subjectAllowed(account, r.paper_subject));
  const { papers } = buildStudentMarking(rows, { studentName: account?.display_name ?? null });
  // The raw row behind each card — when it was marked, and whether it is itself
  // a returned Practice Again sheet. Both decide whether it may join a tick.
  const rowById = new Map(rows.map(r => [r.id, r]));
  // The Practice Again sheet belongs with its paper (Adrian, 7 Sep 2026), not on a
  // separate to-do page: one released worksheet assignment per source run.
  // `run_id` = the sheet's OWN marking run once its hand-in is marked — what
  // groups that marked sheet under this paper below (lib/portal-marking-group).
  const sheetsByRun = new Map<string, SheetRow>();
  let sheetRowsAll: SheetRow[] = [];
  if (papers.length) {
    const { data: sheetRows } = await sb.from('portal_assignments')
      .select('id, source_run_id, source_run_ids, run_id, status, pdf_url, submitted_at, marked_at, score, out_of, required_at')
      .eq('airtable_student_id', sid).eq('source', 'practice-again').eq('kind', 'worksheet').neq('status', 'held').neq('status', 'revoked')
      // A batch sheet (10 Sep 2026) belongs to every paper it covers.
      .or(`source_run_id.in.(${papers.map(p => p.id).join(',')}),source_run_ids.ov.{${papers.map(p => p.id).join(',')}}`);
    sheetRowsAll = (sheetRows ?? []) as SheetRow[];
    for (const r of sheetRowsAll) for (const pid of sheetParents(r)) if (!sheetsByRun.has(pid)) sheetsByRun.set(pid, r);
  }
  // A marked Practice Again sheet is one card with its paper, not a second
  // top-level PDF (Adrian, 8 Sep 2026): its marking run leaves the list and is
  // opened from the paper's Practice Again row. `top` is what the student sees.
  const { top, markedSheetByParent } = groupPracticeAgain(papers, sheetRowsAll);
  // The sheet jobs behind every listed paper — for papers with NO sheet, where
  // the sheet is (being written · with Adrian · nothing worth practising); for
  // papers WITH one, whether it kept gaps back for a next wave (11 Sep 2026)
  // and whether a sheet is in flight (which closes the paper to the tick).
  const jobByRun = new Map<string, { status: string; noSheet: boolean }>();
  /** The finished sheet's shelf, per paper it covers: what a next wave would teach. */
  const waveByRun = new Map<string, Wave>();
  const allIds = papers.map(p => p.id);
  if (allIds.length) {
    const { data: jobRows } = await sb.from('sheet_jobs').select('run_id, run_ids, status, result')
      .or(`run_id.in.(${allIds.join(',')}),run_ids.ov.{${allIds.join(',')}}`).order('created_at', { ascending: false });
    for (const j of (jobRows ?? []) as JobLite[]) {
      const covered = coveredRunIds(j);
      for (const rid of covered) if (!jobByRun.has(rid)) jobByRun.set(rid, { status: j.status, noSheet: readNoSheet(j.result).noSheet });
      if (j.status === 'done') {
        const shelf = shelvedGaps(j.result);
        // The bar (11 Sep 2026): a left-out gap that cost 3 marks or more — else no button.
        if (shelf.length && shelfWorthAWave(j.result).worth) for (const rid of covered) if (!waveByRun.has(rid)) waveByRun.set(rid, { count: shelf.length, runIds: covered });
      }
    }
  }
  // 📘 The tick (11 Sep 2026): which papers may join one merged Practice Again
  // sheet. Everything absolute is decided here, in the same words the rows wear
  // — the relative rules (one maths, three at most) are the client's.
  const pickPapers: PickPaper[] = top.map(p => {
    const job = jobByRun.get(p.id);
    const blocked =
      outsideWindow(rowById.get(p.id)?.created_at, Date.now()) ? NOTE_STALE
      : job && (job.status === 'queued' || job.status === 'claimed') ? NOTE_IN_FLIGHT
      : isPracticeAgainHandin(rowById.get(p.id)) ? NOTE_PRACTICE_AGAIN
      : null;
    return { id: p.id, name: p.name, subject: p.subject ?? '', date: p.date, awarded: p.awarded, max: p.max, blocked };
  });

  // One panel per subject, in the account's display order, "Other" last. The
  // tiles, streak line and "Work on next" inside a panel are computed over
  // THAT subject's rows only — an A Math focus list under an E Math tab would
  // send the student to the wrong practice.
  const buckets = new Map<string, StudentPaper[]>();
  for (const p of top) {
    const k = bucketOf(p.subject);
    buckets.set(k, [...(buckets.get(k) ?? []), p]);
  }
  const order = [...allowedSubjects(account).filter(s => buckets.has(s)), ...(buckets.has('Other') ? ['Other'] : [])];
  const panels: SubjectPanel[] = order.map(subject => {
    const list = buckets.get(subject)!;
    const ids = new Set(list.map(p => p.id));
    const own = buildStudentMarking(rows.filter(r => bucketOf(r.paper_subject) === subject), { studentName: account?.display_name ?? null });
    const stats = isTileSubject(subject) ? subjectStats(top, subject) : null;
    const pill = subjectPill(subject);
    const tone: SubjectTone = pill?.tone ?? 'other';
    // 🗂 archived papers leave the list for the fold at the foot (17 Sep 2026).
    const listed = list.filter(p => !p.archived);
    const archived = list.filter(p => p.archived);
    // ⭐ starred papers first (17 Sep 2026), newest first inside each group; a bundle sits where its first paper lands.
    const entries = bundleList(starredFirst(listed), id => sheetsByRun.get(id));
    // 🔍 what a student might type to find an entry: names, dates, scores.
    const hay = (ps: StudentPaper[]) => ps.map(p => `${p.name} ${p.rawName ?? ''} ${whenLine(p, todayISO)} ${p.awarded}/${p.max} ${p.pct ?? ''}%`).join(' ').toLowerCase();
    const searchEntries: SearchEntry[] = entries.map(entry => entry.kind === 'paper' ? {
      key: entry.paper.id, haystack: hay([entry.paper]),
      node: <PaperRow paper={entry.paper} todayISO={todayISO}
        sheet={sheetsByRun.get(entry.paper.id) ?? null} job={jobByRun.get(entry.paper.id) ?? null}
        markedSheet={markedSheetByParent.get(entry.paper.id) ?? null} nextWave={waveByRun.get(entry.paper.id) ?? null} />,
    } : {
      key: entry.sheetId, haystack: hay(entry.papers),
      node: <Bundle papers={entry.papers} todayISO={todayISO} sheet={sheetsByRun.get(entry.papers[0].id)!}
        markedSheet={entry.papers.map(p => markedSheetByParent.get(p.id) ?? null).find(Boolean) ?? null}
        nextWave={entry.papers.map(p => waveByRun.get(p.id) ?? null).find(Boolean) ?? null} />,
    });
    const content: ReactNode = (
      <div className="space-y-4">
        {stats && <SubjectTiles s={stats} />}
        {own.streakNote && (
          <p className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-2.5 text-[13px] font-semibold text-emerald-800">{own.streakNote}</p>
        )}
        {/* "Work on next" moved to My Notebook's Mistakes view on 17 Sep 2026
            (lib/notebook-load weakest) — Papers says how you did, the Notebook what to fix. */}
        {/* 📘 "Choose papers" wraps the list: off, it is one line above the
            rows; on, the rows give way to a tick list (ChoosePapers). */}
        <ChoosePapers papers={pickPapers.filter(p => ids.has(p.id))}>
          {/* A merged sheet shows ONCE (Adrian, 11 Sep 2026): the papers it
              covers sit in one frame, in syllabus order, the sheet's line at
              the foot — lib/portal-paper-bundles. The search box appears once
              a tab holds enough papers to need it (PaperSearch). */}
          <PaperSearch entries={searchEntries} />
        </ChoosePapers>
        {archived.length > 0 && (
          <details className={`${CARD} p-4`}>
            <summary className="cursor-pointer text-sm font-semibold text-gray-500 select-none">
              Archived <span className="text-gray-400 font-normal">({archived.length})</span>
            </summary>
            <p className="text-[11px] text-gray-400 mt-1">Papers you put away. They still count in your tiles; put one back any time.</p>
            <ul className="mt-2 divide-y divide-black/5">
              {archived.map(p => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <Link href={`/app/marking/${p.id}`} className="min-w-0 truncate text-navy hover:underline">{p.name} <span className="text-gray-400">· {whenLine(p, todayISO)}</span></Link>
                  <span className="shrink-0 flex items-center gap-3">
                    <span className="text-gray-500">{p.max > 0 ? `${p.awarded}/${p.max}` : '—'}</span>
                    <ArchivePaper runId={p.id} archived />
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    );
    return { key: subject, label: subject, tone, count: list.length, content };
  });
  // The tab that opens is the subject of the paper handed in last.
  const defaultKey = top[0] ? bucketOf(top[0].subject) : (order[0] ?? 'Other');

  return (
    <div className="space-y-4 pb-24 sm:pb-4">
      {/* One "Papers" surface (Adrian, 2026-08-28: Hand in + Marked merged) —
          submitting is the tab's FIRST action, so the merge hides nothing. */}
      <div className="flex items-center gap-2.5 pt-1">
        <span className={`flex items-center justify-center w-9 h-9 rounded-2xl shrink-0 ${M.tile}`}>
          <PortalIcon name={M.icon} className="w-5 h-5" />
        </span>
        <h1 className="text-xl font-bold text-navy">Papers</h1>
      </div>
      <Link
        href="/app/submit"
        className="flex items-center gap-3 bg-teal-500 text-white rounded-3xl px-4 py-3.5 font-semibold shadow-[0_8px_24px_-10px_rgba(20,184,166,0.8)] hover:brightness-105 active:scale-[0.98] transition"
      >
        <span className="flex items-center justify-center w-9 h-9 rounded-2xl bg-white/25 shrink-0" aria-hidden>
          <PortalIcon name={S.icon} className="w-5 h-5" />
        </span>
        <span className="flex-1">Hand in a paper</span>
        <span className="shrink-0 text-white/80 text-lg">›</span>
      </Link>

      {pending.length > 0 && (
        // Teal = the hand-in surface, so papers sitting with Adrian wear it too.
        <div className="bg-teal-50 rounded-3xl p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-teal-700/80 mb-1">With Adrian</p>
          {/* A status line, not a spinner (Adrian, 7 Sep 2026): what is happening and how long it usually takes. */}
          <p className="text-[13px] text-teal-900/80 mb-2">Being marked — usually back within the hour. You will get a notification when it is ready.</p>
          <ul className="space-y-1.5">
            {pending.map(p => (
              <li key={p.id} className="text-sm text-teal-900 flex items-baseline justify-between gap-3">
                <span className="min-w-0 break-words">
                  ⏳ {p.paper_name || 'Submitted paper'}
                  {typeof p.num_photos === 'number' && p.num_photos > 0 && (
                    <span className="text-teal-700/60"> · {p.num_photos} page{p.num_photos === 1 ? '' : 's'}</span>
                  )}
                </span>
                <span className="shrink-0 text-xs text-teal-700/60">{niceDate(String(p.created_at).slice(0, 10))}</span>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-teal-700/70 mt-2">Handed in — it appears below once marked and released.</p>
        </div>
      )}

      {papers.length === 0 ? (
        <div className={`${CARD} p-5`}>
          <p className="text-sm text-gray-600">
            Nothing here yet. When Adrian marks a paper for you it appears here — with the marks,
            what went wrong on each question, and your script with the red pen on it.
          </p>
          <p className="text-sm text-gray-600 mt-2">
            Finished a paper at home? <Link href="/app/submit" className="font-semibold text-navy hover:underline">Photograph and submit it</Link> and
            it comes back marked, right here.
          </p>
          <Link href="/app" className="inline-block mt-3 text-sm font-semibold text-navy hover:underline">
            ‹ Back to dashboard
          </Link>
        </div>
      ) : (
        <>
          {/* Portal activity visibility (2026-09-03) — invisible; only fires
              the 'marking:view' beacon once mounted here, i.e. only when the
              student has at least one released paper. */}
          <MarkingBeacon />
          <SubjectPanels panels={panels} defaultKey={defaultKey} />

          {earlier.length > 0 && (
            <details className={`${CARD} p-4`}>
              <summary className="cursor-pointer text-sm font-semibold text-gray-500 select-none">
                Earlier markings <span className="text-gray-400 font-normal">({earlier.length})</span>
              </summary>
              <p className="text-[11px] text-gray-400 mt-1">Papers that were marked again later. The current marking is in the list above.</p>
              <ul className="mt-2 divide-y divide-black/5">
                {earlier.map(p => (
                  <li key={p.id}>
                    <Link href={`/app/marking/${p.id}`} className="flex items-center justify-between gap-3 py-2 text-sm hover:bg-black/[0.02] rounded-lg">
                      <span className="min-w-0 truncate text-navy">{p.name} <span className="text-gray-400">· {niceDate(p.date)}</span></span>
                      <span className="shrink-0 text-gray-500">{p.max > 0 ? `${p.awarded}/${p.max}` : '—'}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}

// ── The rows ────────────────────────────────────────────────────────────────

const LINE_TONE: Record<SheetLine['tone'], { box: string; mark: string }> = {
  done: { box: 'bg-emerald-50 border-emerald-200 text-emerald-900', mark: '✓' },
  waiting: { box: 'bg-amber-50 border-amber-200 text-amber-900', mark: '⏳' },
  todo: { box: 'bg-rose-50 border-rose-200 text-rose-900', mark: '📘' },
  quiet: { box: 'bg-gray-50 border-gray-200 text-gray-600', mark: '📘' },
};

/** The Practice Again state as ONE coloured line — under a paper, or once at the foot of a bundle. */
function SheetLineView({ line, sheet, markedSheet, nextWave }: {
  line: SheetLine;
  sheet: SheetRow | null;
  markedSheet: StudentPaper | null;
  nextWave: Wave | null;
}) {
  const t = LINE_TONE[line.tone];
  const openMarked = line.tone === 'done' && sheet && (markedSheet?.id ?? sheet.run_id);
  return (
    <div className={`rounded-2xl border px-3 py-2 ${t.box}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <p className="min-w-0 flex-1 text-[13px] font-semibold"><span aria-hidden>{t.mark}</span> {line.text}</p>
        {openMarked && (
          <Link href={`/app/marking/${openMarked}`} data-track="marking:open" className="shrink-0 text-xs font-bold underline underline-offset-2">
            See your marked sheet ›
          </Link>
        )}
        {line.actions && sheet && (
          <span className="shrink-0 flex items-center gap-1.5">
            {sheet.pdf_url && (
              <a href={fileHref(sheet.pdf_url)} target="_blank" rel="noopener noreferrer" className="text-xs font-bold bg-rose-600 text-white rounded-xl px-3 py-1.5 shadow-sm">Start ›</a>
            )}
            <Link href={`/app/submit?assignment=${sheet.id}`} className="text-xs font-semibold text-rose-900 border border-rose-300 bg-white rounded-xl px-3 py-1.5">Hand in</Link>
          </span>
        )}
      </div>
      {/* One sheet teaches one wave; the rest was shelved with evidence (11 Sep 2026). */}
      {nextWave && <NextWave runIds={nextWave.runIds} count={nextWave.count} />}
    </div>
  );
}

/** One paper: name, when, score — the whole row opens the paper. */
function PaperRow({ paper, todayISO, sheet, job, markedSheet, nextWave, inBundle = false }: {
  paper: StudentPaper;
  todayISO: string;
  sheet: SheetRow | null;
  job: { status: string; noSheet: boolean } | null;
  markedSheet: StudentPaper | null;
  nextWave: Wave | null;
  /** Inside a Bundle the sheet's line is drawn once, at the foot. */
  inBundle?: boolean;
}) {
  const line = inBundle ? null : sheet ? sheetLine(sheet) : sheetJobLine(job);
  return (
    <div className={`${inBundle ? 'bg-white rounded-2xl' : CARD} p-3`}>
      <Link href={`/app/marking/${paper.id}`} data-track="marking:open" className="flex items-center gap-3 group">
        <div className="min-w-0 flex-1">
          <p className="font-bold text-navy leading-snug break-words group-hover:underline">{paper.name}</p>
          <p className="text-[12px] text-gray-500 mt-0.5">{whenLine(paper, todayISO)}</p>
          {noteFirstLine(paper.note) && <p className="text-[12px] text-gray-400 mt-0.5 italic truncate">{noteFirstLine(paper.note)}</p>}
        </div>
        <StarPaper runId={paper.id} starred={!!paper.starred} />
        <div className={`shrink-0 rounded-2xl px-3 py-1.5 text-center min-w-[64px] ${scoreTone(paper.pct)}`}>
          <p className="text-lg font-bold leading-tight tabular-nums">{paper.max > 0 ? `${paper.awarded}/${paper.max}` : '—'}</p>
          {paper.pct !== null && <p className="text-[11px] font-semibold leading-tight opacity-90">{paper.pct}%</p>}
        </div>
        <span className="shrink-0 text-gray-300 text-lg" aria-hidden>›</span>
      </Link>

      {/* News about the COPY, on the card, for three days — never a Telegram
          message (Adrian, 14 Sep 2026). lib/paper-notice.ts owns the wording and the clock. */}
      {paper.notice && (
        <p className="mt-2 text-[12px] text-sky-900 bg-sky-50 border border-sky-200 rounded-2xl px-3 py-2">
          <span className="font-semibold">{paper.notice.title}.</span> {paper.notice.body}
        </p>
      )}

      {line && <div className="mt-2"><SheetLineView line={line} sheet={sheet} markedSheet={markedSheet} nextWave={nextWave} /></div>}
    </div>
  );
}

/** The papers one merged sheet covers, in one frame: the caption says what the sheet is, syllabus order inside, the sheet's line once at the foot. */
function Bundle({ papers, todayISO, sheet, markedSheet, nextWave }: {
  papers: StudentPaper[];
  todayISO: string;
  sheet: SheetRow;
  markedSheet: StudentPaper | null;
  nextWave: Wave | null;
}) {
  const cap = bundleCaption(papers.length);
  const line = sheetLine(sheet);
  return (
    <div className="rounded-[28px] border-2 border-emerald-200 bg-emerald-50/50 p-2 space-y-2">
      <div className="px-2 pt-1">
        <p className="text-[13px] font-bold text-emerald-900">📘 {cap.title}</p>
        <p className="text-[12px] text-emerald-800/80">{cap.sub}</p>
      </div>
      {papers.map(p => (
        <PaperRow key={p.id} paper={p} todayISO={todayISO} sheet={sheet} job={null} markedSheet={null} nextWave={null} inBundle />
      ))}
      <SheetLineView line={line} sheet={sheet} markedSheet={markedSheet} nextWave={nextWave} />
    </div>
  );
}
