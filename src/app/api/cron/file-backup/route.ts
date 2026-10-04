// GET /api/cron/file-backup — 🗄 the nightly file backup (5 Oct 2026). 02:30 SGT
// (`30 18 * * *` UTC). Copies every new or changed stored file to the other Supabase
// project's private `backups` bucket until its 4 minutes run out; the next night
// carries on (lib/file-backup.ts). Stamps job_runs `file-backup` every run; ONE plain
// line to Adrian (ops topic) only when a copy failed or files have waited over two
// days once the first full copy has finished.
// Auth: CRON_SECRET bearer, x-vercel-cron, or ADMIN_PASSWORD bearer.
import { NextRequest, NextResponse } from 'next/server';
import { safeEqual } from '@/lib/safe-equal';
import { logJobRun } from '@/lib/job-log';
import { sendTelegram } from '@/lib/telegram';
import { getSupabaseAdmin } from '@/lib/supabase';
import { fileBackupLine, fileBackupProblems } from '@/lib/file-backup';
import { runFileBackup } from '@/lib/file-backup-store';

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
    if (problems.length) await sendTelegram(`🗄 ${line}`, 'ops').catch(() => {});
    return NextResponse.json({ ok: problems.length === 0, line, ...r });
  } catch (err) {
    const msg = (err as Error).message;
    console.error('[file-backup] failed:', msg);
    await sendTelegram(`🗄 The file backup could not run: ${msg.slice(0, 200)}`, 'ops').catch(() => {});
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
