// GET  /api/kiosk/status → { open, mode, adminBypass, nextOpen, hoursSummary }
//   `open` = servable to a normal kiosk device right now (mode + hours). Admin
//   callers always get open=true (adminBypass) so Adrian can use/test anytime.
// POST /api/kiosk/status { mode: 'closed'|'open'|'scheduled' } — admin only.
import { NextRequest, NextResponse } from 'next/server';
import { verifyKioskAuth } from '@/lib/kiosk-session';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getKioskMode, setKioskMode } from '@/lib/kiosk-config';
import { kioskOpenForMode, nextOpenLabel, HOURS_SUMMARY, type KioskMode } from '@/lib/kiosk-hours';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  // Any kiosk device (or admin) may read status — the closed screen needs it.
  if (!verifyKioskAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const mode = await getKioskMode();
  const isAdmin = verifyAdminAuth(req);
  const openForDevice = kioskOpenForMode(mode);
  return NextResponse.json({
    open: isAdmin ? true : openForDevice,
    mode,
    admin: isAdmin, // client skips QR pairing for Adrian's own browser
    adminBypass: isAdmin && !openForDevice,
    nextOpen: openForDevice ? null : nextOpenLabel(),
    hoursSummary: HOURS_SUMMARY,
  });
}

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const mode = body.mode as KioskMode;
  if (mode !== 'closed' && mode !== 'open' && mode !== 'scheduled') {
    return NextResponse.json({ error: 'mode must be closed, open or scheduled' }, { status: 400 });
  }
  await setKioskMode(mode);
  return NextResponse.json({ ok: true, mode, openForDevice: kioskOpenForMode(mode) });
}
