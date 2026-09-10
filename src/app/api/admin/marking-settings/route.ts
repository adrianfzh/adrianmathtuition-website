// /api/admin/marking-settings — the 🖥 "Mac plan only" switch (11 Sep 2026,
// lib/marking-settings.ts). GET → the setting; POST { macOnly: boolean, note? }
// → flips it and tells the marking topic. The bot reads the same Airtable row
// on every queue tick, so the flip is live within half a minute.
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getMacOnlySetting, setMacOnly } from '@/lib/marking-settings';
import { sendTelegram } from '@/lib/telegram';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    return NextResponse.json({ macOnly: await getMacOnlySetting(true) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({})) as { macOnly?: unknown; note?: unknown };
  if (typeof body.macOnly !== 'boolean') return NextResponse.json({ error: 'macOnly (boolean) is required' }, { status: 400 });
  try {
    const value = await setMacOnly(body.macOnly, 'adrian', typeof body.note === 'string' ? body.note.slice(0, 200) : undefined);
    sendTelegram(body.macOnly
      ? '🖥 Mac plan only switched ON from mark-paper — nothing goes to the API: no ⚡ full-price runs, no ☁️ batch, no takeovers. Every paper waits for a Mac slot.'
      : '☁️ Mac plan only switched OFF from mark-paper — the normal split is back: the Mac gets a head start, the worker takes the rest.', 'marking').catch(() => {});
    return NextResponse.json({ macOnly: value });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
