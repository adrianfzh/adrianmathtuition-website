// GET /api/cron/backup-check — 🗄 the monthly backup check (5 Oct 2026).
// 4th of the month, 03:00 SGT (`0 19 3 * *` UTC). What it proves → lib/backup-check.ts.
//
// Quiet when everything passes (the Monday report carries one "Backups checked: ok"
// line the week after); ONE plain Telegram line to the ops topic when anything fails.
// Stamps job_runs `backup-check` either way (ok=false on a failure) so the board
// shows it and a missed month alarms by absence.
//
// ?files=1 — the quick probe: sample files + Supabase's backups only, no copy, no stamp.
// Auth: CRON_SECRET bearer, x-vercel-cron, or ADMIN_PASSWORD bearer.
import { NextRequest, NextResponse } from 'next/server';
import { safeEqual } from '@/lib/safe-equal';
import { logJobRun } from '@/lib/job-log';
import { sendTelegram } from '@/lib/telegram';
import { allProblems, backupCheckLine } from '@/lib/backup-check';
import { runBackupCheck } from '@/lib/backup-check-store';

export const runtime = 'nodejs';
export const maxDuration = 300;

function authed(req: NextRequest): boolean {
  const auth = req.headers.get('authorization') || '';
  if (process.env.CRON_SECRET && safeEqual(auth, `Bearer ${process.env.CRON_SECRET}`)) return true;
  if (req.headers.get('x-vercel-cron')) return true;
  if (process.env.ADMIN_PASSWORD && safeEqual(auth, `Bearer ${process.env.ADMIN_PASSWORD}`)) return true;
  return false;
}

export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const quick = req.nextUrl.searchParams.get('files') === '1';
  try {
    const result = await runBackupCheck({ copy: !quick });
    const problems = allProblems(result);
    const line = backupCheckLine(result);
    if (!quick) {
      await logJobRun('backup-check', problems.length === 0, line, {
        month: result.month,
        pruned: result.pruned,
        tables: result.tables.map((t) => [t.table, t.written, t.readBack, t.live]),
        airtable: result.airtable.map((t) => [t.table, t.written, t.readBack]),
        files: result.files.length,
        managedChecked: result.managed.some((m) => m.checked),
      });
      if (problems.length) await sendTelegram(`🗄 ${line}`, 'ops').catch(() => {});
    }
    return NextResponse.json({ ok: problems.length === 0, line, problems, ...result });
  } catch (err) {
    const msg = (err as Error).message;
    console.error('[backup-check] failed:', msg);
    if (!quick) await sendTelegram(`🗄 Backup check could not run: ${msg.slice(0, 200)}`, 'ops').catch(() => {});
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
