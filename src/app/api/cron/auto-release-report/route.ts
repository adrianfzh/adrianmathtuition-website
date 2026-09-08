// GET /api/cron/auto-release-report — the number Adrian watches (8 Sep 2026).
//
// Every Monday 8am SGT: how many hand-ins went to students on their own in the
// last 7 days, how many he changed afterwards (an override on a released run),
// and by how much. If five or more went out and more than one in ten needed a
// change, auto-release is switched OFF (lib/auto-release-setting) and he is
// told why — the switch is his to turn back on. Stamps job_runs.
// Auth: CRON_SECRET bearer, x-vercel-cron, or ADMIN_PASSWORD bearer.
import { NextRequest, NextResponse } from 'next/server';
import { safeEqual } from '@/lib/safe-equal';
import { logJobRun } from '@/lib/job-log';
import { getSupabaseAdmin } from '@/lib/supabase';
import { sendTelegram } from '@/lib/telegram';
import { setAutoReleasePaused, getAutoReleaseSetting } from '@/lib/auto-release-setting';
import { summariseAutoReleases } from '@/lib/auto-release-report';

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

export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const sb = getSupabaseAdmin();
  const since = new Date(Date.now() - 7 * 86400_000).toISOString();
  const { data, error } = await sb.from('paper_marking_runs')
    .select('id, student_name, paper_name, released_at, released_via, checked_at, result_json')
    .gte('released_at', since).like('released_via', 'auto:%').is('archived_at', null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const report = summariseAutoReleases(data ?? []);
  const setting = await getAutoReleaseSetting(true);
  let paused = false;
  if (!setting.paused && report.shouldPause) {
    await setAutoReleasePaused(true, 'auto-release-report', report.pauseReason ?? 'override rate').catch(() => {});
    paused = true;
  }
  await sendTelegram(report.telegram + (paused ? '\n⏸ Auto-release has been switched OFF — turn it back on from the desk when you are happy.' : ''), 'marking').catch(() => {});
  await logJobRun('auto-release-report', true, `${report.released} auto-released, ${report.changed} changed after${paused ? ' — PAUSED' : ''}`).catch(() => {});
  return NextResponse.json({ ok: true, ...report, paused });
}
