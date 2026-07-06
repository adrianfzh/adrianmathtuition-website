// Daily portal-practice digest → one Telegram message (cron: 9:30pm SGT).
// Replaces the per-grade ping: automation shouldn't page the human per event.
// Flags low scores so Adrian knows which grades to spot-check first.
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { sendTelegram } from '@/lib/telegram';

function cronAuthorized(req: NextRequest): boolean {
  if (req.headers.get('x-vercel-cron')) return true;
  const auth = req.headers.get('authorization') || '';
  return auth === `Bearer ${process.env.CRON_SECRET}` || auth === `Bearer ${process.env.ADMIN_PASSWORD}`;
}

export async function GET(req: NextRequest) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createServiceClient();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: attempts } = await admin
    .from('student_attempts')
    .select('user_id, marking_verdict, marking_json, attempted_at')
    .eq('attempted_via', 'portal')
    .gte('attempted_at', since)
    .not('marking_json', 'is', null);

  if (!attempts?.length) return NextResponse.json({ ok: true, attempts: 0 });

  const userIds = [...new Set(attempts.map(a => a.user_id).filter(Boolean))];
  const { data: accounts } = await admin
    .from('portal_accounts').select('id, display_name, email').in('id', userIds);
  const nameById = Object.fromEntries((accounts || []).map(a => [a.id, a.display_name || a.email]));

  const byStudent = new Map<string, { n: number; scores: string[]; low: number }>();
  for (const a of attempts) {
    const key = nameById[a.user_id as string] || 'unknown';
    const mj = (a.marking_json || {}) as { score?: number; outOf?: number; topics?: string[] };
    if (!byStudent.has(key)) byStudent.set(key, { n: 0, scores: [], low: 0 });
    const s = byStudent.get(key)!;
    s.n++;
    if (typeof mj.score === 'number' && typeof mj.outOf === 'number') {
      s.scores.push(`${mj.score}/${mj.outOf}${mj.topics?.[0] ? ` (${mj.topics[0]})` : ''}`);
      if (mj.outOf > 0 && mj.score / mj.outOf < 0.4) s.low++;
    }
  }

  const lines = [...byStudent.entries()].map(([name, s]) =>
    `• ${name}: ${s.n} attempt${s.n === 1 ? '' : 's'}${s.low ? ` — ⚠ ${s.low} low` : ''}\n   ${s.scores.slice(0, 6).join(', ')}`);

  await sendTelegram(
    `🎓 Portal practice — last 24h\n${attempts.length} graded attempt${attempts.length === 1 ? '' : 's'} from ${byStudent.size} student${byStudent.size === 1 ? '' : 's'}\n\n${lines.join('\n')}\n\nSpot-check low scores in /admin (attempts are stored with full feedback).`
  );

  return NextResponse.json({ ok: true, attempts: attempts.length, students: byStudent.size });
}
