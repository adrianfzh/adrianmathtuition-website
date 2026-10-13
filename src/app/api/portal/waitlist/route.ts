// POST /api/portal/waitlist — the signed-in student's waiting-list actions on
// /app/reschedule (13 Oct 2026, Adrian: "yes, the app too"). Thin authed proxy to
// the bot's /api/portal-waitlist, where the one waiting-list law lives (bot
// lib/reschedule-queue.js — the same joins, places, offers and holds as Telegram
// and WhatsApp). studentId is injected here from the portal session; the client
// never supplies it.
//   { action: 'join', lessonId, slotId, date } · { action: 'leave', id } · { action: 'answer', id, yes }
// Probed by /api/health-check (expects 401 anonymously).
import { NextRequest, NextResponse } from 'next/server';
import { botConfig, sessionStudentId } from '@/lib/portal-reschedule-proxy';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const studentId = await sessionStudentId();
  if (!studentId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const bot = botConfig();
  if (!bot) return NextResponse.json({ error: 'bot not configured' }, { status: 503 });
  let body: { action?: unknown; lessonId?: unknown; slotId?: unknown; date?: unknown; id?: unknown; yes?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const { action } = body;
  let payload: Record<string, unknown>;
  if (action === 'join') {
    const { lessonId, slotId, date } = body;
    if (![lessonId, slotId, date].every(v => typeof v === 'string' && v)) return NextResponse.json({ error: 'lessonId, slotId and date are required' }, { status: 400 });
    payload = { action, lessonId, slotId, date };
  } else if (action === 'leave') {
    if (!Number.isInteger(body.id)) return NextResponse.json({ error: 'id is required' }, { status: 400 });
    payload = { action, id: body.id };
  } else if (action === 'answer') {
    if (!Number.isInteger(body.id) || typeof body.yes !== 'boolean') return NextResponse.json({ error: 'id and yes are required' }, { status: 400 });
    payload = { action, id: body.id, yes: body.yes };
  } else {
    return NextResponse.json({ error: 'unknown action' }, { status: 400 });
  }
  try {
    const r = await fetch(`${bot.base}/api/portal-waitlist`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${bot.secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId, ...payload }),
    });
    return NextResponse.json(await r.json().catch(() => ({})), { status: r.status });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
