// GET /api/admin/ops — everything the /admin/ops board renders, in one read:
// the newest logbook row per job (with its rhythm and staleness), the rhythm
// jobs that have never stamped, and the marking queue's live state. Read-only.

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { latestJobRuns } from '@/lib/job-log';
import { JOB_RHYTHMS, staleJobs, neverStamped } from '@/lib/job-health';
import { getSupabaseAdmin } from '@/lib/supabase';
import { markingShare, type MarkingShare, type MarkingRunRow } from '@/lib/marking-path';
import { markingQueueState, type MarkingQueueState, type QueueRunRow } from '@/lib/marking-queue-state';

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

    // Marking queue: which papers are waiting, not just how many — and any row
    // still flagged `queued` after its paper finished.
    //
    // This reads the `queue_status` COLUMN, the same field the bot's picker
    // (lib/queue-pick.js) reads. It used to derive the count from
    // `result_json.queue.queued_at` filtered to `total_max IS NULL`, which is
    // defensible but is a SECOND signal — and on 9 Sep 2026 the two disagreed:
    // three rows said `queued` long after release/archive while the board said
    // "empty", because nothing in the app rendered that column. One signal now,
    // and the disagreement itself is reported as `stale`.
    let queue: MarkingQueueState = { pending: 0, oldestMinutes: null, rows: [], stale: [] };
    try {
      // Two reads, because the two signals live in different places: papers in
      // flight (no total yet) and any row still FLAGGED queued. A live paper
      // leaves queue_status null, so the flag alone would report "empty" while
      // the Mac was marking — that shipped briefly on 9 Sep and is why both are
      // fetched. JSON-path alias keeps the fat result_json off the wire.
      const cols = 'id, created_at, paper_name, student_name, queue_status, total_max, released_at, archived_at, queue:result_json->queue';
      const sb = getSupabaseAdmin();
      const [inFlight, flagged] = await Promise.all([
        sb.from('paper_marking_runs').select(cols).is('total_max', null).order('created_at', { ascending: true }).limit(50),
        sb.from('paper_marking_runs').select(cols).eq('queue_status', 'queued').limit(50),
      ]);
      const byId = new Map<string, QueueRunRow>();
      for (const r of [...(inFlight.data || []), ...(flagged.data || [])] as QueueRunRow[]) byId.set(r.id, r);
      queue = markingQueueState([...byId.values()]);
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
