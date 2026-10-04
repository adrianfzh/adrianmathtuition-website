// GET /api/cron/stuck-weekly — "where are my students stuck", weekly
// (Vercel cron, Sunday 19:00 SGT = `0 11 * * 0` UTC). Adrian, 5 Oct 2026:
// "yes to all 3" — learn from what students ask the bot and get wrong on papers.
//
//   1. the picture: lib/stuck-store loads the week's asks (ask_skills + the
//      Questions log) and lost marks (notebook_mistakes evidence);
//      lib/stuck-picture finds what was asked most, lost most, both (a gap),
//      and rising against the four weeks before;
//   2. the material: for the top 1–3 gaps a questions-only sheet is drawn by the
//      SAME route the /ws menu uses (/api/bot/worksheet — bank questions by
//      skill, national rows never served), and the gaps' bank sub-skills go to
//      the twins lane first (`twin_focus`, read by scripts/twins/twin.mjs);
//   3. ONE Telegram message to Adrian (students topic) with a ✅ button per
//      sheet. NOTHING is assigned to a student here — only his tap, his typed
//      "send <slug>", or the button on /admin/stuck does that (/api/admin/stuck).
//
// ?dry=1      → everything except the Telegram message and the job stamp (the
//               report row is stored with dry=true so /admin/stuck can show it)
// ?prepare=0  → no sheets drawn
// ?days=N     → the window (default 7; the baseline is the four windows before)
// ?now=ISO    → replay a past week (dry runs only)
// Stamps job_runs 'stuck-weekly' on every non-dry run, quiet weeks included.
import { NextRequest, NextResponse } from 'next/server';
import { safeEqual } from '@/lib/safe-equal';
import { logJobRun } from '@/lib/job-log';
import { getSupabaseAdmin } from '@/lib/supabase';
import { sendTelegramButtonsTo } from '@/lib/telegram';
import { escapeTelegramHtml } from '@/lib/telegram-html';
import { loadStuckInput } from '@/lib/stuck-store';
import { buildStuckPicture, planMaterials, stuckMessage, twinFocusFor, SHEET_COUNT, WEEK_DAYS, type MaterialPlan, type PreparedMaterial } from '@/lib/stuck-picture';
import { sendCallback, worksheetLevel } from '@/lib/stuck-send';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const SITE = 'https://www.adrianmathtuition.com';

function authed(req: NextRequest): boolean {
  const auth = req.headers.get('authorization') || '';
  if (req.headers.get('x-vercel-cron')) return true;
  const cron = process.env.CRON_SECRET, admin = process.env.ADMIN_PASSWORD;
  return !!((cron && safeEqual(auth, `Bearer ${cron}`)) || (admin && safeEqual(auth, `Bearer ${admin}`)));
}

/** Draw the sheet through the /ws worksheet route; a chapter sheet falls back to its first topic. */
async function prepare(plan: MaterialPlan): Promise<PreparedMaterial> {
  const secret = process.env.RENDER_MARKING_SECRET;
  if (!secret) return { ...plan, ok: false, error: 'RENDER_MARKING_SECRET not set' };
  const level = worksheetLevel(plan.subject, plan.level);
  const tries = plan.topics.length > 1 ? [plan.topics, plan.topics.slice(0, 1)] : [plan.topics];
  let last = '';
  for (const topics of tries) {
    try {
      const res = await fetch(`${SITE}/api/bot/worksheet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-render-secret': secret },
        body: JSON.stringify({ level, topics, title: topics.length > 1 ? plan.area : undefined, count: SHEET_COUNT, answers: false }),
        signal: AbortSignal.timeout(90_000),
      });
      const body = await res.json().catch(() => ({})) as { url?: string; title?: string; count?: number; questionIds?: string[]; error?: string };
      if (res.ok && body.url) {
        return { ...plan, topics, ok: true, pdfUrl: body.url, title: body.title, count: body.count, questionIds: body.questionIds };
      }
      last = body.error || `HTTP ${res.status}`;
    } catch (e) {
      last = (e as Error).message;
    }
  }
  return { ...plan, ok: false, error: last.slice(0, 160) };
}

export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const url = new URL(req.url);
  const dry = url.searchParams.get('dry') === '1';
  const doPrepare = url.searchParams.get('prepare') !== '0';
  const days = Math.min(56, Math.max(1, Number(url.searchParams.get('days')) || WEEK_DAYS));
  const nowParam = url.searchParams.get('now');
  const now = dry && nowParam && !Number.isNaN(Date.parse(nowParam)) ? new Date(nowParam) : new Date();
  const sb = getSupabaseAdmin();

  try {
    const input = await loadStuckInput(sb, now, days);
    const picture = buildStuckPicture({ ...input, now, windowDays: days });
    const plans = planMaterials(picture);
    const materials: PreparedMaterial[] = [];
    for (const p of plans) materials.push(doPrepare ? await prepare(p) : { ...p, ok: false, error: 'not prepared (prepare=0)' });

    // the sheets' sub-skills, then A Math AND E Math both topped up (twinFocusFor)
    const twinFocus = twinFocusFor(picture, materials);
    const message = stuckMessage(picture, materials);

    const { data: row, error } = await sb.from('stuck_reports').insert({
      week_from: picture.from, week_to: picture.to, dry,
      // names for /admin/stuck: everyone the picture mentions + every active student (the "send to all" lists)
      picture: { ...picture, notes: input.notes, names: Object.fromEntries(input.students.filter((st) => st.active || picture.students.some((l) => l.studentIds.includes(st.id))).map((st) => [st.id, st.name])) },
      materials, twin_focus: twinFocus, message,
    }).select('id').single();
    if (error) throw new Error(`stuck_reports: ${error.message}`);
    const reportId = (row as { id: string }).id;

    let sent = false;
    if (!dry) {
      const buttons = materials.map((m, i) => ({ m, i })).filter(({ m }) => m.ok).flatMap(({ m, i }) => [
        [{ text: `✅ Send ${m.area} to the ${m.stuckStudents.length} stuck`, callback_data: sendCallback(reportId, i, 'stuck') }],
        [{ text: `Send to all ${m.groupStudents.length} in ${m.groupLabel}`, callback_data: sendCallback(reportId, i, 'all') }],
      ]);
      sent = await sendTelegramButtonsTo(escapeTelegramHtml(message), buttons, 'students');
      await sb.from('stuck_reports').update({ telegram_sent: sent }).eq('id', reportId);
      const summary = `${picture.totals.asks} asks, ${picture.totals.losses} lost questions, ${picture.gaps.length} gaps, ${materials.filter((m) => m.ok).length} sheets ready${sent ? '' : ' — Telegram FAILED'}`;
      await logJobRun('stuck-weekly', sent, summary, { reportId });
    }

    return NextResponse.json({ ok: true, dry, reportId, sent, message, totals: picture.totals, notes: input.notes, gaps: picture.gaps.length, materials });
  } catch (e) {
    if (!dry) await logJobRun('stuck-weekly', false, (e as Error).message.slice(0, 200)).catch(() => {});
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 502 });
  }
}
