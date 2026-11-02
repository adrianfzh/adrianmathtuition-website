// GET /api/cron/away-reminder — daily 8:30am SGT. Two jobs for Adrian's 🏖 away dates
// (lib/away-lessons.ts; Adrian, 2 Nov 2026: "can it also mark the scheduled lessons
// as missed with reason? and remind me to arrange for make up lessons with the
// parents 2 weeks before?"):
//   1. Sweep: any lesson still Scheduled inside a period that is not over → missed,
//      with the away line. Catches lessons the weekly generator added after the
//      period was saved (it only builds a few weeks ahead).
//   2. Reminder: once per period, from 14 days before it starts, a Telegram to
//      Adrian listing each student and date to arrange a make-up for. The day it
//      went out is stored on the period (remindedOn) so it is sent once.
// Auth: CRON_SECRET bearer, x-vercel-cron, or ADMIN_PASSWORD bearer. ?dry=1 changes nothing.
import { NextRequest, NextResponse } from 'next/server';
import { safeEqual } from '@/lib/safe-equal';
import { logJobRun } from '@/lib/job-log';
import { sendTelegram } from '@/lib/telegram';
import { sgtTodayISO } from '@/lib/sgt';
import { fetchBlockedRecord, saveBlockedRanges } from '@/lib/blocked-dates';
import { liveRanges, reminderDue, reminderMessage, rangeLabel } from '@/lib/away-lessons';
import { markAwayLessons, awayLessonsFor } from '@/lib/away-lessons-store';

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
  const today = sgtTodayISO();
  try {
    const { id, ranges } = await fetchBlockedRecord();
    const live = liveRanges(ranges, today);
    const swept: { period: string; marked: number }[] = [];
    const reminded: string[] = [];
    let changed = false;
    for (const r of live) {
      if (!dry) {
        const marked = await markAwayLessons(r);
        if (marked) swept.push({ period: rangeLabel(r), marked });
      }
      if (reminderDue(r, today)) {
        const lessons = await awayLessonsFor(r);
        if (dry) { reminded.push(`${rangeLabel(r)} (${lessons.length} lessons, not sent: dry run)`); continue; }
        const sent = await sendTelegram(reminderMessage(r, lessons), 'students');
        if (sent) { r.remindedOn = today; changed = true; reminded.push(rangeLabel(r)); }
      }
    }
    if (changed) await saveBlockedRanges(id, ranges);
    const summary = `${live.length} away period(s); swept ${swept.reduce((n, s) => n + s.marked, 0)}; reminded ${reminded.length}`;
    if (!dry) await logJobRun('away-reminder', true, summary);
    return NextResponse.json({ ok: true, today, dry, swept, reminded });
  } catch (e) {
    const msg = (e as Error).message;
    if (!dry) await logJobRun('away-reminder', false, msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
