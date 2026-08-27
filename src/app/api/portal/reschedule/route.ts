// GET/POST /api/portal/reschedule — the signed-in student moves their OWN
// lesson. Thin authed proxy to the bot's /api/portal-reschedule: all the
// reschedule law (movable-lesson list, 4-week window, capacity, blocked dates,
// the one-hour rule, the canonical replacement-pair write, Adrian's Telegram
// notification) lives in the bot's lib/reschedule.js so this surface can never
// drift from the Telegram/WhatsApp flows. studentId is injected server-side
// from the portal session — the client never supplies it.
// Probed by /api/health-check (expects 401 anonymously).
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase-server';
import type { PortalAccount } from '@/lib/portal-auth';

export const runtime = 'nodejs';

async function sessionStudentId(): Promise<string | null> {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: account } = await supabase
    .from('portal_accounts').select('airtable_student_id').eq('id', user.id).single<Pick<PortalAccount, 'airtable_student_id'>>();
  return account?.airtable_student_id ?? null;
}

function botConfig(): { base: string; secret: string } | null {
  const base = process.env.BOT_BASE_URL, secret = process.env.BOT_INTERNAL_SECRET;
  return base && secret ? { base, secret } : null;
}

export async function GET() {
  const studentId = await sessionStudentId();
  if (!studentId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const bot = botConfig();
  if (!bot) return NextResponse.json({ error: 'bot not configured' }, { status: 503 });
  try {
    const r = await fetch(`${bot.base}/api/portal-reschedule?studentId=${encodeURIComponent(studentId)}`, {
      headers: { Authorization: `Bearer ${bot.secret}` },
    });
    return NextResponse.json(await r.json().catch(() => ({})), { status: r.status });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  const studentId = await sessionStudentId();
  if (!studentId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const bot = botConfig();
  if (!bot) return NextResponse.json({ error: 'bot not configured' }, { status: 503 });
  let body: { lessonId?: string; slotId?: string; date?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const { lessonId, slotId, date } = body;
  if (!lessonId || !slotId || !date) {
    return NextResponse.json({ error: 'lessonId, slotId and date are required' }, { status: 400 });
  }
  try {
    const r = await fetch(`${bot.base}/api/portal-reschedule`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${bot.secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId, lessonId, slotId, date }),
    });
    return NextResponse.json(await r.json().catch(() => ({})), { status: r.status });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
