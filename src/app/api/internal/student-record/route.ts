// GET /api/internal/student-record?chatId=|accountId=|airtableId=|chatKey=
// The shared "who is this?" answer (docs/STUDENT-DATA-MAP.md §4). Bearer BOT_INTERNAL_SECRET
// only. Read-only. Internal: the reply carries a student's name and ids.
import { NextRequest, NextResponse } from 'next/server';
import { safeEqual } from '@/lib/safe-equal';
import { botInternalSecret } from '@/lib/bot-secret';
import { resolveStudent } from '@/lib/student-record';
import { realLookups } from '@/lib/student-record-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const secret = botInternalSecret();
  if (!secret || !safeEqual(req.headers.get('authorization') || '', `Bearer ${secret}`)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const p = req.nextUrl.searchParams;
  const q = { chatId: p.get('chatId') || undefined, accountId: p.get('accountId') || undefined, airtableId: p.get('airtableId') || undefined, chatKey: p.get('chatKey') || undefined };
  if (!q.chatId && !q.accountId && !q.airtableId && !q.chatKey) return NextResponse.json({ error: 'give chatId, accountId, airtableId or chatKey' }, { status: 400 });
  try { return NextResponse.json(await resolveStudent(q, realLookups())); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}
