// GET /api/cron/marking-stall — 🔑 a dead marking login must be impossible to miss
// (20 Oct 2026: four papers waited three hours — logins 1 and 2 switched off, login 3's
// sign-in had reached its end date, and nothing told Adrian). Every 10 min:
//   1. papers queued > 30 min, none claimed, and no usable login (or nothing marking at all)
//      → ONE Telegram line to Adrian (his own chat) saying why and what to tap; again only if
//      still stuck 2 h later (lib/marking-stall.ts stallDecision).
//   2. a login's sign-in ends within a day → one line; within two hours → one more, with the
//      steps to sign it in again (signinWarnings).
// Runs on the site, not the worker, so it speaks even when the worker is asleep or down.
// Memory: the Settings row marking_alarms. Stamps job_runs 'marking-stall'.
// Auth: CRON_SECRET bearer, x-vercel-cron, or ADMIN_PASSWORD bearer. ?dry=1 sends nothing.
import { NextRequest, NextResponse } from 'next/server';
import { safeEqual } from '@/lib/safe-equal';
import { logJobRun } from '@/lib/job-log';
import { getSupabaseAdmin } from '@/lib/supabase';
import { sendTelegram } from '@/lib/telegram';
import { slotAccountRows } from '@/lib/slot-accounts';
import { getSlotAccounts, getSlotUsage, getMarkingAlarms, setMarkingAlarms } from '@/lib/slot-accounts-store';
import { loginHealths, signinWarnings, stallDecision, type QueuedPaper, type SigninTold, type StallState } from '@/lib/marking-stall';
import { isBenchRun } from '@/lib/desk-state';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authed(req: NextRequest): boolean {
  const auth = req.headers.get('authorization') || '';
  const cron = process.env.CRON_SECRET, admin = process.env.ADMIN_PASSWORD;
  if (req.headers.get('x-vercel-cron')) return true;
  if (cron && safeEqual(auth, `Bearer ${cron}`)) return true;
  if (admin && safeEqual(auth, `Bearer ${admin}`)) return true;
  return false;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const dry = req.nextUrl.searchParams.get('dry') === '1';
  const now = Date.now();
  try {
    const since = new Date(now - 3 * 24 * 3600_000).toISOString();
    const { data, error } = await getSupabaseAdmin().from('paper_marking_runs')
      .select('id, paper_name, queue_status, queued_at:result_json->queue->>queued_at, failed_at:result_json->queue->>failed_at, skip_external:result_json->queue->>skip_external, claimed_by:result_json->queue->>claimed_by, claim_at:result_json->queue->external_claim->>at, claim_released:result_json->queue->external_claim->>released_at')
      .is('total_max', null).is('archived_at', null).gte('created_at', since)
      .order('created_at', { ascending: true }).limit(200);
    if (error) throw new Error(`queue read failed: ${error.message}`);
    type Row = { id: string; paper_name: string | null; queue_status: string | null; queued_at: string | null; failed_at: string | null; skip_external: string | null; claimed_by: string | null; claim_at: string | null; claim_released: string | null };
    const papers: QueuedPaper[] = ((data ?? []) as Row[])
      .filter(r => r.queued_at && !r.failed_at && r.queue_status !== 'failed' && r.queue_status !== 'done' && !r.skip_external && !isBenchRun(r.paper_name))
      .map(r => ({ id: r.id, queued_at: r.queued_at!, claimed: r.queue_status === 'claimed' || !!r.claimed_by || (!!r.claim_at && !r.claim_released) }));

    const [map, usage, alarms] = await Promise.all([getSlotAccounts(true), getSlotUsage(), getMarkingAlarms().catch(() => ({} as Record<string, unknown>))]);
    const health = loginHealths(slotAccountRows(map, usage), now);

    const stall = stallDecision(papers, health, (alarms.stall ?? {}) as StallState, now);
    const warn = signinWarnings(health, (alarms.signin ?? {}) as SigninTold, now);
    const sent: string[] = [];
    if (!dry) {
      if (stall.message && await sendTelegram(esc(stall.message))) sent.push('stall');
      for (const w of warn.send) if (await sendTelegram(esc(w.text))) sent.push(`signin:${w.key}`);
      // a line that failed to send is not remembered as told — the next tick tries again
      const stallState = stall.message && !sent.includes('stall') ? { since: stall.state.since ?? null, told_at: (alarms.stall as StallState | undefined)?.told_at ?? null } : stall.state;
      const told = { ...warn.told };
      for (const w of warn.send) if (!sent.includes(`signin:${w.key}`)) told[w.key] = (alarms.signin as SigninTold | undefined)?.[w.key] ?? { ends: told[w.key].ends };
      const next = { stall: stallState, signin: told };
      if (JSON.stringify(next) !== JSON.stringify({ stall: alarms.stall ?? {}, signin: alarms.signin ?? {} })) await setMarkingAlarms(next);
    }
    const summary = `${papers.length} queued, ${stall.waiting} waiting >30 min${stall.reason ? ` (${stall.reason})` : ''}; logins ${health.map(h => `${h.login} ${h.on ? 'on' : 'off'}/${h.worker}`).join(', ')}${sent.length ? `; told: ${sent.join(', ')}` : ''}`;
    if (!dry) await logJobRun('marking-stall', true, summary).catch(() => {});
    return NextResponse.json({ ok: true, dry, summary, health, stall: { reason: stall.reason, message: stall.message }, warnings: warn.send });
  } catch (e) {
    if (!dry) await logJobRun('marking-stall', false, (e as Error).message).catch(() => {});
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
