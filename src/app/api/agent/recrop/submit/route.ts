// POST /api/agent/recrop/submit  { path, check: {ok, lost, leftover}, fitness?: {verdict, severity, reason} }
// What the two looks found (7 Oct 2026, lib/recrop-door.ts). The server decides the figure's
// fate by the same rule as the batch (lib/figure-recrop outcomeOf / finalOf) and writes the
// row. A failed second look on the FIRST cut answers `again` with the correction to give the
// judge; on the second it is final. Nothing here releases anything — a figure that passes is
// 'would-release' and waits for Adrian on /admin/figures-bank?kind=recrop.
import { NextRequest, NextResponse } from 'next/server';
import { recropDoor, sci, stampRecrop } from '@/lib/recrop-door';
import { parseRecropCheck, outcomeOf, parseFitness, finalOf, correctionNote, recropPrompt, type RecropVerdict } from '@/lib/figure-recrop';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let body: { path?: unknown; check?: unknown; fitness?: unknown };
  try { body = await req.json(); } catch { body = {}; }
  const path = typeof body.path === 'string' ? body.path : '';
  const denied = await recropDoor(req, 'submit', { path });
  if (denied) return denied;
  if (!path || !body.check || typeof body.check !== 'object') return NextResponse.json({ error: 'path and check required' }, { status: 400 });
  try {
    const db = sci();
    const { data: row } = await db.from('figure_recrops').select('path, question_id, final, decision, attempts, judge, new_path, kept_share').eq('path', path).maybeSingle();
    if (!row) return NextResponse.json({ error: 'not handed out — fetch it from the queue first' }, { status: 404 });
    if (row.decision || row.final !== 'working') return NextResponse.json({ error: `this figure is already finished (${row.final})` }, { status: 409 });
    if (!row.judge || !row.new_path) return NextResponse.json({ error: 'no cut yet — call cut first' }, { status: 409 });
    const verdict = row.judge as RecropVerdict;
    const check = parseRecropCheck(JSON.stringify(body.check));
    const o = outcomeOf(verdict, check, Number(row.kept_share ?? 0));
    if (o.outcome === 'failed-check' && (row.attempts as number) < 2) {
      const { data: flag } = await db.from('figure_flags').select('note').eq('path', path).eq('question_id', row.question_id as string).maybeSingle();
      const { data: q } = await db.from('questions').select('question_text').eq('id', row.question_id as string).maybeSingle();
      return NextResponse.json({ done: false, again: true, why: check.note, judge_prompt: `${recropPrompt(String(q?.question_text ?? ''), flag?.note as string | null)}\n\n${correctionNote(verdict, check)}` });
    }
    if (o.outcome === 'recrop' && (!body.fitness || typeof body.fitness !== 'object')) return NextResponse.json({ error: 'the second look passed — send the fitness verdict too' }, { status: 400 });
    const fitness = o.outcome === 'recrop' ? parseFitness(body.fitness) : null;
    const final = finalOf(o.outcome, fitness);
    const { error } = await db.from('figure_recrops').update({
      outcome: o.outcome, final, why: o.why.slice(0, 1500), fitness, new_path: o.outcome === 'recrop' ? row.new_path : null, judged_at: new Date().toISOString(),
    }).eq('path', path);
    if (error) throw new Error(error.message);
    await stampRecrop(true, `${final} · ${path}`, { path, final });
    return NextResponse.json({ done: true, final, why: o.why });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
