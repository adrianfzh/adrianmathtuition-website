// /api/admin/desk/run?runId= — one paper, everything the desk's detail view
// vets from (SPEC-MARKING-DESK.md).
//
// The run row, EVERY question (flagged and confident alike — Agree / Override
// sit on all of them here), the annotated page images, the sheet's diagnosis,
// the newest live sheet job, the pending-review count, the paper's Dropbox
// folder + what is in it (is "Practice Again.pdf" there yet; is a "Marked
// (Adrian).pdf" newer than the copy attached), the lane, and the reasons the
// Approve button is grey — all computed by the same pure functions the queue
// uses, so the row and the detail never disagree.
//
// Service-key read, admin-auth gated, no writes. Dropbox is fail-soft: a
// folder that cannot be listed comes back as `amended.status: 'unknown'` and
// the page says so instead of guessing.
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';
import { dropboxConfigured, listFolder } from '@/lib/dropbox';
import {
  computeAutoHold, extractFlagged, overrideTally, paperTotalWarning, paperTotalsMismatch, pendingCount,
} from '@/lib/mark-triage';
import { readDiagnosis } from '@/lib/sheet-diagnosis';
import { MARKED_AI_NAME, dropboxWebUrl, isSheetPdf, paperFolder } from '@/lib/paper-folder';
import {
  amendedStatusFor, approveBlockers, deskFlags, laneFor, latestLiveJob, noSheetOf, pdfStaleOf,
  releaseBlockers, sheetStageLabel,
} from '@/lib/desk-state';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RUN_COLUMNS =
  'id, created_at, paper_name, subject, rules_version, student_id, student_name, total_awarded, total_max, num_questions, ' +
  'released_at, released_via, archived_at, annotated_pdf_url, pdf_url, photos_pdf_url, checked_at, dropbox_path, result_json';

type RunRow = {
  id: string; created_at: string; paper_name: string | null; subject: string | null; rules_version: string | null;
  student_id: string | null; student_name: string | null;
  total_awarded: number | null; total_max: number | null; num_questions: number | null;
  released_at: string | null; released_via: string | null; archived_at: string | null;
  annotated_pdf_url: string | null; pdf_url: string | null; photos_pdf_url: string | null;
  checked_at: string | null; dropbox_path: string | null; result_json: unknown;
};

type SheetJobRow = {
  id: string; status: string; stage: string | null; error: string | null; attempts: number;
  focus: string | null; claimed_by: string | null; created_at: string; completed_at: string | null; result: unknown;
};

/** Annotated page images in photo order — the desk's left pane. */
function annotatedPhotos(resultJson: unknown) {
  const arr = (resultJson as { annotated_photos?: unknown } | null)?.annotated_photos;
  if (!Array.isArray(arr)) return [];
  return arr
    .map(p => (p && typeof p === 'object' ? p as Record<string, unknown> : null))
    .filter((p): p is Record<string, unknown> => !!p && typeof p.url === 'string' && !!p.url)
    .map(p => ({
      photoIndex: typeof p.photo_index === 'number' ? p.photo_index : -1,
      url: p.url as string,
      urlWithSolutions: typeof p.url_with_solutions === 'string' ? p.url_with_solutions : null,
      method: typeof p.method === 'string' ? p.method : null,
    }))
    .filter(p => p.photoIndex >= 0)
    .sort((a, b) => a.photoIndex - b.photoIndex);
}

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const runId = req.nextUrl.searchParams.get('runId') || '';
  if (!/^[0-9a-f-]{36}$/i.test(runId)) return NextResponse.json({ error: 'runId is required' }, { status: 400 });

  const sb = getSupabaseAdmin();
  const { data: run, error } = await sb.from('paper_marking_runs').select(RUN_COLUMNS).eq('id', runId).maybeSingle<RunRow>();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!run) return NextResponse.json({ error: 'run not found' }, { status: 404 });

  const rj = run.result_json;
  const summary = extractFlagged(rj);
  const questions = [
    ...summary.flagged.map(q => ({ ...q, flagged: true })),
    ...summary.confident.map(q => ({ ...q, flagged: false })),
  ].sort((a, b) => a.index - b.index);

  // Every sheet job for the run (newest live one decides the lane; the full
  // list is what "re-queue" and "retry" reason over).
  const { data: jobRows } = await sb.from('sheet_jobs')
    .select('id, status, stage, error, attempts, focus, claimed_by, created_at, completed_at, result')
    .eq('run_id', runId).order('created_at', { ascending: false });
  const jobs = (jobRows ?? []) as SheetJobRow[];
  const job = latestLiveJob(jobs);
  const jobResult = (job?.result && typeof job.result === 'object') ? job.result as Record<string, unknown> : null;

  // "From Adrian" assignments written from this paper (release-with-sheet).
  let assignments = 0;
  try {
    const { count } = await sb.from('portal_assignments').select('id', { count: 'exact', head: true }).eq('source_run_id', runId);
    assignments = count ?? 0;
  } catch { /* the count is a nicety */ }

  // The paper's Dropbox folder: what is in it decides "My copy" and whether
  // the sheet PDF exists yet. Fail-soft: unknown beats a guess.
  const folder = paperFolder(run);
  let entries: Awaited<ReturnType<typeof listFolder>> | null = null;
  let folderError: string | null = null;
  if (!dropboxConfigured()) folderError = 'Dropbox not configured';
  else {
    try { entries = await listFolder(folder); }
    catch (e) {
      const msg = (e as Error).message || 'list failed';
      if (/not_found/.test(msg)) entries = [];
      else folderError = msg;
    }
  }
  const files = (entries ?? []).filter(e => e.tag === 'file');
  const amended = amendedStatusFor(run, entries);
  const pending = pendingCount(rj);
  const lane = laneFor(run, job);
  const totals = run.total_max == null || run.total_awarded == null ? summary : { awarded: run.total_awarded, max: run.total_max };

  return NextResponse.json({
    run: {
      id: run.id,
      createdAt: run.created_at,
      paperName: run.paper_name || 'Untitled paper',
      subject: run.subject || 'math',
      rulesVersion: run.rules_version,
      studentId: run.student_id,
      studentName: run.student_name,
      awarded: totals.awarded,
      max: totals.max,
      totalQuestions: summary.totalQuestions,
      releasedAt: run.released_at,
      releasedVia: run.released_via,
      archivedAt: run.archived_at,
      checkedAt: run.checked_at,
      pdfUrl: run.pdf_url,
      annotatedPdfUrl: run.annotated_pdf_url,
      photosPdfUrl: run.photos_pdf_url,
      pdfStale: pdfStaleOf(run),
      grounding: ((rj as { grounding?: { source?: string | null } } | null)?.grounding?.source) ?? null,
      // SPEC-PAPER-MATCH Phase 1 (bot, 3 Sep 2026): what the paper was identified
      // as and whether the bank/scheme match was trusted. Absent on older runs.
      paperMatch: (() => {
        const pm = (rj as { paper_match?: Record<string, unknown> } | null)?.paper_match;
        if (!pm || typeof pm !== 'object') return null;
        const ov = (pm.overlap && typeof pm.overlap === 'object') ? pm.overlap as { shared?: number; share?: number } : null;
        return {
          key: typeof pm.key === 'string' ? pm.key : null,
          source: typeof pm.source === 'string' ? pm.source : 'none',
          trusted: pm.trusted === true,
          shared: ov && Number.isFinite(Number(ov.shared)) ? Number(ov.shared) : null,
          share: ov && Number.isFinite(Number(ov.share)) ? Number(ov.share) : null,
          matched: Number.isFinite(Number(pm.questions_matched)) ? Number(pm.questions_matched) : null,
          reasons: Array.isArray(pm.reasons) ? (pm.reasons as unknown[]).map(String).slice(0, 4) : [],
        };
      })(),
      unattempted: Array.isArray((rj as { unattempted_questions?: unknown } | null)?.unattempted_questions)
        ? ((rj as { unattempted_questions: unknown[] }).unattempted_questions).map(String) : [],
      portalSubmission: (rj as { portal_submission?: unknown } | null)?.portal_submission === true,
    },
    lane,
    pending,
    overrides: overrideTally(rj),
    totalWarning: paperTotalsMismatch(rj, run.total_awarded) ?? paperTotalWarning(run.total_max),
    autoHold: computeAutoHold(rj),
    questions,
    annotatedPhotos: annotatedPhotos(rj),
    diagnosis: readDiagnosis(rj),
    sheetJob: job ? {
      id: job.id, status: job.status, stage: job.stage, error: job.error, attempts: job.attempts,
      focus: job.focus, claimedBy: job.claimed_by, createdAt: job.created_at, completedAt: job.completed_at,
      label: sheetStageLabel(job),
      result: jobResult ? {
        docxPath: typeof jobResult.docx_path === 'string' ? jobResult.docx_path : null,
        pdfPath: typeof jobResult.pdf_path === 'string' ? jobResult.pdf_path : null,
        wave: Array.isArray(jobResult.wave) ? jobResult.wave.map(String) : [],
        shelved: Array.isArray(jobResult.shelved) ? jobResult.shelved.map(String) : [],
        verified: typeof jobResult.verified === 'string' ? jobResult.verified : '',
        // "Nothing worth practising" — a finished job with no files (3 Sep 2026).
        // The desk relabels Approve & release and never looks for a sheet PDF.
        ...noSheetOf(job),
      } : null,
    } : null,
    sheetJobs: jobs.map(j => ({ id: j.id, status: j.status, stage: j.stage, error: j.error, createdAt: j.created_at, completedAt: j.completed_at })),
    assignments,
    folder: {
      path: folder,
      url: dropboxWebUrl(folder),
      /** The listing came back (an absent folder lists as empty). */
      listed: entries !== null,
      exists: entries !== null && entries.length > 0,
      error: folderError,
      sheetPdf: files.some(f => isSheetPdf(f.name)),
      sheetPdfName: files.find(f => isSheetPdf(f.name))?.name ?? null,
      markedAi: files.some(f => f.name.toLowerCase() === MARKED_AI_NAME.toLowerCase()),
      files: files.map(f => ({ name: f.name, modified: f.modified ?? null, size: f.size ?? null })),
    },
    amended,
    flags: deskFlags(run, job, amended.status),
    approveBlockers: approveBlockers(run, job, pending, amended.status),
    releaseBlockers: releaseBlockers(run, pending, amended.status),
  });
}
