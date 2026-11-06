// GET /api/cron/file-backup — 🗄 the nightly file backup (5 Oct 2026). 02:30 SGT
// (`30 18 * * *` UTC). Copies every new or changed stored file to the other Supabase
// project's private `backups` bucket until its 4 minutes run out; the next night
// carries on (lib/file-backup.ts). Stamps job_runs `file-backup` every run; ONE plain
// line to Adrian (ops topic) only when a copy failed or files have waited over two
// days once the first full copy has finished.
// Auth: CRON_SECRET or ADMIN_PASSWORD bearer (lib/cron-auth; the scheduler header is not proof, 4 Nov 2026).
import { NextRequest, NextResponse } from 'next/server';
import { logJobRun } from '@/lib/job-log';
import { raiseAlert, clearAlert } from '@/lib/alert-notices';
// 🧹 4 Nov 2026 (Adrian: "Yes, as a rule"): a failure line is kept under 'file-backup' (src/lib/alert-notices.ts)
// and DELETED by the next green run; a ✅ line only when one is too old to delete (Telegram: 48 h).
import { getSupabaseAdmin } from '@/lib/supabase';
import { fileBackupLine, fileBackupProblems } from '@/lib/file-backup';
import { runFileBackup } from '@/lib/file-backup-store';
import { cronAuth } from '@/lib/cron-auth';
import { isQuiet } from '@/lib/quiet-messages';

export const runtime = 'nodejs';
export const maxDuration = 300;

const authed = cronAuth;

export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    // Has the first full copy ever finished? (a run that ended with nothing pending)
    const { data: done } = await getSupabaseAdmin().from('job_runs').select('id')
      .eq('job', 'file-backup').contains('meta', { caughtUp: true }).limit(1);
    const backfillDone = (done?.length ?? 0) > 0;

    // ?concurrency=N (≤12) and ?only=student-files,… — for driving the first full copy.
    const conc = Number(req.nextUrl.searchParams.get('concurrency')) || undefined;
    const only = req.nextUrl.searchParams.get('only')?.split(',').filter(Boolean);
    const r = await runFileBackup({ budgetMs: 210_000, concurrency: conc, only });
    const problems = fileBackupProblems(r, { backfillDone });
    const line = fileBackupLine(r, problems);
    const pending = r.status.flatMap((p) => p.buckets).reduce((s, b) => s + b.pending, 0);
    await logJobRun('file-backup', problems.length === 0, line, {
      copied: r.copied, bytes: r.copiedBytes, failures: r.failures.length, pending,
      caughtUp: pending === 0, expiredRemoved: r.expiredRemoved,
    });
    // onlyIfNew: the table is this job's dedupe — one line per run of failures, not one a night
    if (problems.length) { if (!isQuiet('file-backup')) await raiseAlert('file-backup', 'ops', `🗄 ${line}`, { onlyIfNew: true }).catch(() => {}); }
    else await clearAlert('file-backup', '✅ The file backup works again.', { category: 'ops' }).catch(() => null);
    return NextResponse.json({ ok: problems.length === 0, line, ...r });
  } catch (err) {
    const msg = (err as Error).message;
    console.error('[file-backup] failed:', msg);
    if (!isQuiet('file-backup')) await raiseAlert('file-backup', 'ops', `🗄 The file backup could not run: ${msg.slice(0, 200)}`, { onlyIfNew: true, plain: true }).catch(() => {});
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
