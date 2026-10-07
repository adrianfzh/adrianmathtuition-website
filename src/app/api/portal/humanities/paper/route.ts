// /api/portal/humanities/paper — hand in a timed paper (SPEC-HUMANITIES.md §A4, 7 Oct 2026).
//
//   POST { caseStudyId, structuredId, answers: { <questionId>: text }, minutes } → { paperId, handedIn }
//
// Each answered part goes through the one door (lib/humanities-submit) as its own
// humanities_runs row; the rows share a paper_id. A blank part is simply not handed in.
// Anonymous → 401 (the health-check probes this). The door is humanitiesOpen().
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { sessionAccount, portalIdentity } from '@/lib/portal-auth';
import { humanitiesOpen } from '@/lib/portal-beta';
import { getSupabaseAdmin } from '@/lib/supabase';
import { countHumanitiesToday } from '@/lib/humanities-runs';
import { submitHumanities, DAILY_HUMANITIES_CAP, MIN_WORDS } from '@/lib/humanities-submit';
import { paperFor } from '@/lib/humanities-paper';
import { wordCount } from '@/lib/humanities-report';
import { sgtDayStartISO } from '@/lib/sgt';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const account = await sessionAccount();
  if (!account) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  if (!(await humanitiesOpen())) return NextResponse.json({ error: 'Humanities feedback is not open yet.' }, { status: 403 });
  const sid = portalIdentity(account);

  const body = await req.json().catch(() => ({})) as { caseStudyId?: unknown; structuredId?: unknown; answers?: unknown; minutes?: unknown };
  const paper = paperFor(String(body.caseStudyId ?? ''), String(body.structuredId ?? ''));
  if (!paper) return NextResponse.json({ error: 'That paper is not in the bank.' }, { status: 400 });
  const given = (body.answers && typeof body.answers === 'object' ? body.answers : {}) as Record<string, unknown>;
  const todo = paper.parts
    .map(p => ({ part: p, answer: String(given[p.question.id] ?? '').trim() }))
    .filter(x => wordCount(x.answer) >= MIN_WORDS);
  if (!todo.length) return NextResponse.json({ error: 'Write at least one answer first.' }, { status: 400 });

  const used = await countHumanitiesToday(sid, sgtDayStartISO());
  if (used + todo.length > DAILY_HUMANITIES_CAP) {
    return NextResponse.json({ error: `You have handed in ${used} answers today — this paper goes in tomorrow. Your answers are kept on this device.` }, { status: 429 });
  }

  const paperId = randomUUID();
  const minutes = Math.max(0, Math.min(600, Math.round(Number(body.minutes) || 0)));
  const outs = await Promise.all(todo.map(x => submitHumanities({
    identity: sid, studentName: account.display_name, questionId: x.part.question.id, answer: x.answer,
    source: 'app', paperId, paperMinutes: minutes,
  })));
  const ok = outs.filter(o => o.ok).length;
  // A part over the word limit (or a reader that did not pick up) is refused on its own; the rest still go in.
  const refused = outs.map((o, i) => (o.ok ? null : `Question ${todo[i].part.label}: ${o.error}`)).filter(Boolean);
  if (!ok) return NextResponse.json({ error: refused[0] ?? 'Could not hand in.' }, { status: 400 });

  const sb = getSupabaseAdmin();
  await sb.from('portal_event_log').insert({ identity: sid, kind: 'humanities:paper', detail: { paperId, caseStudyId: paper.caseStudy.id, structuredId: paper.structured.id, handedIn: ok, minutes } }).then(() => {});
  return NextResponse.json({ paperId, handedIn: ok, refused });
}
