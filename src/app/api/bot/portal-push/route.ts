// POST /api/bot/portal-push — the bot asks us to ring a student's app (13 Oct 2026,
// Adrian: "yes, the app too"). First caller: a waiting-list offer (bot
// lib/portal-waitlist.js pushOfferToApp) — "A slot at … has opened up — tap to
// answer", opening /app/reschedule. The push keys and the subscriptions live here,
// so the bot never holds them. Bearer BOT_INTERNAL_SECRET.
//   { studentId: 'rec…', title, body?, url? } → { ok, sent }  (sent = devices reached;
//   0 = the student has no app subscription — the bot then does not count "App")
// Only paths inside the app may be opened (buildPushPayload also refuses off-site urls).
import { NextRequest, NextResponse } from 'next/server';
import { safeEqual } from '@/lib/safe-equal';
import { sendPushToStudent } from '@/lib/portal-push';

export const dynamic = 'force-dynamic';

const STUDENT_ID = /^rec[A-Za-z0-9]{14,}$/;

export async function POST(req: NextRequest) {
  const secret = process.env.BOT_INTERNAL_SECRET;
  if (!secret || !safeEqual(req.headers.get('authorization') ?? '', `Bearer ${secret}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  let b: { studentId?: unknown; title?: unknown; body?: unknown; url?: unknown };
  try { b = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const studentId = typeof b.studentId === 'string' ? b.studentId : '';
  const title = typeof b.title === 'string' ? b.title.trim() : '';
  if (!STUDENT_ID.test(studentId) || !title) return NextResponse.json({ error: 'studentId and title are required' }, { status: 400 });
  const url = typeof b.url === 'string' && /^\/app(\/|$)/.test(b.url) ? b.url : '/app';
  const body = typeof b.body === 'string' ? b.body : '';
  const sent = await sendPushToStudent(studentId, { title, body, url });
  return NextResponse.json({ ok: true, sent });
}
