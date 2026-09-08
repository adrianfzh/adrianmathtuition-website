// /api/admin/auto-release — the auto-release switch (8 Sep 2026).
//   GET  → { paused, by, at, note }
//   POST { paused: boolean, note? } → the same, after writing Airtable Settings
// Reachable from the desk header on a phone, so a wrong release can be stopped
// in one tap. The weekly report (/api/cron/auto-release-report) may also flip
// it to paused when Adrian's after-release overrides climb.
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getAutoReleaseSetting, setAutoReleasePaused } from '@/lib/auto-release-setting';
import { sendTelegram } from '@/lib/telegram';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json(await getAutoReleaseSetting(true));
}

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({})) as { paused?: unknown; note?: unknown };
  if (typeof body.paused !== 'boolean') return NextResponse.json({ error: 'paused (boolean) is required' }, { status: 400 });
  try {
    const value = await setAutoReleasePaused(body.paused, 'adrian', typeof body.note === 'string' ? body.note.slice(0, 200) : undefined);
    sendTelegram(body.paused
      ? '⏸ Auto-release switched OFF from the desk — marked hand-ins wait for you again.'
      : '▶️ Auto-release switched ON from the desk — clean hand-ins go to students as soon as they are marked; held ones wait for you.', 'marking').catch(() => {});
    return NextResponse.json(value);
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}
