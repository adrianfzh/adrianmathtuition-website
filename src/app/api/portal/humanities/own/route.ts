// /api/portal/humanities/own — hand in an answer to a question the student brought from school
// (15 Oct 2026, lib/humanities-own.ts). POST { subject, skill, question, sources, marks?, answer } → { id }.
// The same reader, cap and report as our own questions (lib/humanities-submit). Anonymous → 401 (the
// health-check probes this). Door: humanitiesOpen().
import { NextRequest, NextResponse } from 'next/server';
import { sessionAccount, portalIdentity } from '@/lib/portal-auth';
import { humanitiesOpen } from '@/lib/portal-beta';
import { getSupabaseAdmin } from '@/lib/supabase';
import { countHumanitiesToday } from '@/lib/humanities-runs';
import { submitHumanities, DAILY_HUMANITIES_CAP } from '@/lib/humanities-submit';
import { checkOwn } from '@/lib/humanities-own';
import { sgtDayStartISO } from '@/lib/sgt';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const account = await sessionAccount();
  if (!account) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  if (!(await humanitiesOpen())) return NextResponse.json({ error: 'Humanities feedback is not open yet.' }, { status: 403 });
  const sid = portalIdentity(account);

  const used = await countHumanitiesToday(sid, sgtDayStartISO());
  if (used >= DAILY_HUMANITIES_CAP) {
    return NextResponse.json({ error: `You have handed in ${used} answers today — the next one goes in tomorrow.` }, { status: 429 });
  }

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const checked = checkOwn(body);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });

  const out = await submitHumanities({
    identity: sid,
    studentName: account.display_name,
    questionId: '',
    own: checked.own,
    answer: String(body.answer ?? ''),
    source: 'app',
  });
  if (!out.ok) return NextResponse.json({ error: out.error }, { status: out.status });

  await getSupabaseAdmin().from('portal_event_log').insert({ identity: sid, kind: 'humanities:submit', detail: { id: out.id, own: true, subject: checked.own.subject, skill: checked.own.skill } }).then(() => {});
  return NextResponse.json({ id: out.id, state: 'queued' });
}
