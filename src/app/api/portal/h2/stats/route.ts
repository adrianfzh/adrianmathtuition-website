// /api/portal/h2/stats — ✍️ the statistics write-up trainer (SPEC-H2-TOOLS.md, 5 Oct 2026).
//
//   GET ?kind=<kind>      → { items: [{ id, kind, context, task, points }] }   no scheme, no model answer
//   POST { id, answer }   → { results, line, modelAnswer, capped }
//        each checklist point ✓/✗ with "the scheme says" / "you wrote". A substring rule
//        first (free); only the points it missed go to a cheap model, at most
//        DAILY_STATS_MODEL_CAP calls a student a day — past the cap the rule's verdict stands.
//
// Anonymous → 401 (the health-check probes it). Door: h2ToolOpen('stats').
import { NextRequest, NextResponse } from 'next/server';
import { sessionAccount, portalIdentity } from '@/lib/portal-auth';
import { h2ToolOpen, viewingAsStudent } from '@/lib/portal-beta';
import { isNotesAuthed } from '@/lib/notes-auth';
import { STATS_ANSWER_MAX, checklistLine, parseStatsKind } from '@/lib/h2-tools';
import { checkWriteup, loadStatsItem, loadStatsItems, logAttempt } from '@/lib/h2-tools-store';

export const dynamic = 'force-dynamic';
const UUID = /^[0-9a-f-]{36}$/i;

async function who(): Promise<{ identity: string; account: Awaited<ReturnType<typeof sessionAccount>> } | null> {
  const account = await sessionAccount().catch(() => null);
  if (account) return { identity: portalIdentity(account), account };
  if (!(await viewingAsStudent()) && (await isNotesAuthed())) return { identity: 'admin', account: null };
  return null;
}

export async function GET(req: NextRequest) {
  const w = await who();
  if (!w) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  if (!(await h2ToolOpen('stats', w.account))) return NextResponse.json({ error: 'Not open yet.' }, { status: 403 });
  const items = await loadStatsItems(parseStatsKind(req.nextUrl.searchParams.get('kind')));
  return NextResponse.json({ items: items.map(i => ({ id: i.id, kind: i.kind, context: i.context, task: i.task, points: i.elements.length })) });
}

export async function POST(req: NextRequest) {
  const w = await who();
  if (!w) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  if (!(await h2ToolOpen('stats', w.account))) return NextResponse.json({ error: 'Not open yet.' }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { id?: unknown; answer?: unknown };
  const id = String(body.id ?? '');
  const answer = String(body.answer ?? '').trim().slice(0, STATS_ANSWER_MAX);
  if (!UUID.test(id)) return NextResponse.json({ error: 'bad request' }, { status: 400 });
  if (answer.length < 3) return NextResponse.json({ error: 'Write your answer first.' }, { status: 400 });
  const item = await loadStatsItem(id);
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { results, usedModel, capped } = await checkWriteup(item, answer, w.identity);
  const correct = results.every(r => r.ok);
  await logAttempt({ identity: w.identity, tool: 'stats', itemId: id, answer, correct, usedModel, result: { results: results.map(r => ({ id: r.id, ok: r.ok, how: r.how })) } });
  return NextResponse.json({ results, line: checklistLine(results), modelAnswer: item.model_answer, capped });
}
