// GET /api/cron/lesson-end — the end-of-lesson ping + the lesson log that fills
// itself (5 Oct 2026; Vercel cron `2,32 3-13 * * *` UTC = 11:02–21:32 SGT, so a
// lesson ending on the hour is pinged two minutes later).
// Adrian: "i hardly use lesson log … need something … that just logs without
// me doing anything" → then "build end-of-lesson voice note".
//
// For every lesson TODAY whose slot has ended (Scheduled or Completed — an Absent
// or Cancelled lesson gets nothing):
//   1. the auto log (once): what was printed from the Next lesson card that day,
//      what the kiosk printed, what they handed in (lib/lesson-autolog) → the
//      Lessons row (never over a hand-written log, attendance never touched).
//   2. the PING (once per lesson, ALWAYS — not only when something was printed):
//      ONE Telegram message per lesson to the students topic, a group lesson =
//      one message naming everyone (lib/lesson-voice pingText):
//        "📒 Eva's lesson just ended — how did it go?
//         Printed: sine rule practice (printed pack).
//         Hold 🎤 and talk, or tap ✓ if the plan was followed."
//      A voice reply, a typed reply or ✓ comes back through the bot
//      (/api/bot/lesson-log). No answer = nothing more is sent, ever: the auto log
//      stands as "auto (not confirmed)". A ping that would land more than two
//      hours late (a missed tick) is not sent.
//
// The ping is a switch: 📒 on /admin/switches (Airtable Settings `lesson_end_line`;
// no row = on). Off = the log is still written, silently.
//
// ?dry=1 → compose only: nothing written, nothing sent, every ping rendered.
// ?date= → another day (dry only; ?now=HH:MM pretends the clock, dry only; a
// past or future day with no ?now = every lesson that day).
// Stamps job_runs 'lesson-end' on every non-dry run.
import { NextRequest, NextResponse } from 'next/server';
import { safeEqual } from '@/lib/safe-equal';
import { logJobRun } from '@/lib/job-log';
import { getSupabaseAdmin } from '@/lib/supabase';
import { addDaysISO, sgtClock, sgtTodayISO } from '@/lib/sgt';
import { sendTelegramButtonsMessage } from '@/lib/telegram';
import { escapeTelegramHtml } from '@/lib/telegram-html';
import { okCallback, type AutoLog } from '@/lib/lesson-autolog';
import { groupKey, pingDue, pingText, type PingStudent } from '@/lib/lesson-voice';
import { composeForPack, lessonLineOn, lessonsBetween, loadStudent, upsertPack, writeAutoLog, type NextLessonPlan, type PackRow } from '@/lib/next-lesson-store';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

function authed(req: NextRequest): boolean {
  const auth = req.headers.get('authorization') || '';
  if (req.headers.get('x-vercel-cron')) return true;
  const cron = process.env.CRON_SECRET, admin = process.env.ADMIN_PASSWORD;
  return !!((cron && safeEqual(auth, `Bearer ${cron}`)) || (admin && safeEqual(auth, `Bearer ${admin}`)));
}

export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const url = new URL(req.url);
  const dry = url.searchParams.get('dry') === '1';
  const dateParam = url.searchParams.get('date');
  const day = dry && dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : sgtTodayISO();
  const clock = sgtClock();
  const nowParam = dry ? url.searchParams.get('now') : null;
  const nowHHMM = nowParam && /^\d{2}:\d{2}$/.test(nowParam) ? nowParam : day !== sgtTodayISO() ? '24:00' : `${String(clock.hour).padStart(2, '0')}:${String(clock.minute).padStart(2, '0')}`;
  const sb = getSupabaseAdmin();

  try {
    const lessons = (await lessonsBetween(day, addDaysISO(day, 1), ['Scheduled', 'Completed']))
      .filter((l) => l.end && l.end <= nowHHMM);
    const { data: packs } = await sb.from('lesson_packs').select('*').in('lesson_id', lessons.map((l) => l.id).concat(['-']));
    const byLesson = new Map(((packs ?? []) as PackRow[]).map((p) => [p.lesson_id, p]));
    const lineOn = !dry && await lessonLineOn(true);
    const out: Record<string, unknown>[] = [];
    const groups = new Map<string, { end: string; members: { pack: PackRow; first: string; log: AutoLog | null }[] }>();
    let written = 0, sent = 0;
    for (const l of lessons) {
      const student = await loadStudent(l.studentId);
      if (!student || /^adrian\s+fong$/i.test(student.name)) continue;
      let pack = byLesson.get(l.id);
      if (!pack) {
        // booked after the night job (or it missed): a pack with no plan, just to carry the log
        const stub: NextLessonPlan = { builtAt: new Date().toISOString(), lesson: l, mode: 'teach', courses: [], exam: null, weak: [], notes: ['made at the lesson end — no night-before plan'] };
        if (dry) pack = { id: 'dry', airtable_student_id: student.id, student_name: student.name, level: student.level, lesson_id: l.id, lesson_date: l.date, lesson_end: l.end, mode: 'teach', plan: stub, built_at: '', auto_log: null, log_written_at: null, line_sent_at: null, line_message_id: null, confirmed_at: null, confirm_kind: null, reply_text: null, voice_note: null };
        else pack = await upsertPack(sb, student, l, stub);
      }
      let log: AutoLog | null = pack.auto_log;
      let w: { written: boolean; reason?: string } | null = null;
      if (!pack.log_written_at) {
        log = await composeForPack(sb, pack);
        if (!dry) { w = await writeAutoLog(sb, pack, log, 'unconfirmed'); if (w.written) written++; }
      }
      const first = student.name.split(/\s+/)[0];
      out.push({ student: student.name, end: l.end, topics: log?.topics ?? [], written: w?.written ?? null, reason: w?.reason ?? null });
      if (!dry && (pack.line_sent_at || !pingDue(l.end, nowHHMM))) continue; // dry renders every ping
      const key = groupKey(l);
      const g = groups.get(key) ?? { end: l.end!, members: [] };
      g.members.push({ pack, first, log });
      groups.set(key, g);
    }
    const pings: { students: string[]; text: string; sent: boolean }[] = [];
    for (const g of groups.values()) {
      const ps: PingStudent[] = g.members.map((m) => ({ first: m.first, log: m.log, plan: (m.pack.plan?.courses ?? []).map((c) => c.next?.label).filter((x): x is string => !!x) }));
      const text = pingText(ps);
      let messageId: number | null = null;
      if (lineOn) {
        messageId = await sendTelegramButtonsMessage(escapeTelegramHtml(text), [[{ text: '✓ As planned', callback_data: okCallback(g.members[0].pack.id) }]], 'students');
        if (messageId !== null) {
          sent++;
          await sb.from('lesson_packs').update({ line_sent_at: new Date().toISOString(), line_message_id: messageId || null }).in('id', g.members.map((m) => m.pack.id));
        }
      }
      pings.push({ students: g.members.map((m) => m.first), text, sent: messageId !== null });
    }
    if (!dry) await logJobRun('lesson-end', true, `${day} ${nowHHMM}: ${lessons.length} lessons ended, ${written} logged, ${sent} pings${lineOn ? '' : ' (ping switched off)'}`, { written, sent });
    return NextResponse.json({ ok: true, dry, day, now: nowHHMM, lineOn, lessons: out, pings });
  } catch (e) {
    if (!dry) await logJobRun('lesson-end', false, (e as Error).message.slice(0, 200)).catch(() => {});
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 502 });
  }
}
