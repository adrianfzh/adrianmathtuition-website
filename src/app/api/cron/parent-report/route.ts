// GET /api/cron/parent-report — 👪 the weekly parent report (SPEC-PARENT-REPORT.md).
// Sundays 7pm SGT (11:00 UTC). For every ACTIVE parent link: build this week's
// report once (parent_reports, kept), then email the parent a short summary with
// a private 14-day link. A link only becomes active after a parent confirms it,
// and only students who can see the Settings card can make one
// (PARENT_REPORT_OPEN_TO_STUDENTS) — so while that switch is shut, only the
// preview student's links exist and no real parent is emailed.
// ?dry=1 builds nothing and sends nothing: it lists who would get one.
import { NextRequest, NextResponse } from 'next/server';
import { cronAuth } from '@/lib/cron-auth';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { logJobRun } from '@/lib/job-log';
import { createServiceClient } from '@/lib/supabase-server';
import {
  FOCUS_URL, LINK_COLUMNS, accountForIdentity, firstName, reportUrl, reportWords, sendReportEmail, upsertWeekReport, type LinkRow,
} from '@/lib/parent-report-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  if (!cronAuth(req) && !verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const dry = req.nextUrl.searchParams.get('dry') === '1';
  const secret = process.env.SIGNUP_SECRET || '';
  try {
    if (!secret) throw new Error('SIGNUP_SECRET is not set');
    const sb = createServiceClient();
    const { data: links, error } = await sb.from('parent_links').select(`${LINK_COLUMNS}, parent:parent_contacts(email)`).eq('status', 'active').limit(2000);
    if (error) throw new Error(`parent_links: ${error.message}`);
    let built = 0, sent = 0, skipped = 0;
    const failures: string[] = [];
    const started = Date.now();
    for (const raw of (links ?? []) as unknown as (LinkRow & { parent: { email: string } | null })[]) {
      if (Date.now() - started > 270_000) { failures.push('stopped early: out of time (the rest go next run)'); break; }
      const email = raw.parent?.email;
      if (!email) { skipped++; continue; }
      if (dry) { built++; continue; }
      try {
        const account = await accountForIdentity(sb, raw.student_identity);
        if (!account || account.deactivated_at) { skipped++; continue; }
        const rep = await upsertWeekReport(sb, raw, account);
        built++;
        if (rep.emailedAt) continue; // already sent this week (a re-run)
        const words = reportWords(rep.facts, firstName(account), FOCUS_URL);
        const out = await sendReportEmail(email, words, reportUrl(rep.id, secret));
        if (out.sent) { sent++; await sb.from('parent_reports').update({ emailed_at: new Date().toISOString() }).eq('id', rep.id); }
        else failures.push(`link ${raw.id.slice(0, 8)}: ${out.error}`);
      } catch (e) { failures.push(`link ${raw.id.slice(0, 8)}: ${(e as Error).message.slice(0, 120)}`); }
    }
    const summary = `${dry ? '[dry] ' : ''}${built} report(s), ${sent} emailed, ${skipped} skipped${failures.length ? `, ${failures.length} failed` : ''}`;
    await logJobRun('parent-report', failures.length === 0, summary, failures.length ? { failures: failures.slice(0, 10) } : undefined);
    return NextResponse.json({ ok: failures.length === 0, built, sent, skipped, failures });
  } catch (e) {
    await logJobRun('parent-report', false, (e as Error).message);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
