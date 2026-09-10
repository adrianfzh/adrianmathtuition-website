// /api/admin/desk — the marking desk's queue (SPEC-MARKING-DESK.md).
//
//   GET ?lane=&days=60 → { days, lane, defaultLane, counts, rows }
//
// Every unarchived paper_marking_runs row with a stored marking from the last
// N days, joined to its newest live sheet_jobs row and its "From Adrian"
// assignment count, then dropped into one of four DERIVED lanes
// (lib/desk-state.ts): needs a student · marked, sheet on the way · ready to
// vet · released. `counts` covers every lane so the tabs can show numbers
// while `rows` carries only the lane asked for (all lanes when none is).
//
// Reads with the service key, admin-auth gated, and WRITES NOTHING — every
// mutation the desk makes goes through the routes that already own it
// (mark-triage, release-with-sheet, sheet-jobs, papers, desk/rebuild).
//
// The "amended copy newer than attached" flag needs a Dropbox folder listing
// per paper, so it is computed only for the READY lane (the one where it
// decides anything) and capped — a list must never wait on Dropbox. The
// detail route checks it properly for the paper on screen.
import { NextRequest, NextResponse } from 'next/server';
import { coveredRunIds } from '@/lib/sheet-queue';
import { computeAutoHold } from '@/lib/mark-triage';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';
import { dropboxConfigured, listFolder } from '@/lib/dropbox';
import { pendingCount, recomputeTotals } from '@/lib/mark-triage';
import { dropboxWebUrl, paperFolder } from '@/lib/paper-folder';
import {
  DESK_LANES, amendedStatusFor, defaultLane, deskFlags, laneFor, latestLiveJob,
  noSheetOf, pdfStaleOf, sheetStageLabel, revisingOf, type AmendedStatus, type DeskLane, isPracticeAgainHandin, handinOriginOf,
  sheetOutcomeOf, type SheetAssignmentLite, type SheetOutcome,
} from '@/lib/desk-state';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_DAYS = 60;
const MAX_DAYS = 365;
const MAX_ROWS = 400;
/** Folder listings per request for the newer-copy flag on ready rows. */
const AMENDED_CHECKS = 12;

const RUN_COLUMNS =
  'id, created_at, paper_name, subject, paper_subject, student_id, student_name, total_awarded, total_max, num_questions, ' +
  'released_at, released_via, annotated_pdf_url, pdf_url, photos_pdf_url, checked_at, result_json';

type RunRow = {
  id: string; created_at: string; paper_name: string | null; subject: string | null;
  /** 'A Math' | 'E Math' | 'H2 Math' | 'Other' | null — the AM/EM/H2 pill (SPEC-PORTAL-V2 §1). */
  paper_subject: string | null;
  student_id: string | null; student_name: string | null;
  total_awarded: number | null; total_max: number | null; num_questions: number | null;
  released_at: string | null; released_via: string | null;
  annotated_pdf_url: string | null; pdf_url: string | null; photos_pdf_url: string | null;
  checked_at: string | null; result_json: unknown;
};

type SheetJobLite = {
  id: string; run_id: string; status: string; stage: string | null; error: string | null;
  attempts: number; created_at: string; completed_at: string | null;
  /** 'student' when asked for from the app, 'adrian' from this desk (legacy 'auto'/null = the old auto-queue). */
  requested_by?: string | null;
  /** `{noSheet, reason}` when the paper had nothing worth practising — the row label says so. */
  result: unknown;
};

/** `.in()` on hundreds of uuids makes a URL some proxies refuse — chunk it. */
async function selectIn<T>(
  table: string, columns: string, column: string, ids: string[], chunk = 100,
): Promise<T[]> {
  const out: T[] = [];
  const sb = getSupabaseAdmin();
  for (let i = 0; i < ids.length; i += chunk) {
    const { data, error } = await sb.from(table).select(columns).in(column, ids.slice(i, i + chunk));
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...((data ?? []) as T[]));
  }
  return out;
}

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const q = req.nextUrl.searchParams;
  const laneParam = q.get('lane') || '';
  if (laneParam && !(DESK_LANES as readonly string[]).includes(laneParam)) {
    return NextResponse.json({ error: `unknown lane "${laneParam}"` }, { status: 400 });
  }
  const lane = (laneParam || null) as DeskLane | null;
  const days = Math.min(Math.max(Number(q.get('days')) || DEFAULT_DAYS, 1), MAX_DAYS);

  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from('paper_marking_runs')
    .select(RUN_COLUMNS)
    .is('archived_at', null)
    .gte('created_at', new Date(Date.now() - days * 86400_000).toISOString())
    .order('created_at', { ascending: false })
    .limit(MAX_ROWS);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // A run with no stored marking is a failed or still-queued attempt — same
  // rule as triage and the papers library; it has nothing to vet yet.
  const runs = ((data ?? []) as unknown as RunRow[]).filter(r => Array.isArray((r.result_json as { results?: unknown } | null)?.results));
  const ids = runs.map(r => r.id);

  // Newest live sheet job per run + "From Adrian" assignment count per run.
  const jobsByRun = new Map<string, SheetJobLite[]>();
  const assignmentsByRun = new Map<string, number>();
  // The sheet's own rows per run — what it did after it was written (10 Sep 2026).
  const sheetRowsByRun = new Map<string, SheetAssignmentLite[]>();
  if (ids.length) {
    try {
      const jobs = await selectIn<SheetJobLite & { run_ids?: string[] | null }>('sheet_jobs', 'id, run_id, run_ids, status, stage, error, attempts, created_at, completed_at, result, requested_by', 'run_id', ids);
      for (const j of jobs) {
        // A batch job (10 Sep 2026) is the sheet of EVERY paper it covers.
        for (const rid of coveredRunIds(j)) {
          if (!ids.includes(rid)) continue;
          const list = jobsByRun.get(rid) ?? [];
          list.push(j);
          jobsByRun.set(rid, list);
        }
      }
    } catch (e) { console.warn('[desk] sheet_jobs read failed:', (e as Error).message); }
    try {
      // Revoked rows are gone from the app — never count them (Joey's paper read
      // "10 practice questions in the app" for ten withdrawn ones, 9 Sep 2026).
      const rows = await selectIn<{ source_run_id: string; source_run_ids: string[] | null; status: string | null; revoked_at: string | null }>('portal_assignments', 'source_run_id, source_run_ids, status, revoked_at', 'source_run_id', ids);
      for (const a of rows) {
        if (a.revoked_at || a.status === 'revoked') continue;
        for (const rid of new Set([a.source_run_id, ...(a.source_run_ids ?? [])])) {
          if (rid && ids.includes(rid)) assignmentsByRun.set(rid, (assignmentsByRun.get(rid) ?? 0) + 1);
        }
      }
    } catch (e) { console.warn('[desk] portal_assignments read failed:', (e as Error).message); }
    // released · handed in · marked — the worksheet rows only, read apart from
    // the count above so the two never argue (sheetOutcomeOf, 10 Sep 2026).
    try {
      type SRow = SheetAssignmentLite & { source_run_id: string | null; source_run_ids: string[] | null };
      const cols = 'source_run_id, source_run_ids, kind, status, revoked_at, created_at, submitted_at, marked_at, required_at';
      const srows = await selectIn<SRow>('portal_assignments', cols, 'source_run_id', ids);
      for (const a of srows) {
        if (a.kind !== 'worksheet') continue;
        for (const rid of new Set([a.source_run_id, ...(a.source_run_ids ?? [])])) {
          if (!rid || !ids.includes(rid)) continue;
          const list = sheetRowsByRun.get(rid) ?? [];
          list.push(a);
          sheetRowsByRun.set(rid, list);
        }
      }
    } catch (e) { console.warn('[desk] sheet rows read failed:', (e as Error).message); }
  }

  const counts: Record<DeskLane, number> = { untagged: 0, 'awaiting-sheet': 0, ready: 0, auto: 0, released: 0 };
  const prelim = runs.map(r => {
    const job = latestLiveJob(jobsByRun.get(r.id) ?? []);
    const sheetOutcome: SheetOutcome = sheetOutcomeOf(sheetRowsByRun.get(r.id));
    // A returned Practice Again sheet with nothing flagged (no desk flag, no
    // accuracy watch-out) clears itself — Adrian need not look at it again.
    const practiceAgain = isPracticeAgainHandin(r);
    const quiet = practiceAgain && deskFlags(r, job, null).length === 0 && computeAutoHold(r.result_json).reasons.length === 0;
    const runLane = laneFor(r, job, Date.now(), { quiet });
    counts[runLane] += 1;
    return { r, job, lane: runLane, folder: paperFolder(r), amended: null as AmendedStatus | null, practiceAgain, sheetOutcome };
  });

  // The newer-copy flag for the ready lane — capped, parallel, fail-soft.
  if (dropboxConfigured()) {
    const ready = prelim.filter(x => x.lane === 'ready').slice(0, AMENDED_CHECKS);
    const settled = await Promise.allSettled(ready.map(async x => {
      const entries = await listFolder(x.folder).catch((e: Error) => (/not_found/.test(e.message) ? [] : null));
      x.amended = amendedStatusFor(x.r, entries).status;
    }));
    for (const s of settled) if (s.status === 'rejected') console.warn('[desk] amended check failed:', String(s.reason));
  }

  const visible = (lane ? prelim.filter(x => x.lane === lane) : prelim).map(({ r, job, lane: runLane, folder, amended, practiceAgain, sheetOutcome }) => {
    // Stored totals first (triage overrides write both); recompute for the
    // older rows that carry neither.
    const totals = r.total_max == null || r.total_awarded == null
      ? recomputeTotals(r.result_json)
      : { awarded: r.total_awarded, max: r.total_max };
    return {
      id: r.id,
      createdAt: r.created_at,
      paperName: r.paper_name || 'Untitled paper',
      subject: r.subject || 'math',
      paperSubject: r.paper_subject,
      studentId: r.student_id,
      studentName: r.student_name,
      awarded: totals.awarded,
      max: totals.max,
      pct: totals.max > 0 ? Math.round((totals.awarded / totals.max) * 100) : null,
      questions: r.num_questions ?? ((r.result_json as { results?: unknown[] }).results?.length ?? 0),
      pending: pendingCount(r.result_json),
      lane: runLane,
      releasedAt: r.released_at,
      releasedVia: r.released_via,
      pdfStale: pdfStaleOf(r),
      // ✏️ A revision in flight pins the row to the top of its lane (orderLane) and
      // pulls a released paper back to the to-do tab (laneFor) — 10 Sep 2026.
      revising: revisingOf(job),
      sheet: job ? {
        jobId: job.id, status: job.status, stage: job.stage, error: job.error,
        label: sheetStageLabel(job, sheetOutcome), completedAt: job.completed_at,
        noSheet: noSheetOf(job).noSheet,
        requestedBy: job.requested_by ?? null,
      } : null,
      // released · handed in · marked (+ when, + compulsory) — the sheet after it was written.
      sheetOutcome,
      flags: deskFlags(r, job, amended),
      practiceAgain,
      origin: handinOriginOf(r),
      amended,
      assignments: assignmentsByRun.get(r.id) ?? 0,
      folder,
      folderUrl: dropboxWebUrl(folder),
      annotatedPdfUrl: r.annotated_pdf_url,
      photosPdfUrl: r.photos_pdf_url,
      pdfUrl: r.pdf_url,
    };
  });

  return NextResponse.json({
    days,
    lane,
    defaultLane: defaultLane(counts),
    counts,
    rows: visible,
  });
}
