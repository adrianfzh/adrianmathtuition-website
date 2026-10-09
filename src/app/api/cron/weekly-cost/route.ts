// GET /api/cron/weekly-cost — 💰 the Monday cost check (5 Oct 2026, Adrian: "do
// page-trimming and weekly cost check and cheaper helper steps"). Mondays 08:30 SGT.
//
// ONE plain Telegram message (money topic): what a marked paper cost on average last
// week, split into placing the red pen / reading the pages / extra checks and by lane,
// the month so far, and ONLY the savings whose test has passed — one line each, ending
// "say 'switch <name>' to turn it on" (the names and their flags: docs/OPS.md §Cost
// levers). Pure message: lib/weekly-cost.ts; loader: lib/weekly-cost-store.ts. Stamps
// job_runs either way. Nothing here flips a switch.
// ?dry=1 returns the message without sending it. Auth: CRON_SECRET bearer,
// x-vercel-cron, or ADMIN_PASSWORD bearer.
import { NextRequest, NextResponse } from 'next/server';
import { safeEqual } from '@/lib/safe-equal';
import { logJobRun } from '@/lib/job-log';
import { sendTelegram } from '@/lib/telegram';
import { buildWeeklyCost, weeklyCostMessage } from '@/lib/weekly-cost';
import { loadWeeklyCost } from '@/lib/weekly-cost-store';
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
  const dry = req.nextUrl.searchParams.get('dry') === '1';
  try {
    const w = buildWeeklyCost(await loadWeeklyCost());
    const message = weeklyCostMessage(w);
    if (!dry) {
      await sendTelegram(message, 'money').catch(() => {});
      await fileForBrief({ family: 'weekly-cost', label: 'Weekly cost check', body: message });
      await logJobRun('weekly-cost', true, `${w.papers} papers, US$${w.avg ?? 0} a paper, ${w.savings.length} saving(s) ready`).catch(() => {});
    }
    return NextResponse.json({ ok: true, dry, message, summary: w });
  } catch (e) {
    const message = (e as Error).message;
    if (!dry) await logJobRun('weekly-cost', false, message).catch(() => {});
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
