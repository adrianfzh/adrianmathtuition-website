// GET /api/cron/humanities-upload-bank — copy the school questions students sent through "Check my answer" into
// humanities_uploaded_questions, with no student details (15 Oct 2026, lib/humanities-upload-bank.ts). Nightly.
// Stamps job_runs. Auth: CRON_SECRET or ADMIN_PASSWORD bearer (lib/cron-auth; the scheduler header is not proof, 4 Nov 2026).
import { NextRequest, NextResponse } from 'next/server';
import { logJobRun } from '@/lib/job-log';
import { bankUploads } from '@/lib/humanities-upload-bank';
import { cronAuth } from '@/lib/cron-auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const authed = cronAuth;

export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const r = await bankUploads();
    await logJobRun('humanities-upload-bank', true, `${r.looked} answers looked at, ${r.added} new school questions`).catch(() => {});
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    const message = (e as Error).message;
    await logJobRun('humanities-upload-bank', false, message).catch(() => {});
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
