// GET /api/cron/figure-needs-weekly — 🖼 the Sunday message (5 Oct 2026, Adrian: the figures twins
// needed that no family draws, grouped, "build them?"). Sundays 18:00 SGT (vercel.json
// `0 10 * * 0`). One plain Telegram to Adrian when anything is open; stamps job_runs
// `figure-needs-weekly` every run (an empty week too). ?dry=1 → the message, nothing sent.
import { NextRequest, NextResponse } from 'next/server';
import { safeEqual } from '@/lib/safe-equal';
import { logJobRun } from '@/lib/job-log';
import { sendTelegram } from '@/lib/telegram';
import { escapeTelegramHtml } from '@/lib/telegram-html';
import { groupNeeds, weeklyMessage } from '@/lib/figure-needs';
import { listFigureNeeds } from '@/lib/figure-needs-store';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authed(req: NextRequest): boolean {
  const auth = req.headers.get('authorization') || '';
  if (req.headers.get('x-vercel-cron')) return true;
  const cron = process.env.CRON_SECRET, admin = process.env.ADMIN_PASSWORD;
  return !!((cron && safeEqual(auth, `Bearer ${cron}`)) || (admin && safeEqual(auth, `Bearer ${admin}`)));
}

export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const dry = req.nextUrl.searchParams.get('dry') === '1';
  try {
    const groups = groupNeeds(await listFigureNeeds());
    const msg = weeklyMessage(groups);
    const text = msg ? `${escapeTelegramHtml(msg)}\n\nhttps://www.adrianmathtuition.com/admin/generated?tab=figures` : null;
    const sent = !dry && text ? await sendTelegram(text) : false;
    const ready = groups.filter((g) => g.ready).length;
    if (!dry) await logJobRun('figure-needs-weekly', true, `${groups.length} shapes open, ${ready} ready to build${text ? (sent ? ', message sent' : ', message NOT sent') : ', nothing to say'}`, { shapes: groups.length, ready, sent });
    return NextResponse.json({ ok: true, dry, shapes: groups.length, ready, sent, message: msg });
  } catch (e) {
    if (!dry) await logJobRun('figure-needs-weekly', false, (e as Error).message.slice(0, 200));
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
