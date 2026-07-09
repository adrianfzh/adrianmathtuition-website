// GET /api/portal/learn/today
// Up to 4 personalised "start here" learn cards for the dashboard Today stack.
// Auth: portal student session OR admin Bearer. Admin (no student) → {cards:[]}.
// Delegates to getTodayCards; every underlying call degrades silently so this
// route (and the dashboard that mirrors it) never 500s.
import { NextRequest, NextResponse } from 'next/server';
import { practiceAuth } from '@/lib/practice';
import { getTodayCards } from '@/lib/portal-today';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const caller = await practiceAuth(req);
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Admin (testing) has no student context to personalise against.
  if (caller.kind !== 'student') return NextResponse.json({ cards: [] });

  const cards = await getTodayCards(caller.account);
  return NextResponse.json({ cards });
}
