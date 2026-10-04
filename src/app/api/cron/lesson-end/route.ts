// GET /api/cron/lesson-end — the lesson log that fills itself (5 Oct 2026,
// Vercel cron `10 3-13 * * *` UTC = every hour at :10, 11:10–21:10 SGT).
// Adrian: "i hardly use lesson log … need something … that just logs without
// me doing anything.. how to do it for physical lessons".
//
// For every lesson TODAY whose slot has ended (Scheduled or Completed, not yet
// done here): what was printed for the student from the Next lesson card that
// day, what the kiosk printed for them, what they handed in → the auto log
// (lib/lesson-autolog), written to the Lessons row (never over a hand-written
// log, attendance never touched) and ONE Telegram line to Adrian (students
// topic): "📒 Eva today: … Tap ✓ if right, or reply with what you did." The ✓
// and a reply come back through the bot (/api/bot/lesson-log). No reply = the
// entry stands as "auto (not confirmed)". A lesson where nothing was printed or
// handed in gets no line and no entry (nothing to confirm).
//
// The line is a switch: 📒 on /admin/switches (Airtable Settings `lesson_end_line`;
// no row = on). Off = the log is still written, silently.
//
// ?dry=1 → compose only: nothing written, nothing sent. ?date= → another day (dry only).
// Stamps job_runs 'lesson-end' on every non-dry run.
import { NextRequest, NextResponse } from 'next/server';
import { safeEqual } from '@/lib/safe-equal';
import { logJobRun } from '@/lib/job-log';
import { getSupabaseAdmin } from '@/lib/supabase';
import { addDaysISO, sgtClock, sgtTodayISO } from '@/lib/sgt';
import { sendTelegramButtonsMessage } from '@/lib/telegram';
import { escapeTelegramHtml } from '@/lib/telegram-html';
import { autoLogLine, okCallback } from '@/lib/lesson-autolog';
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
  const nowHHMM = day < sgtTodayISO() ? '24:00' : `${String(clock.hour).padStart(2, '0')}:${String(clock.minute).padStart(2, '0')}`;
  const sb = getSupabaseAdmin();

  try {
    const lessons = (await lessonsBetween(day, addDaysISO(day, 1), ['Scheduled', 'Completed']))
      .filter((l) => l.end && l.end <= nowHHMM);
    const { data: packs } = await sb.from('lesson_packs').select('*').in('lesson_id', lessons.map((l) => l.id).concat(['-']));
    const byLesson = new Map(((packs ?? []) as PackRow[]).map((p) => [p.lesson_id, p]));
    const lineOn = !dry && await lessonLineOn(true);
    const out: Record<string, unknown>[] = [];
    let written = 0, sent = 0;
    for (const l of lessons) {
      let pack = byLesson.get(l.id);
      if (pack?.log_written_at) continue; // done on an earlier tick
      const student = await loadStudent(l.studentId);
      if (!student || /^adrian\s+fong$/i.test(student.name)) continue;
      if (!pack) {
        // booked after the night job (or it missed): a pack with no plan, just to carry the log
        const stub: NextLessonPlan = { builtAt: new Date().toISOString(), lesson: l, mode: 'teach', courses: [], exam: null, weak: [], notes: ['made at the lesson end — no night-before plan'] };
        if (dry) pack = { id: 'dry', airtable_student_id: student.id, student_name: student.name, level: student.level, lesson_id: l.id, lesson_date: l.date, lesson_end: l.end, mode: 'teach', plan: stub, built_at: '', auto_log: null, log_written_at: null, line_sent_at: null, line_message_id: null, confirmed_at: null, confirm_kind: null, reply_text: null };
        else pack = await upsertPack(sb, student, l, stub);
      }
      const log = await composeForPack(sb, pack);
      const first = student.name.split(/\s+/)[0];
      const line = autoLogLine(first, log);
      if (dry) { out.push({ student: student.name, end: l.end, empty: log.empty, line: log.empty ? null : line, topics: log.topics }); continue; }
      const w = await writeAutoLog(sb, pack, log, 'unconfirmed');
      if (w.written) written++;
      let messageId: number | null = null;
      if (lineOn && !log.empty && !pack.line_sent_at) {
        messageId = await sendTelegramButtonsMessage(escapeTelegramHtml(line), [[{ text: '✓ Right', callback_data: okCallback(pack.id) }]], 'students');
        if (messageId !== null) {
          sent++;
          await sb.from('lesson_packs').update({ line_sent_at: new Date().toISOString(), line_message_id: messageId || null }).eq('id', pack.id);
        }
      }
      out.push({ student: student.name, end: l.end, written: w.written, reason: w.reason ?? null, sent: messageId !== null });
    }
    if (!dry) await logJobRun('lesson-end', true, `${day} ${nowHHMM}: ${lessons.length} lessons ended, ${written} logged, ${sent} lines${lineOn ? '' : ' (line switched off)'}`, { written, sent });
    return NextResponse.json({ ok: true, dry, day, now: nowHHMM, lineOn, lessons: out });
  } catch (e) {
    if (!dry) await logJobRun('lesson-end', false, (e as Error).message.slice(0, 200)).catch(() => {});
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 502 });
  }
}
