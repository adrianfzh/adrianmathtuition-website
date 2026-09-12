// /api/portal/essays — the student's essay hand-in (SPEC-ESSAY-MARKING.md, 12 Sep 2026).
//
//   POST { kind, question?, text }  → { id }   the row is inserted QUEUED and the bot
//                                             is pinged with the essay, the question,
//                                             the RUBRIC and the CODE LIST (the website
//                                             owns both — lib/essay-submit); the bot
//                                             marks in the background and writes the
//                                             row; the report page polls it.
//   GET  ?id=<uuid>                 → the row  (their own only)
//   GET                             → the list (their own, newest first)
//
// Anonymous → 401 (the health-check probes this). The door itself is
// essayMarkingOpen(): preview identity + Adrian's admin cookie while E1 is closed.
import { NextRequest, NextResponse } from 'next/server';
import { sessionAccount, portalIdentity } from '@/lib/portal-auth';
import { essayMarkingOpen } from '@/lib/portal-beta';
import { getSupabaseAdmin } from '@/lib/supabase';
import { loadEssay, loadEssaysFor, countEssaysToday } from '@/lib/essay-runs';
import { submitEssay, DAILY_ESSAY_CAP } from '@/lib/essay-submit';
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
    const row = await loadEssay(id, sid);
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ essay: row });
  }
  return NextResponse.json({ essays: await loadEssaysFor(sid) });
}

export async function POST(req: NextRequest) {
  const account = await sessionAccount();
  if (!account) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  if (!(await essayMarkingOpen())) return NextResponse.json({ error: 'Essay marking is not open yet.' }, { status: 403 });
  const sid = portalIdentity(account);

  const used = await countEssaysToday(sid, sgtDayStartISO());
  if (used >= DAILY_ESSAY_CAP) {
    return NextResponse.json({ error: `You have handed in ${used} essay${used === 1 ? '' : 's'} today — the next one goes in tomorrow.` }, { status: 429 });
  }

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const out = await submitEssay({
    identity: sid,
    studentName: account.display_name,
    level: account.level,
    kind: String((body as { kind?: unknown }).kind ?? ''),
    question: String((body as { question?: unknown }).question ?? ''),
    text: String((body as { text?: unknown }).text ?? ''),
    source: 'app',
  });
  if (!out.ok) return NextResponse.json({ error: out.error }, { status: out.status });

  const sb = getSupabaseAdmin();
  await sb.from('portal_event_log').insert({ identity: sid, kind: 'essay:submit', detail: { id: out.id, kind: (body as { kind?: unknown }).kind } }).then(() => {});
  return NextResponse.json({ id: out.id, state: 'queued' });
}
