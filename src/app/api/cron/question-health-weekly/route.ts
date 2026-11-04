// GET /api/cron/question-health-weekly — 🩺 the Monday message (SPEC-QUESTION-HEALTH.md, 14 Oct 2026).
// Mondays 08:10 SGT (vercel.json `10 0 * * 1`). One plain Telegram to Adrian with the week's counts:
// checked · fixed · paused for him · retired. While the check is switched off and nothing ran, it
// sends nothing and only stamps. Stamps job_runs `question-health-weekly` every run. ?dry=1 → the
// message, nothing sent.
import { NextRequest, NextResponse } from 'next/server';
import { logJobRun } from '@/lib/job-log';
import { sendTelegram } from '@/lib/telegram';
import { fileForBrief } from '@/lib/staff-inbox';
import { weeklyMessage } from '@/lib/question-health';
import { weekCounts } from '@/lib/question-health-store';
import { cronAuth } from '@/lib/cron-auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const authed = cronAuth;

export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const dry = req.nextUrl.searchParams.get('dry') === '1';
  try {
    const c = await weekCounts();
    const quiet = !c.on && !c.checked && !c.pausedWaiting;
    const text = weeklyMessage(c);
    const sent = !dry && !quiet ? await sendTelegram(text) : false;
    if (!dry && !quiet) await fileForBrief({ family: 'question-health', label: 'Question check', body: text });
    if (!dry) await logJobRun('question-health-weekly', true, quiet ? 'switched off, nothing to say' : `${c.checked} checked, ${c.fixed} fixed, ${c.paused} paused, ${c.retired} retired${sent ? ', message sent' : ', message NOT sent'}`, { ...c, sent });
    return NextResponse.json({ ok: true, dry, quiet, sent, counts: c, message: text });
  } catch (e) {
    if (!dry) await logJobRun('question-health-weekly', false, (e as Error).message.slice(0, 200));
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
