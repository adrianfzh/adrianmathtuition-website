// GET /api/cron/backup-check — 🗄 the monthly backup check (5 Oct 2026).
// 4th of the month, 03:00 SGT (`0 19 3 * *` UTC). What it proves → lib/backup-check.ts.
//
// Quiet when everything passes (the Monday report carries one "Backups checked: ok"
// line the week after); ONE plain Telegram line to the ops topic when anything fails.
// Stamps job_runs `backup-check` either way (ok=false on a failure) so the board
// shows it and a missed month alarms by absence.
//
// ?files=1 — the quick probe: sample files + Supabase's backups only, no copy, no stamp.
// Auth: CRON_SECRET or ADMIN_PASSWORD bearer (lib/cron-auth; the scheduler header is not proof, 4 Nov 2026).
import { NextRequest, NextResponse } from 'next/server';
import { logJobRun } from '@/lib/job-log';
import { raiseAlert, clearAlert } from '@/lib/alert-notices';
// 🧹 4 Nov 2026 (Adrian: "Yes, as a rule"): a failure line is kept under 'backup-check' (src/lib/alert-notices.ts)
// and DELETED by the next green run; a ✅ line only when one is too old to delete (Telegram: 48 h).
import { allProblems, backupCheckLine } from '@/lib/backup-check';
import { runBackupCheck } from '@/lib/backup-check-store';
import { cronAuth } from '@/lib/cron-auth';

export const runtime = 'nodejs';
export const maxDuration = 300;

const authed = cronAuth;

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
      if (problems.length) await raiseAlert('backup-check', 'ops', `🗄 ${line}`).catch(() => {});
      else await clearAlert('backup-check', '✅ The backup check passes again.', { category: 'ops' }).catch(() => null);
    }
    return NextResponse.json({ ok: problems.length === 0, line, problems, ...result });
  } catch (err) {
    const msg = (err as Error).message;
    console.error('[backup-check] failed:', msg);
    if (!quick) await raiseAlert('backup-check', 'ops', `🗄 Backup check could not run: ${msg.slice(0, 200)}`, { plain: true }).catch(() => {});
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
