// GET /api/cron/shadow-read-report — 👻 the cheaper-reader shadow, read back weekly
// (1 Oct 2026, Adrian: "wire the three"). Thursdays 09:00 SGT, mid-week so the
// Monday report is not the only time the numbers are seen while the test runs.
//
// Every delivered maths paper carrying result_json.shadow_read (the bot's
// lib/shadow-read.js, MARKING_SHADOW_ARMS) is rolled up per arm and per level
// against the noise floor from the weekly consistency re-reads, and ONE Telegram
// message goes to the marking topic with the verdict per level and the first
// disagreeing parts for Adrian to adjudicate. Silent while nothing has been
// shadowed. Stamps job_runs either way so a dead reader shows on /admin/ops.
// Nothing here changes a mark or a flag — a level moves only on Adrian's word.
// Auth: CRON_SECRET bearer, x-vercel-cron, or ADMIN_PASSWORD bearer.
import { NextRequest, NextResponse } from 'next/server';
import { safeEqual } from '@/lib/safe-equal';
import { logJobRun } from '@/lib/job-log';
import { sendTelegram } from '@/lib/telegram';
import { shadowReport } from '@/lib/shadow-read-report';
import { loadShadowSummary } from '@/lib/shadow-read-store';
import { fileForBrief } from '@/lib/staff-inbox';

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
  try {
    const s = await loadShadowSummary();
    const msg = shadowReport(s);
    if (msg) await sendTelegram(msg, 'marking').catch(() => {});
    if (msg) await fileForBrief({ family: 'shadow-read', label: 'Cheaper-reader report', body: msg });
    const papers = s.arms[0]?.all.papers ?? 0;
    const diffs = s.arms[0]?.diffs.length ?? 0;
    await logJobRun('shadow-read-report', true, papers ? `${papers} papers, ${diffs} parts to adjudicate` : 'nothing shadowed yet').catch(() => {});
    return NextResponse.json({ ok: true, papers, diffs, noise: s.noise, sent: !!msg });
  } catch (e) {
    const message = (e as Error).message;
    await logJobRun('shadow-read-report', false, message).catch(() => {});
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
