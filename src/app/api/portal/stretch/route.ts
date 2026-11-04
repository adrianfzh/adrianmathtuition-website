// /api/portal/stretch — 🧩 this week's stretch set (SPEC-STRETCH-SET.md).
//
// GET  → the student's set for this week (built on the first ask of the week, then kept)
//        with the question text for the ids on screen, the spot card, and results so far.
// POST { slot, remind?, prediction?, predictionClose?, spotRight? } → saves the student's
//        own input for one slot (lib/stretch-set parseResponse / mergeResponse). Nothing
//        here is graded: the questions are graded by /api/portal/practice/grade through
//        /app/practice?qid=…&from=stretch, which writes student_attempts — the rows the
//        nightly difficulty job reads.
//
// Auth: a portal student session; behind STRETCH_SET_OPEN_TO_STUDENTS (stretchSetVisible).
// Anonymous → 401 (probed by /api/health-check 'portal-stretch').
import { NextRequest, NextResponse } from 'next/server';
import { practiceAuth } from '@/lib/practice';
import { portalIdentity } from '@/lib/portal-auth';
import { stretchSetVisible } from '@/lib/portal-beta';
import { createServiceClient } from '@/lib/supabase-server';
import { loadOrBuildSet, loadSet, saveResponse, thisWeek, viewSet } from '@/lib/stretch-set-store';
import { mergeResponse, parseResponse } from '@/lib/stretch-set';

export const runtime = 'nodejs';
export const maxDuration = 30;

async function student(req: NextRequest) {
  const caller = await practiceAuth(req);
  if (!caller) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (caller.kind !== 'student') return { error: NextResponse.json({ error: 'Student session only — Adrian previews on /admin/stretch' }, { status: 400 }) };
  if (!(await stretchSetVisible(portalIdentity(caller.account)))) return { error: NextResponse.json({ error: 'Not open yet' }, { status: 403 }) };
  return { account: caller.account };
}

export async function GET(req: NextRequest) {
  const s = await student(req);
  if (s.error) return s.error;
  const sb = createServiceClient();
  try {
    const out = await loadOrBuildSet(sb, s.account, { builtBy: 'student' });
    if (!out) return NextResponse.json({ items: [] });
    return NextResponse.json({ week: out.row.week_start, level: out.row.level, items: await viewSet(sb, s.account, out.row) });
  } catch (e) {
    console.error('[stretch] build failed:', (e as Error).message);
    return NextResponse.json({ error: 'Could not load this week’s set — try again in a minute.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const s = await student(req);
  if (s.error) return s.error;
  const parsed = parseResponse(await req.json().catch(() => null));
  if (!parsed) return NextResponse.json({ error: 'Nothing to save' }, { status: 400 });
  const sb = createServiceClient();
  const row = await loadSet(sb, portalIdentity(s.account), thisWeek());
  if (!row || !row.items.some(i => i.slot === parsed.slot)) return NextResponse.json({ error: 'Not in this week’s set' }, { status: 404 });
  const next = mergeResponse(row.responses?.[parsed.slot], parsed.patch);
  try { await saveResponse(sb, row, parsed.slot, next); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
  return NextResponse.json({ ok: true, response: next });
}
