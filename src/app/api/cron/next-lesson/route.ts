// GET /api/cron/next-lesson — the night before each lesson (5 Oct 2026, Vercel
// cron `0 12 * * *` UTC = 20:00 SGT). For every student with a Scheduled lesson
// TOMORROW: the plan (what's next and why, or exam prep inside three weeks of an
// exam) and the ready-to-print PDFs (lib/next-lesson-store buildPackFor),
// shown on /admin/students/<id>/next and the profile's Overview card. Silent —
// no message; Adrian looks at the card when he wants it.
//
// The same run refreshes the auto log of the last three days' lessons that
// Adrian has not confirmed, so work handed in after a lesson joins its log.
//
// ?dry=1      → plans only, nothing stored, no PDFs, no job stamp; returns the plans
// ?date=ISO   → the lesson day to prepare (default tomorrow, SGT)
// ?student=   → one student only
// ?items=0    → plans stored, no PDFs
// Stamps job_runs 'next-lesson' on every non-dry run.
import { NextRequest, NextResponse } from 'next/server';
import { safeEqual } from '@/lib/safe-equal';
import { logJobRun } from '@/lib/job-log';
import { getSupabaseAdmin } from '@/lib/supabase';
import { addDaysISO, sgtTodayISO } from '@/lib/sgt';
import { buildPackFor, buildPlan, composeForPack, lessonsBetween, loadStudent, writeAutoLog, type PackRow } from '@/lib/next-lesson-store';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Stop starting PDFs after this, so the run ends inside maxDuration; the rest show "Prepare now". */
const BUDGET_MS = 230_000;

function authed(req: NextRequest): boolean {
  const auth = req.headers.get('authorization') || '';
  if (req.headers.get('x-vercel-cron')) return true;
  const cron = process.env.CRON_SECRET, admin = process.env.ADMIN_PASSWORD;
  return !!((cron && safeEqual(auth, `Bearer ${cron}`)) || (admin && safeEqual(auth, `Bearer ${admin}`)));
}

export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const t0 = Date.now();
  const url = new URL(req.url);
  const dry = url.searchParams.get('dry') === '1';
  const items = url.searchParams.get('items') !== '0';
  const onlyStudent = url.searchParams.get('student');
  const dateParam = url.searchParams.get('date');
  const day = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : addDaysISO(sgtTodayISO(), 1);
  const sb = getSupabaseAdmin();

  try {
    const lessons = (await lessonsBetween(day, addDaysISO(day, 1))).filter((l) => !onlyStudent || l.studentId === onlyStudent);
    const out: Record<string, unknown>[] = [];
    let made = 0, failed = 0, planOnly = 0;
    for (const l of lessons) {
      const student = await loadStudent(l.studentId);
      if (!student || /^adrian\s+fong$/i.test(student.name)) continue;
      if (dry) {
        const plan = await buildPlan(sb, student, l);
        out.push({ student: student.name, level: student.level, subjects: student.subjects, lesson: l, plan });
        continue;
      }
      const withItems = items && Date.now() - t0 < BUDGET_MS;
      if (!withItems) planOnly++;
      try {
        const r = await buildPackFor(sb, student, l, { items: withItems });
        made += r.items.filter((i) => i.status === 'ready').length;
        failed += r.items.filter((i) => i.status !== 'ready').length;
        out.push({ student: student.name, mode: r.pack.mode, items: r.items.map((i) => `${i.title}${i.status === 'ready' ? '' : ` (failed: ${i.error})`}`) });
      } catch (e) {
        failed++;
        out.push({ student: student.name, error: (e as Error).message.slice(0, 200) });
      }
    }

    // refresh the auto log of recent unconfirmed lessons (hand-ins arrive after the lesson)
    let refreshed = 0;
    if (!dry) {
      const { data: recent } = await sb.from('lesson_packs').select('*')
        .gte('lesson_date', addDaysISO(sgtTodayISO(), -3)).lt('lesson_date', sgtTodayISO())
        .not('log_written_at', 'is', null).is('confirmed_at', null);
      for (const p of (recent ?? []) as PackRow[]) {
        const log = await composeForPack(sb, p);
        if (JSON.stringify(log.phrases) === JSON.stringify(p.auto_log?.phrases ?? [])) continue;
        const w = await writeAutoLog(sb, p, log, 'unconfirmed');
        if (w.written) refreshed++;
      }
      const summary = `${day}: ${lessons.length} lessons, ${made} PDFs ready${failed ? `, ${failed} failed` : ''}${planOnly ? `, ${planOnly} plan only (time)` : ''}${refreshed ? `, ${refreshed} auto logs refreshed` : ''}`;
      await logJobRun('next-lesson', failed === 0 || made > 0, summary, { day, lessons: lessons.length, made, failed, planOnly, refreshed });
    }
    return NextResponse.json({ ok: true, dry, day, lessons: lessons.length, made, failed, planOnly, refreshed, packs: out });
  } catch (e) {
    if (!dry) await logJobRun('next-lesson', false, (e as Error).message.slice(0, 200)).catch(() => {});
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 502 });
  }
}
