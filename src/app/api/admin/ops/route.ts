// GET /api/admin/ops — everything the /admin/ops board renders, in one read:
// the newest logbook row per job (with its rhythm and staleness), the rhythm
// jobs that have never stamped, and the marking queue's live state. Read-only.

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { latestJobRuns } from '@/lib/job-log';
import { JOB_RHYTHMS, staleJobs, neverStamped } from '@/lib/job-health';
import { getSupabaseAdmin } from '@/lib/supabase';
import { markingShare, type MarkingShare, type MarkingRunRow } from '@/lib/marking-path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const latest = await latestJobRuns();
    const stale = new Map(staleJobs(latest, new Date()).map(s => [s.job, s.reason]));

    const jobs = latest.map(r => ({
      job: r.job,
      ranAt: r.ran_at,
      ok: r.ok,
      summary: r.summary,
      rhythm: JOB_RHYTHMS[r.job]?.label ?? null,
      staleReason: stale.get(r.job) ?? null,
    })).sort((a, b) => (a.staleReason ? 0 : 1) - (b.staleReason ? 0 : 1) || a.job.localeCompare(b.job));

    // Marking queue: pending papers + how long the oldest has waited.
    let queue: { pending: number; oldestMinutes: number | null } = { pending: 0, oldestMinutes: null };
    try {
      const { data } = await getSupabaseAdmin()
        .from('paper_marking_runs')
        .select('created_at, queue:result_json->queue')
        .is('total_max', null)
        .order('created_at', { ascending: true })
        .limit(50);
      type Q = { queued_at?: string; failed_at?: string };
      const pendingRows = (data || []).filter(r => {
        const q = (r as { queue?: Q }).queue;
        return q && q.queued_at && !q.failed_at;
      });
      queue = {
        pending: pendingRows.length,
        oldestMinutes: pendingRows.length
          ? Math.round((Date.now() - new Date((pendingRows[0] as { queue?: Q }).queue!.queued_at!).getTime()) / 60000)
          : null,
      };
    } catch { /* queue read is best-effort — the jobs table is the core */ }

    // Marking bill (2 Sep 2026): which papers the Mac marked on plan usage and
    // which the API marked, last 7 and 30 days. The run row already records the
    // path (result_json.queue.external_claim.delivered_at), so this is a read of
    // the source of truth, not a second logbook — lib/marking-path.ts is the
    // pure split, tested. JSON-path aliases keep the fat result_json off the wire.
    let marking: { d7: MarkingShare; d30: MarkingShare } | null = null;
    try {
      const now = Date.now();
      const { data } = await getSupabaseAdmin()
        .from('paper_marking_runs')
        .select('created_at, total_max, cost_usd, num_photos, queue:result_json->queue, portal_submission:result_json->portal_submission, telegram_handin:result_json->telegram_handin')
        .gte('created_at', new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString())
        .not('total_max', 'is', null)
        .order('created_at', { ascending: false })
        .limit(500);
      type Queue = NonNullable<MarkingRunRow['result_json']>['queue'];
      type R = { created_at: string; total_max: number | null; cost_usd: number | string | null; num_photos: number | null; queue: Queue; portal_submission: unknown; telegram_handin: unknown };
      const rows: MarkingRunRow[] = ((data || []) as unknown as R[]).map(r => ({
        created_at: r.created_at,
        total_max: r.total_max,
        cost_usd: r.cost_usd,
        num_photos: r.num_photos,
        result_json: { queue: r.queue ?? null, portal_submission: r.portal_submission ?? undefined, telegram_handin: r.telegram_handin ?? undefined },
      }));
      marking = { d7: markingShare(rows, now, 7), d30: markingShare(rows, now, 30) };
    } catch { /* best-effort, same as the queue read */ }

    return NextResponse.json({
      jobs,
      neverStamped: neverStamped(latest).map(j => ({ job: j, rhythm: JOB_RHYTHMS[j].label })),
      queue,
      marking,
      generatedAt: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
