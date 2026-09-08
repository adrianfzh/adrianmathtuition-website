// GET /api/cron/practice-again-reminders — the compulsory-sheet nag (daily 09:00 SGT).
//
// A Practice Again sheet Adrian queued, vetted and released is one the student
// MUST do (portal_assignments.required_at). While it is still 'assigned' the
// student hears about it on day 3, then weekly, four times at most — Telegram
// through the same recipient rule as a release (lib/student-recipient) plus web
// push. Rule + wording: lib/practice-again-reminders (pure, tested). Stamps
// reminded_at / reminder_count on every nudge, Telegrams Adrian one summary
// line, and stamps job_runs even on a quiet day so a dead cron alarms by absence.
// Auth: CRON_SECRET bearer, x-vercel-cron, or ADMIN_PASSWORD bearer. ?dry=1 lists without sending.
import { NextRequest, NextResponse } from 'next/server';
import { safeEqual } from '@/lib/safe-equal';
import { logJobRun } from '@/lib/job-log';
import { getSupabaseAdmin } from '@/lib/supabase';
import { sendTelegram, sendTelegramTo } from '@/lib/telegram';
import { sendPushToStudent } from '@/lib/portal-push';
import { resolveRecipient } from '@/lib/student-recipient';
import { pickDue, nudgeText, nudgePush, nudgeSummaryLine, FIRST_NUDGE_AFTER_DAYS, type RequiredSheetRow, type NudgeSent } from '@/lib/practice-again-reminders';

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
  const now = new Date();
  const sb = getSupabaseAdmin();
  const site = process.env.WEBSITE_URL || 'https://www.adrianmathtuition.com';

  const oldEnough = new Date(now.getTime() - FIRST_NUDGE_AFTER_DAYS * 86400_000).toISOString();
  const { data, error } = await sb.from('portal_assignments')
    .select('id, airtable_student_id, title, source_run_id, status, required_at, reminded_at, reminder_count')
    .eq('status', 'assigned').not('required_at', 'is', null).lte('required_at', oldEnough)
    .order('required_at', { ascending: true }).limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = (data ?? []) as RequiredSheetRow[];
  const due = pickDue(rows, now);

  // First names for Adrian's line — portal display names, the student id as the fallback.
  const ids = [...new Set(due.map(r => r.airtable_student_id))];
  const names = new Map<string, string>();
  if (ids.length) {
    const { data: accts } = await sb.from('portal_accounts').select('airtable_student_id, display_name').in('airtable_student_id', ids);
    for (const a of accts ?? []) if (a.airtable_student_id) names.set(String(a.airtable_student_id), String(a.display_name || '').split(' ')[0] || String(a.airtable_student_id));
  }
  const whoOf = (sid: string) => names.get(sid) || sid;

  if (dry) {
    return NextResponse.json({ ok: true, dry: true, candidates: rows.length, due: due.map(r => ({ id: r.id, who: whoOf(r.airtable_student_id), title: r.title, nth: (r.reminder_count ?? 0) + 1, text: nudgeText(r, now, site) })) });
  }

  const sent: NudgeSent[] = [];
  const failures: string[] = [];
  for (const r of due) {
    const nth = (r.reminder_count ?? 0) + 1;
    let telegram = false, push = false;
    try {
      const recipient = await resolveRecipient(r.airtable_student_id);
      if (recipient) telegram = await sendTelegramTo(recipient.chatId, nudgeText(r, now, site));
    } catch (e) { failures.push(`${r.id}: telegram ${(e as Error).message}`); }
    try {
      await sendPushToStudent(r.airtable_student_id, nudgePush(r));
      push = true; // best-effort by contract; the lib never throws and logs its own misses
    } catch (e) { failures.push(`${r.id}: push ${(e as Error).message}`); }
    // Stamped whether or not a channel answered: a student with no channel
    // must not be retried every morning — Adrian's line says NO CHANNEL instead.
    const { error: upErr } = await sb.from('portal_assignments')
      .update({ reminded_at: now.toISOString(), reminder_count: nth })
      .eq('id', r.id);
    if (upErr) failures.push(`${r.id}: stamp ${upErr.message}`);
    sent.push({ who: whoOf(r.airtable_student_id), title: r.title, nth, channel: telegram && push ? 'both' : telegram ? 'telegram' : push ? 'push' : 'none' });
  }

  const line = nudgeSummaryLine(sent);
  if (line) await sendTelegram(line, 'marking').catch(() => {});
  const summary = `${sent.length} nudged of ${rows.length} compulsory sheets open${failures.length ? `; ${failures.length} failure(s)` : ''}`;
  await logJobRun('practice-again-reminders', failures.length === 0, summary).catch(() => {});
  return NextResponse.json({ ok: true, open: rows.length, nudged: sent.length, sent, failures });
}
