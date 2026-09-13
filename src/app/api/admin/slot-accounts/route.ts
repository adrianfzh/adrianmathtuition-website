// /api/admin/slot-accounts — ⏻ the per-account switches for the Mac slots
// (lib/slot-accounts.ts, 13 Sep 2026: "build me 3 toggles to on/off each one").
//   GET                       → { accounts: [{email, key, label, on, at, by}], off: [keys] }
//   POST { email, on: bool }  → the same, after the flip; one line to the marking topic
// Bearer ADMIN_PASSWORD or the admin session cookie. Every marking and sheet slot
// calls GET before claiming (the worker's own admin token) and skips the claim
// when its account's key is in `off`. Anonymous → 401 (the health-check probes it).
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { SLOT_ACCOUNTS, offKeys, slotAccountRows } from '@/lib/slot-accounts';
import { getSlotAccounts, setSlotAccount } from '@/lib/slot-accounts-store';
import { sendTelegram } from '@/lib/telegram';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const map = await getSlotAccounts(true);
    return NextResponse.json({ accounts: slotAccountRows(map), off: offKeys(map) });
  } catch (e) {
    // Fail open for the workers: an unreadable row reads as "everything on".
    return NextResponse.json({ accounts: slotAccountRows({}), off: [], error: (e as Error).message });
  }
}

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({})) as { email?: unknown; on?: unknown };
  const email = String(body.email ?? '').trim().toLowerCase();
  const known = SLOT_ACCOUNTS.find(a => a.email === email);
  if (!known || typeof body.on !== 'boolean') return NextResponse.json({ error: 'email (a known slot account) and on (boolean) are required' }, { status: 400 });
  try {
    const map = await setSlotAccount(email, body.on, 'adrian');
    sendTelegram(body.on
      ? `⏻ Slots ON for ${email} (${known.label}) — its slots claim again from the next tick.`
      : `⏻ Slots OFF for ${email} (${known.label}) — its slots claim nothing new; whatever they hold finishes first.`, 'marking').catch(() => {});
    return NextResponse.json({ accounts: slotAccountRows(map), off: offKeys(map) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
