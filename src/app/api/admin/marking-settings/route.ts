// /api/admin/marking-settings — the marking switches (lib/marking-settings.ts).
//   GET  → { macOnly, scienceOpen }
//   POST { macOnly: boolean, note? }      🖥 Mac plan only (11 Sep 2026)
//   POST { scienceOpen: boolean, note? }  🧪 Science tab open to students (11 Sep 2026)
// Each flip tells the marking topic. The bot reads the Mac-only row on every
// queue tick and the app reads the science row on every request (30 s cache),
// so either flip is live within half a minute, no deploy.
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getMacOnlySetting, getScienceOpenSetting, setMacOnly, setScienceOpen } from '@/lib/marking-settings';
import { sendTelegram } from '@/lib/telegram';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const [macOnly, scienceOpen] = await Promise.all([getMacOnlySetting(true), getScienceOpenSetting(true)]);
    return NextResponse.json({ macOnly, scienceOpen });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({})) as { macOnly?: unknown; scienceOpen?: unknown; note?: unknown };
  const note = typeof body.note === 'string' ? body.note.slice(0, 200) : undefined;
  try {
    if (typeof body.macOnly === 'boolean') {
      const value = await setMacOnly(body.macOnly, 'adrian', note);
      sendTelegram(body.macOnly
        ? '🖥 Mac plan only switched ON from mark-paper — nothing goes to the API: no ⚡ full-price runs, no ☁️ batch, no takeovers. Every paper waits for a Mac slot.'
        : '☁️ Mac plan only switched OFF from mark-paper — the normal split is back: the Mac gets a head start, the worker takes the rest.', 'marking').catch(() => {});
      return NextResponse.json({ macOnly: value });
    }
    if (typeof body.scienceOpen === 'boolean') {
      const value = await setScienceOpen(body.scienceOpen, 'adrian', note);
      sendTelegram(body.scienceOpen
        ? '🧪 Science tab OPENED to students from mark-paper — every signed-in student now sees Math | Science and can hand in physics / chemistry / biology papers. Marks are labelled an estimate; the feedback comes first.'
        : '🧪 Science tab CLOSED to students from mark-paper — students see the maths app only; your admin preview still has it.', 'marking').catch(() => {});
      return NextResponse.json({ scienceOpen: value });
    }
    return NextResponse.json({ error: 'macOnly or scienceOpen (boolean) is required' }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
