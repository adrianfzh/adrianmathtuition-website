// GET /api/cron/humanities-upload-bank — copy the school questions students sent through "Check my answer" into
// humanities_uploaded_questions, with no student details (15 Oct 2026, lib/humanities-upload-bank.ts). Nightly.
// Stamps job_runs. Auth: CRON_SECRET bearer, x-vercel-cron, or ADMIN_PASSWORD bearer.
import { NextRequest, NextResponse } from 'next/server';
import { safeEqual } from '@/lib/safe-equal';
import { logJobRun } from '@/lib/job-log';
import { bankUploads } from '@/lib/humanities-upload-bank';

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
