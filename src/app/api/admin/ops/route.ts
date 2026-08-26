// GET /api/admin/ops — everything the /admin/ops board renders, in one read:
// the newest logbook row per job (with its rhythm and staleness), the rhythm
// jobs that have never stamped, and the marking queue's live state. Read-only.

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { latestJobRuns } from '@/lib/job-log';
import { JOB_RHYTHMS, staleJobs, neverStamped } from '@/lib/job-health';
import { getSupabaseAdmin } from '@/lib/supabase';

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

    return NextResponse.json({
      jobs,
      neverStamped: neverStamped(latest).map(j => ({ job: j, rhythm: JOB_RHYTHMS[j].label })),
      queue,
      generatedAt: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
