// 🧑‍🏫 Tutor portal — the database half (server only). Pure rules: lib/tutor-portal.ts.
//
// The waiting room (releaseWaitingTutorPapers): a tutor's paper is SAVED as an ordinary
// marking run at hand-in, but it is NOT put in the 🌙 queue then. It waits in
// tutor_papers (status 'waiting') and joins the queue only when no paper of Adrian's own
// students is waiting there (lib/tutor-portal tutorPapersToRelease). Called after every
// tutor hand-in, when a tutor opens their papers, and by /api/cron/tutor-queue every 30 min.
import { getSupabaseAdmin } from '@/lib/supabase';
import { sgtDayStartISO } from '@/lib/sgt';
import { tutorPapersToRelease, TUTOR_SID_PREFIX } from '@/lib/tutor-portal';

type Sb = ReturnType<typeof getSupabaseAdmin>;

export async function botCall(payload: Record<string, unknown>, timeoutMs = 30_000): Promise<Record<string, unknown> | null> {
  const base = process.env.BOT_BASE_URL, secret = process.env.BOT_INTERNAL_SECRET;
  if (!base || !secret) return null;
  try {
    const r = await fetch(`${base}/api/mark-paper`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });
    return (await r.json().catch(() => null)) as Record<string, unknown> | null;
  } catch (e) {
    console.warn('[tutor] bot call failed:', payload.phase, (e as Error).message);
    return null;
  }
}

export async function papersUsedThisMonth(sb: Sb, tutorId: string, month: string): Promise<number> {
  const { count } = await sb.from('tutor_papers').select('id', { count: 'exact', head: true }).eq('tutor_id', tutorId).eq('month', month);
  return count ?? 0;
}

/** Papers of Adrian's own students waiting in the 🌙 queue (the bot's own "waiting" test: queued, not marked). */
async function studentPapersWaiting(sb: Sb): Promise<number> {
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
  const { data, error } = await sb.from('paper_marking_runs')
    .select('id, student_id')
    .is('total_max', null)
    .not('result_json->queue', 'is', null)
    .or('queue_status.is.null,queue_status.neq.failed')
    .is('archived_at', null)
    .gte('created_at', since)
    .limit(500);
  // Cannot tell → treat the queue as busy. A tutor paper waiting longer is the safe mistake.
  if (error) { console.warn('[tutor-queue] student count failed:', error.message); return 1; }
  return ((data ?? []) as { student_id: string | null }[]).filter(r => !(r.student_id ?? '').startsWith(TUTOR_SID_PREFIX)).length;
}

export interface ReleaseReport { released: string[]; failed: string[]; studentWaiting: number; tutorInQueue: number; waiting: number; marked: number }

export async function releaseWaitingTutorPapers(sb: Sb = getSupabaseAdmin()): Promise<ReleaseReport> {
  // 1. Tidy the 'queued' rows: marked ones stop counting; ones the queue gave up on → failed.
  const { data: queuedRows } = await sb.from('tutor_papers').select('id, run_id').eq('status', 'queued');
  const queued = (queuedRows ?? []) as { id: string; run_id: string | null }[];
  let tutorInQueue = 0, marked = 0;
  if (queued.length) {
    const { data: runs } = await sb.from('paper_marking_runs')
      .select('id, total_max, queue_status').in('id', queued.map(q => q.run_id).filter(Boolean) as string[]);
    const byId = new Map(((runs ?? []) as { id: string; total_max: number | null; queue_status: string | null }[]).map(r => [r.id, r]));
    for (const q of queued) {
      const r = q.run_id ? byId.get(q.run_id) : undefined;
      if (r && r.total_max != null) { marked++; continue; }
      if (!r || r.queue_status === 'failed') {
        await sb.from('tutor_papers').update({ status: 'failed' }).eq('id', q.id);
        continue;
      }
      tutorInQueue++;
    }
  }
  // 2. How busy is the queue, and who is waiting?
  const [{ data: waitRows }, { count: today }, studentWaiting] = await Promise.all([
    sb.from('tutor_papers').select('id, run_id').eq('status', 'waiting').order('created_at', { ascending: true }).limit(20),
    sb.from('tutor_papers').select('id', { count: 'exact', head: true }).gte('queued_at', sgtDayStartISO()),
    studentPapersWaiting(sb),
  ]);
  const waiting = (waitRows ?? []) as { id: string; run_id: string | null }[];
  const pick = tutorPapersToRelease({ studentWaiting, tutorInQueue, releasedToday: today ?? 0, waiting });
  const released: string[] = [], failed: string[] = [];
  for (const id of pick) {
    const row = waiting.find(w => w.id === id);
    if (!row?.run_id) continue;
    // Claim first (compare-and-set on status), so two callers never enqueue one paper twice.
    const { data: claimed } = await sb.from('tutor_papers')
      .update({ status: 'queued', queued_at: new Date().toISOString() })
      .eq('id', id).eq('status', 'waiting').select('id');
    if (!claimed?.length) continue;
    const q = await botCall({ phase: 'enqueue', id: row.run_id }, 20_000);
    if (q?.ok) released.push(id);
    else {
      // Back to waiting — the next call tries again.
      await sb.from('tutor_papers').update({ status: 'waiting', queued_at: null }).eq('id', id);
      failed.push(id);
    }
  }
  return { released, failed, studentWaiting, tutorInQueue, waiting: waiting.length, marked };
}
