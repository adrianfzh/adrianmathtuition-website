// GET /api/cron/daily-queue — midnight SGT (0 16 * * * UTC), 24 Sep 2026.
//
// The waiting list's clock (SPEC-PRACTICE-PHOTO.md §14, lib/daily-queue.ts):
//   • 🧪 Science hand-ins that landed on a later day (result_json.queued_for)
//     go into the bot's 🌙 marking queue once their day arrives, stamped
//     result_json.queue_released_at. The student's own file stays as it was.
//   • 📷 Photo sheets need nothing here — a queued sheet_jobs row carries
//     scheduled_for, and the sheet worker's peek/next simply ignore it until
//     that Singapore day (the .or(dueFilter()) on /api/admin/sheet-jobs).
// Stamps job_runs 'daily-queue' even on a quiet day. ?dry=1 lists without acting.
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { logJobRun } from '@/lib/job-log';
import { sendTelegram } from '@/lib/telegram';
import { safeEqual } from '@/lib/safe-equal';
import { sgtTodayISO } from '@/lib/sgt';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authed(req: Request): boolean {
  if (req.headers.get('x-vercel-cron') === '1') return true;
  const bearer = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!bearer) return false;
  const cron = process.env.CRON_SECRET, admin = process.env.ADMIN_PASSWORD;
  return (!!cron && safeEqual(bearer, cron)) || (!!admin && safeEqual(bearer, admin));
}

type QueuedRun = { id: string; student_id: string | null; student_name: string | null; paper_name: string | null; result_json: Record<string, unknown> | null };

export async function GET(req: Request) {
  if (!authed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const dry = new URL(req.url).searchParams.get('dry') === '1';
  const today = sgtTodayISO();
  const sb = createServiceClient();
  const { data, error } = await sb.from('paper_marking_runs')
    .select('id, student_id, student_name, paper_name, result_json')
    .not('result_json->>queued_for', 'is', null)
    .lte('result_json->>queued_for', today)
    .is('result_json->>queue_released_at', null)
    .is('released_at', null)
    .order('created_at', { ascending: true })
    .limit(50);
  if (error) {
    await logJobRun('daily-queue', false, `read failed: ${error.message}`).catch(() => {});
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const runs = (data ?? []) as QueuedRun[];
  if (dry) return NextResponse.json({ dry: true, today, due: runs.map(r => ({ id: r.id, student: r.student_name, paper: r.paper_name, queuedFor: r.result_json?.queued_for })) });

  const botBase = process.env.BOT_BASE_URL, botSecret = process.env.BOT_INTERNAL_SECRET;
  const lines: string[] = [];
  let sent = 0, failed = 0;
  for (const r of runs) {
    let ok = false;
    if (botBase && botSecret) {
      try {
        const res = await fetch(`${botBase}/api/mark-paper`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${botSecret}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ phase: 'enqueue', id: r.id }),
          signal: AbortSignal.timeout(20_000),
        });
        const j = await res.json().catch(() => ({} as { ok?: boolean }));
        ok = !!(j as { ok?: boolean })?.ok;
      } catch (e) { console.warn('[daily-queue] enqueue failed', r.id, (e as Error).message); }
    }
    if (ok) {
      sent++;
      await sb.from('paper_marking_runs')
        .update({ result_json: { ...(r.result_json ?? {}), queue_released_at: new Date().toISOString() } })
        .eq('id', r.id);
      lines.push(`🌙 ${r.student_name || r.student_id || '?'} — ${r.paper_name || 'paper'}`);
    } else {
      failed++;
      lines.push(`⚠️ ${r.student_name || r.student_id || '?'} — ${r.paper_name || 'paper'} (not queued)`);
    }
  }
  const summary = runs.length ? `${sent} science paper${sent === 1 ? '' : 's'} into the marking queue${failed ? `, ${failed} not queued` : ''}` : 'nothing waiting';
  if (runs.length) sendTelegram(`📥 Midnight queue (${today}): ${summary}\n${lines.join('\n')}`, 'marking').catch(() => {});
  await logJobRun('daily-queue', failed === 0, summary).catch(() => {});
  return NextResponse.json({ ok: failed === 0, today, sent, failed });
}
