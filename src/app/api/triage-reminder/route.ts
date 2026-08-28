import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { extractFlagged } from '@/lib/mark-triage';
import { triageReminderMessage, type WaitingRun } from '@/lib/triage-reminder';
import { sendTelegram } from '@/lib/telegram';
import { logJobRun } from '@/lib/job-log';
import { verifyAdminAuth } from '@/lib/schedule-helpers';

// ─── Daily triage nag (cron 0 0 * * * = 08:00 SGT) ──────────────────────────
//
// Every marking failure Telegram-notifies exactly once; after that, unreleased
// scripts only surface passively (hub ⏳ card, /admin/ops). This is the active
// backstop: each morning, if anything is still waiting in /admin/mark/triage,
// say so — once, with the same numbers the triage page shows. Nothing waiting →
// no message at all.

export const runtime = 'nodejs';

// Mirrors the triage GET's default window: runs older than this fall off the
// page's default view too, so the reminder and the page keep agreeing.
const WINDOW_DAYS = 14;

function checkAuth(req: NextRequest): boolean {
  // Cron acceptance: Vercel cron header or CRON_SECRET Bearer. Otherwise
  // standard admin auth (signed session cookie or legacy ADMIN_PASSWORD Bearer).
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization');
  if (req.headers.get('x-vercel-cron') === '1') return true;
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true;
  return verifyAdminAuth(req);
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const dry = req.nextUrl.searchParams.get('dry') === '1';

  // Same filter as /api/admin/mark-triage GET: unreleased, in-window, and
  // actually marked (queued runs have no results[] and aren't reviewable yet).
  const since = new Date(Date.now() - WINDOW_DAYS * 86400_000).toISOString();
  const { data, error } = await getSupabaseAdmin()
    .from('paper_marking_runs')
    .select('created_at, paper_name, student_name, result_json')
    .is('released_at', null)
    .is('archived_at', null)
    .gte('created_at', since);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const waiting: WaitingRun[] = (data ?? [])
    .filter(r => Array.isArray((r.result_json as { results?: unknown })?.results))
    .map(r => ({
      paperName: r.paper_name || 'Untitled paper',
      studentName: r.student_name ?? null,
      flaggedCount: extractFlagged(r.result_json).flagged.length,
      createdAt: r.created_at,
      // A held student hand-in (auto-release refused: degraded ticks or a
      // failed release call) outranks Adrian's own uploads — mark it 📱.
      fromStudent: !!(r.result_json as { portal_submission?: unknown })?.portal_submission,
    }));

  const message = triageReminderMessage(waiting, new Date());

  if (dry) {
    return NextResponse.json({ ok: true, dry: true, waiting: waiting.length, message });
  }

  let sent = false;
  if (message) sent = await sendTelegram(message);

  // Stamp even on quiet days — the job RAN; a silent morning must stay
  // distinguishable from a dead cron (that's the whole job_runs contract).
  await logJobRun(
    'triage-reminder',
    message ? sent : true,
    message
      ? `${waiting.length} waiting — ${sent ? 'reminded' : 'Telegram send FAILED'}`
      : '0 waiting — quiet'
  );

  return NextResponse.json({ ok: true, waiting: waiting.length, sent });
}
