// GET /api/cron/page-gap-sweep — the monitor + self-fix for missing marked pages
// (Vercel cron, every 6 hours at :30 SGT-agnostic — the health check owns :00).
//
// Adrian, 14 Sep 2026: "we have to make sure such uploading errors don't occur
// again (or they can't fail silently - someone must be monitoring and rectify if
// such errors occur - but patch any such errors in the first place, and able to
// have a monitor and self fix system in place?)". This is the monitor and the
// self-fix; the patch (a retried upload) and the no-silent-failure (the
// student's own photo standing in for the lost page) are already live.
//
// WHAT IT DOES, per run marked in the last week:
//   • no gaps                 → nothing, no stamp, no noise.
//   • gaps, NOT released yet  → redraws each missing page through
//                               /api/admin/desk/redraw {reissue:false} and
//                               rebuilds the marked PDFs, so the copy that
//                               eventually goes out is whole. Nobody has seen
//                               it, so nothing here needs approving.
//   • gaps, ALREADY released  → REPORTED, never touched. Re-inking is
//                               reversible; telling a student their copy
//                               changed is not, and the re-issue sends a line
//                               in Adrian's name. His call, from the desk.
//     (And the standing instruction of the same day — "don't have to fix
//     previous copies, just make sure the future marking works well".)
//
// Every run it looked at carries `result_json.page_gap_check`, which is both the
// audit trail and the reason Adrian is told about an unfixable page ONCE rather
// than four times a day until he acts (lib/page-gap-repair alreadyReported).
//
// Stamps `job_runs` every run — quiet weeks included — so a dead monitor alarms
// by absence rather than by silence (docs/OPS.md, JOB_RHYTHMS 'page-gap-sweep').
import { NextRequest, NextResponse } from 'next/server';
import { safeEqual } from '@/lib/safe-equal';
import { logJobRun } from '@/lib/job-log';
import { getSupabaseAdmin } from '@/lib/supabase';
import { sendTelegram } from '@/lib/telegram';
import { rebuildRunPdfs } from '@/lib/rebuild-run-pdfs';
import {
  gapsForRun, gapPageNumbers, pageGapAlert, repairPageGaps, alreadyReported, gapCheckStamp,
  type GapRunRow,
} from '@/lib/page-gap-repair';

export const dynamic = 'force-dynamic';
// Redraws are the slow part (a page render on the bot, 10–60 s each). The sweep
// stops STARTING work at BUDGET_MS and the next one in six hours picks up the rest.
export const maxDuration = 300;

const WINDOW_DAYS = 7;
const BUDGET_MS = 210_000;
/** Papers, not pages: one badly broken run must not starve the others. */
const MAX_RUNS = 12;
const SITE = 'https://www.adrianmathtuition.com';

function authed(req: NextRequest): boolean {
  const auth = req.headers.get('authorization') || '';
  if (req.headers.get('x-vercel-cron')) return true;
  const cron = process.env.CRON_SECRET, admin = process.env.ADMIN_PASSWORD;
  return !!((cron && safeEqual(auth, `Bearer ${cron}`)) || (admin && safeEqual(auth, `Bearer ${admin}`)));
}

type Row = GapRunRow & { created_at: string };

export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const supa = getSupabaseAdmin();
  const started = Date.now();
  const since = new Date(started - WINDOW_DAYS * 86_400_000).toISOString();
  // The admin bearer this request already carries is what the redraw and the
  // rebuild are called with — same-origin, same credentials (the release-with-
  // sheet pattern). A cron fires with `x-vercel-cron` and no bearer, so fall
  // back to CRON_SECRET / ADMIN_PASSWORD from the environment.
  const pass = req.headers.get('authorization')
    || (process.env.ADMIN_PASSWORD ? `Bearer ${process.env.ADMIN_PASSWORD}` : '');
  const headers: Record<string, string> = pass ? { Authorization: pass } : {};
  const origin = req.nextUrl.origin;

  const report: {
    runId: string; student: string | null; released: boolean;
    pages: number[]; repaired: number; remaining: number[]; errors: string[];
  }[] = [];

  try {
    const { data, error } = await supa
      .from('paper_marking_runs')
      .select('id, student_name, paper_name, released_at, result_json, created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(400);
    if (error) throw new Error(`runs: ${error.message}`);

    // Cheapest first: the gap check is pure, so the whole window is filtered
    // without a single network call, and almost always finds nothing.
    const broken = ((data ?? []) as Row[])
      .map(run => ({ run, gaps: gapsForRun(run.result_json) }))
      .filter(x => x.gaps.length)
      .slice(0, MAX_RUNS);

    const lines: string[] = [];
    for (const { run, gaps } of broken) {
      const released = !!run.released_at;
      let outcome = { attempted: 0, repaired: 0, remaining: gaps, errors: [] as string[] };

      if (!released && Date.now() - started < BUDGET_MS) {
        // 🔧 The self-fix. Redraw, then rebuild — the PDFs were assembled before
        // the page came back, so without the rebuild the whole copy still shows
        // the gap the fallback papered over.
        outcome = await repairPageGaps(run.id, {
          origin, headers,
          budgetMs: Math.max(0, BUDGET_MS - (Date.now() - started)),
          limit: 8,
        });
        if (outcome.repaired > 0) {
          const rb = await rebuildRunPdfs(run.id, { origin, headers });
          if (!rb.rebuilt) outcome.errors.push(`PDFs not rebuilt: ${(rb.errors || []).join(' · ') || rb.skipped || 'unknown'}`);
        }
      }

      // Tell Adrian about what is STILL missing — once per gap set, and always
      // for a released copy, which this sweep will not touch on its own.
      const quiet = alreadyReported(run.result_json, outcome.remaining);
      if (outcome.remaining.length && !quiet) {
        lines.push(pageGapAlert({
          studentName: run.student_name, paperName: run.paper_name,
          gaps: outcome.remaining, repaired: outcome.repaired, released,
          deskUrl: `${SITE}/admin/desk?run=${run.id}`,
        }));
      }

      // Stamp the run: the audit trail, and the memory that keeps the alarm quiet.
      try {
        const rj = (run.result_json && typeof run.result_json === 'object') ? { ...(run.result_json as Record<string, unknown>) } : {};
        rj.page_gap_check = gapCheckStamp(outcome);
        await supa.from('paper_marking_runs').update({ result_json: rj }).eq('id', run.id);
      } catch (e) {
        console.warn('[page-gap-sweep] stamp failed for', run.id, (e as Error).message);
      }

      report.push({
        runId: run.id, student: run.student_name, released,
        pages: gapPageNumbers(gaps), repaired: outcome.repaired,
        remaining: gapPageNumbers(outcome.remaining), errors: outcome.errors,
      });
    }

    for (const line of lines) await sendTelegram(line, 'marking').catch(() => {});

    const repaired = report.reduce((n, r) => n + r.repaired, 0);
    const open = report.reduce((n, r) => n + r.remaining.length, 0);
    const summary = report.length
      ? `${report.length} paper${report.length === 1 ? '' : 's'} with missing pages · ${repaired} redrawn · ${open} still open`
      : 'every page accounted for';
    await logJobRun('page-gap-sweep', true, summary).catch(() => {});
    return NextResponse.json({ ok: true, summary, sent: lines.length, report });
  } catch (e) {
    await logJobRun('page-gap-sweep', false, (e as Error).message.slice(0, 200)).catch(() => {});
    return NextResponse.json({ ok: false, error: (e as Error).message, report }, { status: 502 });
  }
}
