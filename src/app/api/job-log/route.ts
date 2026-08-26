// POST /api/job-log — the logbook stamp for anything that isn't a Vercel route:
// the Mac's plan-billed workers, shell scripts, the bot. One curl, one row.
//
//   curl -X POST .../api/job-log -H "Authorization: Bearer $CRON_SECRET" \
//     -H 'Content-Type: application/json' \
//     -d '{"job":"qb-topup","ok":true,"summary":"added 12 questions"}'
//
// Reading the logbook is /api/admin/ops; alarming on it is the health check.

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { logJobRun } from '@/lib/job-log';

export const runtime = 'nodejs';

function authed(req: NextRequest): boolean {
  const auth = req.headers.get('authorization');
  if (process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`) return true;
  return verifyAdminAuth(req);
}

export async function POST(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let body: { job?: string; ok?: boolean; summary?: string; meta?: Record<string, unknown> };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const job = String(body.job || '').trim().toLowerCase();
  if (!job || job.length > 60 || !/^[a-z0-9][a-z0-9-]*$/.test(job)) {
    return NextResponse.json({ error: 'job must be a short kebab-case slug' }, { status: 400 });
  }
  await logJobRun(job, body.ok !== false, body.summary, body.meta);
  return NextResponse.json({ ok: true });
}
