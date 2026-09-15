// GET /api/cron/optout-rollup — "who is skipping which months", in Adrian's
// chat on the 1st of November, December and January at 07:30 SGT.
//
// Adrian, 16 Sep 2026: "give me a telegram message instead for opt outs", then
// yes to sending it "once on the 1st of November, December and January, first
// thing in the morning, just before those invoices get made — so you see who's
// skipping before the bills go out."
//
// ⚠ The cron fires EVERY morning and the route decides. One vercel.json entry
// that asks `shouldSendRollup(now)` beats three date-keyed entries whose
// month-length arithmetic (31 Oct, 30 Nov, 31 Dec, in UTC, for a Singapore
// morning) is a standing invitation to be silently wrong — and Vercel keys
// crons by unique path, so three entries would need three routes.
//
// On a day that is not one of the three this returns immediately and stamps
// nothing: `job_runs` carries only the days the job had work to do, so the
// missed-slot alarm in lib/job-health.ts (kind monthly, day 1, months 1/11/12)
// measures the thing that matters. Wording is lib/optout-notice.ts, the
// Airtable reading is lib/optout-rollup.ts; both pure-tested.
import { NextRequest, NextResponse } from 'next/server';
import { safeEqual } from '@/lib/safe-equal';
import { logJobRun } from '@/lib/job-log';
import { sendTelegram } from '@/lib/telegram';
import { shouldSendRollup, rollupMessage } from '@/lib/optout-notice';
import { buildRollup } from '@/lib/optout-rollup';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authed(req: NextRequest): boolean {
  const auth = req.headers.get('authorization') || '';
  if (req.headers.get('x-vercel-cron')) return true;
  const cron = process.env.CRON_SECRET, admin = process.env.ADMIN_PASSWORD;
  return !!((cron && safeEqual(auth, `Bearer ${cron}`)) || (admin && safeEqual(auth, `Bearer ${admin}`)));
}

export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // ?force=1 sends today's picture whatever the date — how Adrian asks for it
  // out of season, and how this was tested without waiting for November.
  const force = req.nextUrl.searchParams.get('force') === '1';
  const now = new Date();
  if (!force && !shouldSendRollup(now)) {
    return NextResponse.json({ ok: true, skipped: 'not a roll-up day' });
  }

  try {
    const { students, window, offered } = await buildRollup(now);
    const text = rollupMessage(students, { offered, window, now });

    // Nobody skipping means no message. A roll-up that arrives every month
    // saying "0 families" is a message that teaches itself to be ignored — the
    // job_runs stamp below is what proves the job ran.
    if (text) await sendTelegram(text);

    const summary = students.length
      ? `${students.length} skipping (${students.map((s) => s.name).join(', ')})`
      : 'nobody skipping';
    await logJobRun('optout-rollup', true, summary, { offered, months: window }).catch(() => {});
    return NextResponse.json({ ok: true, sent: !!text, students: students.length, offered, months: window });
  } catch (e) {
    await logJobRun('optout-rollup', false, (e as Error).message.slice(0, 200)).catch(() => {});
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 502 });
  }
}
