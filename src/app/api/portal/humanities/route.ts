// /api/portal/humanities — a student's typed humanities answer (SPEC-HUMANITIES.md, 2 Oct 2026).
//
//   POST { questionId, answer } → { id }   the row is inserted QUEUED and two reads of it
//                                          go on the plan queue (lib/humanities-submit);
//                                          the run is settled when they are back, each
//                                          time it is looked at (lib/humanities-settle-run).
//   GET ?id=<uuid>              → the row  (their own only; settled first)
//   GET                         → the list (their own, newest first)
//
// Anonymous → 401 (the health-check probes this). The door is humanitiesOpen():
// the demo student + Adrian's admin cookie while the switch is closed.
import { NextRequest, NextResponse } from 'next/server';
import { sessionAccount, portalIdentity } from '@/lib/portal-auth';
import { humanitiesOpen } from '@/lib/portal-beta';
import { getSupabaseAdmin } from '@/lib/supabase';
import { loadHumanitiesRun, loadHumanitiesFor, countHumanitiesToday } from '@/lib/humanities-runs';
import { submitHumanities, DAILY_HUMANITIES_CAP } from '@/lib/humanities-submit';
import { sgtDayStartISO } from '@/lib/sgt';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f-]{36}$/i;

export async function GET(req: NextRequest) {
  const account = await sessionAccount();
  if (!account) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const sid = portalIdentity(account);
  const id = req.nextUrl.searchParams.get('id');
  if (id) {
    if (!UUID.test(id)) return NextResponse.json({ error: 'bad id' }, { status: 400 });
    const row = await loadHumanitiesRun(id, sid);
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ run: row });
  }
  return NextResponse.json({ runs: await loadHumanitiesFor(sid) });
}

export async function POST(req: NextRequest) {
  const account = await sessionAccount();
  if (!account) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  if (!(await humanitiesOpen())) return NextResponse.json({ error: 'Humanities feedback is not open yet.' }, { status: 403 });
  const sid = portalIdentity(account);

  const used = await countHumanitiesToday(sid, sgtDayStartISO());
  if (used >= DAILY_HUMANITIES_CAP) {
    return NextResponse.json({ error: `You have handed in ${used} answers today — the next one goes in tomorrow.` }, { status: 429 });
  }

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const out = await submitHumanities({
    identity: sid,
    studentName: account.display_name,
    questionId: String((body as { questionId?: unknown }).questionId ?? ''),
    answer: String((body as { answer?: unknown }).answer ?? ''),
    source: 'app',
  });
  if (!out.ok) return NextResponse.json({ error: out.error }, { status: out.status });

  const sb = getSupabaseAdmin();
  await sb.from('portal_event_log').insert({ identity: sid, kind: 'humanities:submit', detail: { id: out.id, questionId: (body as { questionId?: unknown }).questionId } }).then(() => {});
  return NextResponse.json({ id: out.id, state: 'queued' });
}
