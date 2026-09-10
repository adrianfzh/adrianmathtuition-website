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
import { batchLaneNote, markerUnreachableNote, type BatchLaneNote } from '@/lib/bot-queue-status';

const BOT_QUEUE_QUIET_URL = 'https://adrianmath-telegram-math-bot.fly.dev/queue-quiet';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const latest = await latestJobRuns();
    const stale = new Map(staleJobs(latest, new Date()).map(s => [s.job, s.reason]));

    // The plan lane (9 Sep 2026): when the newest plan-marking / sheet-worker
    // stamp says a PLAN LIMIT was hit, the board says so — "three papers
    // waiting" with every slot dying on "You've hit your weekly limit" is not a
    // queue problem. A later ok=true stamp means the lane is back.
    const LIMIT = /plan limit|usage limit|weekly limit|rate.?limit/i;
    const planLane = (['plan-marking', 'sheet-worker'] as const).map(job => {
      const r = latest.find(x => x.job === job);
      if (!r || r.ok || !LIMIT.test(String(r.summary || ''))) return null;
      if (Date.now() - Date.parse(r.ran_at) > 20 * 3600_000) return null;
      return { job, at: r.ran_at, summary: String(r.summary || '').slice(0, 200) };
    }).filter((x): x is { job: 'plan-marking' | 'sheet-worker'; at: string; summary: string } => !!x);

    // Practice Again sheets in motion (11 Sep 2026 — Adrian: "how do i see
    // isabelle's practice again sheet generation progress? … i don't see it at
    // /admin/ops"). The sheet worker stamps job_runs only on a limit, so the
    // board never showed a sheet being written. Now: every queued or claimed
    // sheet_jobs row, with the worker's own stage word and minutes since claim.
    type SheetJobRow = { id: string; status: string; stage: string | null; paper_name: string | null; requested_by: string | null; run_ids: string[] | null; created_at: string; claimed_at: string | null };
    let sheets: { active: Array<{ id: string; paper: string; papers: number; stage: string; minutes: number; requestedBy: string }>; queued: Array<{ id: string; paper: string; papers: number; minutes: number; requestedBy: string }> } = { active: [], queued: [] };
    try {
      const { data: sj } = await getSupabaseAdmin().from('sheet_jobs')
        .select('id, status, stage, paper_name, requested_by, run_ids, created_at, claimed_at')
        .in('status', ['queued', 'claimed']).order('created_at', { ascending: true }).limit(20);
      const mins = (iso: string | null) => (iso ? Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000)) : 0);
      for (const j of (sj ?? []) as SheetJobRow[]) {
        const papers = Array.isArray(j.run_ids) && j.run_ids.length ? j.run_ids.length : 1;
        const paper = String(j.paper_name || 'untitled').slice(0, 120);
        const requestedBy = j.requested_by === 'student' ? 'student' : 'Adrian';
        if (j.status === 'claimed') sheets.active.push({ id: j.id, paper, papers, stage: String(j.stage || 'drafting').trim(), minutes: mins(j.claimed_at), requestedBy });
        else sheets.queued.push({ id: j.id, paper, papers, minutes: mins(j.created_at), requestedBy });
      }
    } catch { sheets = { active: [], queued: [] }; }

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

    // The batch lane (11 Sep 2026): Adrian flips `MARK_QUEUE_BATCH` off by hand
    // some nights, and nothing showed that state the night the marker machine
    // melted. `/queue-quiet` is public, no auth, and fail-soft — a 404/timeout
    // (the field not shipped yet, the bot down) just means the board says
    // nothing new, never a broken page.
    let botQueue: { batchLaneNote: BatchLaneNote | null; markerUnreachable: string | null } | null = null;
    try {
      const r = await fetch(BOT_QUEUE_QUIET_URL, { signal: AbortSignal.timeout(3000) });
      if (r.ok) {
        const d = await r.json().catch(() => ({} as Record<string, unknown>));
        botQueue = { batchLaneNote: batchLaneNote(d.batch_lane), markerUnreachable: markerUnreachableNote(d.marker_reachable) };
      }
    } catch { /* fail-soft — see comment above */ }

    return NextResponse.json({
      jobs,
      neverStamped: neverStamped(latest).map(j => ({ job: j, rhythm: JOB_RHYTHMS[j].label })),
      planLane,
      sheets,
      queue,
      marking,
      botQueue,
      generatedAt: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
