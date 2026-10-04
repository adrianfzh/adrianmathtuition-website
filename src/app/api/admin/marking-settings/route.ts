// /api/admin/marking-settings — the marking switches (lib/marking-settings.ts).
//   GET  → { macOnly, scienceOpen, visionBatch }
//   POST { macOnly: boolean, note? }      🖥 Mac plan only (11 Sep 2026)
//   POST { scienceOpen: boolean, note? }  🧪 Science tab open to students (11 Sep 2026)
//   POST { visionBatch: boolean, note? }  🌙 Gemini Batch for queued papers (3 Oct 2026)
//   POST { lessonLine: boolean, note? }   📒 the end-of-lesson Telegram line (5 Oct 2026, /api/cron/lesson-end; no row = on)
// Each flip tells the marking topic. The bot reads the Mac-only row on every
// queue tick and the app reads the science row on every request (30 s cache),
// so either flip is live within half a minute, no deploy.
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { verifyAgentAuth } from '@/lib/agent-auth';
import { getMacOnlySetting, getScienceOpenSetting, getVisionBatchSetting, setMacOnly, setScienceOpen, setVisionBatch } from '@/lib/marking-settings';
import { sendTelegram } from '@/lib/telegram';
import { LESSON_LINE_SETTING, lessonLineOn } from '@/lib/next-lesson-store';
import { setMarkingSwitch } from '@/lib/marking-settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!(verifyAdminAuth(req) || verifyAgentAuth(req, 'switches', { route: 'marking-settings' }))) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const [macOnly, scienceOpen, visionBatch, lessonLine] = await Promise.all([getMacOnlySetting(true), getScienceOpenSetting(true), getVisionBatchSetting(true), lessonLineOn(true)]);
    return NextResponse.json({ macOnly, scienceOpen, visionBatch, lessonLine: { on: lessonLine } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!(verifyAdminAuth(req) || verifyAgentAuth(req, 'switches', { route: 'marking-settings' }))) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({})) as { macOnly?: unknown; scienceOpen?: unknown; visionBatch?: unknown; lessonLine?: unknown; note?: unknown };
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
    if (typeof body.visionBatch === 'boolean') {
      const value = await setVisionBatch(body.visionBatch, 'adrian', note);
      sendTelegram(body.visionBatch
        ? '🌙 Gemini Batch switched ON from /admin/switches — a queued paper\'s first vision round goes to the Batch API at half price and may wait up to an hour. ⚡ Mark now still goes live.'
        : '☀️ Gemini Batch switched OFF from /admin/switches — every vision call is live again: full price, no waiting.', 'marking').catch(() => {});
      return NextResponse.json({ visionBatch: value });
    }
    if (typeof body.lessonLine === 'boolean') {
      const value = await setMarkingSwitch(LESSON_LINE_SETTING, body.lessonLine, 'adrian', note);
      return NextResponse.json({ lessonLine: value });
    }
    return NextResponse.json({ error: 'macOnly, scienceOpen, visionBatch or lessonLine (boolean) is required' }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
