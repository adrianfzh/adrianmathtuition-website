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
import { remarkDiff, plainMath } from '@/lib/remark-diff';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';
import { dropboxConfigured, listFolder } from '@/lib/dropbox';
import {
  computeAutoHold, extractFlagged, overrideTally, paperTotalWarning, paperTotalsMismatch, pendingCount,
} from '@/lib/mark-triage';
import { readDiagnosis } from '@/lib/sheet-diagnosis';
import { MARKED_AI_NAME, dropboxWebUrl, isSheetPdf, paperFolder } from '@/lib/paper-folder';
import {
  amendedStatusFor, approveBlockers, deskFlags, laneFor, latestLiveJob, noSheetOf, pdfStaleOf, revisingOf,
  releaseBlockers, sheetStageLabel, isPracticeAgainHandin, handinOriginOf,
} from '@/lib/desk-state';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RUN_COLUMNS =
  'id, created_at, paper_name, subject, paper_subject, rules_version, student_id, student_name, total_awarded, total_max, num_questions, ' +
  'released_at, released_via, archived_at, annotated_pdf_url, pdf_url, photos_pdf_url, checked_at, dropbox_path, result_json';

type RunRow = {
  id: string; created_at: string; paper_name: string | null; subject: string | null; rules_version: string | null;
  /** 'A Math' | 'E Math' | 'H2 Math' | 'Other' | null — the desk's Subject select writes it (SPEC-PORTAL-V2 §1). */
  paper_subject: string | null;
  student_id: string | null; student_name: string | null;
  total_awarded: number | null; total_max: number | null; num_questions: number | null;
  released_at: string | null; released_via: string | null; archived_at: string | null;
  annotated_pdf_url: string | null; pdf_url: string | null; photos_pdf_url: string | null;
  checked_at: string | null; dropbox_path: string | null; result_json: unknown;
};

type SheetJobRow = {
  id: string; status: string; stage: string | null; error: string | null; attempts: number;
  focus: string | null; claimed_by: string | null; created_at: string; completed_at: string | null; result: unknown;
  auto_release_at?: string | null; held_at?: string | null; auto_released_at?: string | null;
  requested_by?: string | null;
};

/** Per page: the original photo URL and the rotation applied at marking time. */
function pageSources(resultJson: unknown): Record<number, { originalUrl: string | null; rot: number }> {
  const rj = resultJson as { source?: { photos?: unknown }; annotation_debug?: unknown } | null;
  const out: Record<number, { originalUrl: string | null; rot: number }> = {};
  const photos = Array.isArray(rj?.source?.photos) ? (rj!.source!.photos as Array<{ photo_index?: unknown; original_url?: unknown }>) : [];
  for (const p of photos) if (typeof p?.photo_index === 'number') out[p.photo_index] = { originalUrl: typeof p.original_url === 'string' ? p.original_url : null, rot: 0 };
  const dbg = Array.isArray(rj?.annotation_debug) ? (rj!.annotation_debug as Array<{ photo_index?: unknown; rot?: unknown }>) : [];
  for (const d of dbg) if (typeof d?.photo_index === 'number') out[d.photo_index] = { originalUrl: out[d.photo_index]?.originalUrl ?? null, rot: Number(d.rot) || 0 };
  return out;
}

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
      overflowUrl: typeof p.overflow_url === 'string' ? p.overflow_url : null,
      method: typeof p.method === 'string' ? p.method : null,
      // The editable marker layer (SPEC-ANNOTATE §14) — the desk opens the pen in place.
      layerUrl: typeof p.layer_url === 'string' ? p.layer_url : null,
      layer: p.layer && typeof p.layer === 'object' ? p.layer : null,
      inkUrl: typeof p.ink_url === 'string' ? p.ink_url : null,
      editedAt: typeof p.edited_at === 'string' ? p.edited_at : null,
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
  // 📐 The paper's mark scheme as a state (8 Sep 2026): the bot stamps
  // grounding.scheme {key, status, used, recorded_by_this_run} on a marking;
  // the row's LIVE status is read here so an approval shows at once.
  const schemeStamp = (() => {
    const g = ((run.result_json ?? null) as { grounding?: { scheme?: Record<string, unknown> } } | null)?.grounding?.scheme;
    return g && typeof g === 'object' ? g : null;
  })();
  const schemeKey = (() => {
    const pm = ((run.result_json ?? null) as { paper_match?: { key?: unknown; trusted?: unknown } } | null)?.paper_match;
    if (pm && pm.trusted === true && typeof pm.key === 'string' && pm.key) return pm.key;
    return typeof schemeStamp?.key === 'string' ? schemeStamp.key : null;
  })();
  const schemeSubject = String(((run.result_json ?? null) as { subject?: unknown } | null)?.subject || 'math');
  const schemeLive = schemeKey
    ? (await sb.from('paper_schemes').select('id, status, approved_at, allocation_run_id, allocation, uses')
        .eq('subject', schemeSubject).eq('paper_key', schemeKey).maybeSingle<{ id: string; status: string; approved_at: string | null; allocation_run_id: string | null; allocation: unknown; uses: number | null }>()).data
    : null;
  const scheme = schemeKey && (schemeLive || schemeStamp) ? {
    key: schemeKey,
    status: schemeLive?.status ?? String(schemeStamp?.status || ''),
    hasAllocation: Array.isArray(schemeLive?.allocation) && schemeLive!.allocation.length > 0,
    approvedAt: schemeLive?.approved_at ?? null,
    allocationRunId: schemeLive?.allocation_run_id ?? null,
    uses: schemeLive?.uses ?? 0,
    used: typeof schemeStamp?.used === 'string' ? schemeStamp.used : null,
    recordedByThisRun: schemeStamp?.recorded_by_this_run === true,
  } : null;

  const { data: jobRows } = await sb.from('sheet_jobs')
    .select('id, status, stage, error, attempts, focus, claimed_by, created_at, completed_at, result, auto_release_at, held_at, auto_released_at, requested_by')
    .eq('run_id', runId).order('created_at', { ascending: false });
  const jobs = (jobRows ?? []) as SheetJobRow[];
  const job = latestLiveJob(jobs);
  const jobResult = (job?.result && typeof job.result === 'object') ? job.result as Record<string, unknown> : null;

  // The Practice Again sheet's questions as app to-do items (portal_assignments
  // with this run as source): HELD until Approve & release, then live. The chip
  // used to read "sheet assigned ×4" — four rows, not four sheets (Adrian, 8 Sep
  // 2026: "what does it mean by sheet assigned x 4?") — so the count is split.
  let assignments = 0;
  let assignmentsHeld = 0;
  let sheetSent = false;
  try {
    const { data: rows } = await sb.from('portal_assignments').select('status, kind, revoked_at').eq('source_run_id', runId);
    // Revoked rows are gone from the app — never count them (9 Sep 2026).
    const live = (rows ?? []).filter(a => !a.revoked_at && a.status !== 'revoked');
    assignments = live.length;
    assignmentsHeld = live.filter(a => a.status === 'held').length;
    // The SHEET is with the student once its worksheet row exists — the practice
    // questions above are not that (9 Sep 2026: the Send button hid behind them).
    sheetSent = (rows ?? []).some(a => a.kind === 'worksheet' && !a.revoked_at && a.status !== 'revoked');
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
      paperSubject: run.paper_subject,
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
      scheme,
      // 🧮 The allocation audit's record (bot lib/scheme-derive, 8 Sep 2026).
      allocationAudit: (() => {
        const a = (rj as { allocation_audit?: Record<string, unknown> } | null)?.allocation_audit;
        if (!a || typeof a !== 'object') return null;
        const list = (v: unknown) => Array.isArray(v) ? v as Record<string, unknown>[] : [];
        return {
          at: typeof a.at === 'string' ? a.at : null,
          added: list(a.added).map(x => ({ q: String(x.q ?? ''), part: String(x.part ?? ''), marks: Number(x.marks) || 0 })),
          maxDiffs: list(a.max_diffs).map(x => ({ q: String(x.q ?? ''), part: String(x.part ?? ''), marked: Number(x.marked) || 0, recorded: Number(x.recorded) || 0 })),
          countedBefore: Number.isFinite(Number(a.counted_before)) ? Number(a.counted_before) : null,
          countedAfter: Number.isFinite(Number(a.counted_after)) ? Number(a.counted_after) : null,
        };
      })(),
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
      practiceAgain: isPracticeAgainHandin(run),
      origin: handinOriginOf(run),
      // 🔁 A re-mark in flight (8 Sep 2026): the old marking stepped aside and the
      // queue holds the row; `remarkPages` names the pages when only some are read again.
      remarking: !!(rj as { queue?: { remark?: unknown } } | null)?.queue?.remark && !(rj as { results?: unknown[] } | null)?.results?.length,
      remarkPages: (() => {
        const q = (rj as { queue?: { remark_pages?: unknown } } | null)?.queue;
        return Array.isArray(q?.remark_pages) ? (q!.remark_pages as unknown[]).map(Number).filter(Number.isInteger) : [];
      })(),
      // 🔁 What the last re-mark changed (lib/remark-diff, 8 Sep 2026) — present
      // while the marking that stepped aside is still on the row.
      remark: (() => {
        const prev = (rj as { previous_results?: unknown } | null)?.previous_results;
        const results = (rj as { results?: unknown } | null)?.results;
        if (!Array.isArray(prev) || !prev.length || !Array.isArray(results) || !results.length) return null;
        const q = (rj as { queue?: { remark_pages?: unknown } } | null)?.queue;
        const pages = Array.isArray(q?.remark_pages) ? (q!.remark_pages as unknown[]).map(Number).filter(Number.isInteger) : null;
        const d = remarkDiff(prev, results, pages);
        const pt = (rj as { previous_totals?: { awarded?: unknown; max?: unknown } } | null)?.previous_totals;
        return {
          pages: d.pages, at: (rj as { previous_marked_at?: unknown } | null)?.previous_marked_at ?? null,
          previousAwarded: Number.isFinite(Number(pt?.awarded)) ? Number(pt!.awarded) : null,
          parts: d.parts.map(x => ({ q: x.q, part: x.part, before: x.before, after: x.after ? { awarded: x.after.awarded, max: x.after.max, why: plainMath(x.after.why).slice(0, 160) } : null })),
          changed: d.changed.length,
        };
      })(),
    },
    lane,
    revising: revisingOf(job),
    pending,
    overrides: overrideTally(rj),
    totalWarning: paperTotalsMismatch(rj, run.total_awarded) ?? paperTotalWarning(run.total_max),
    autoHold: computeAutoHold(rj),
    // The bot's last automatic-release outcome (result_json.auto_release, 9 Sep 2026): released / refused / held / failed + note.
    autoRelease: (rj as { auto_release?: unknown }).auto_release ?? null,
    questions,
    annotatedPhotos: annotatedPhotos(rj),
    // Clean originals + the rotation the marker applied, per page — what the pen
    // overlay draws the editable layer on. And the ink hints (swapped marks).
    pageSources: pageSources(rj),
    inkHints: Array.isArray((rj as { ink_hints?: unknown } | null)?.ink_hints) ? (rj as { ink_hints: unknown[] }).ink_hints : [],
    diagnosis: readDiagnosis(rj),
    sheetJob: job ? {
      id: job.id, status: job.status, stage: job.stage, error: job.error, attempts: job.attempts,
      focus: job.focus, claimedBy: job.claimed_by, createdAt: job.created_at, completedAt: job.completed_at,
      autoReleaseAt: job.auto_release_at ?? null, heldAt: job.held_at ?? null, autoReleasedAt: job.auto_released_at ?? null,
      requestedBy: job.requested_by ?? null,
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
    assignmentsHeld,
    sheetSent,
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
