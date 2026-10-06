// POST /api/agent/recrop/cut  { path, verdict: {keep, drop, school_mark, furniture, refuse} }
// The judge's boxes in, the new picture out (7 Oct 2026, lib/recrop-door.ts). The SERVER
// cuts (lib/figure-recrop-cut.ts — the same code as the batch script), stores the result
// beside the original as <name>__rc1.png, and answers with where to fetch it and the two
// briefs for the looks that follow (the second look, the fitness check). A verdict that
// refuses, or names a school mark, ends the figure here. At most two cuts a figure: the
// first, and one correction after a failed second look.
import { NextRequest, NextResponse } from 'next/server';
import { recropDoor, sci, fetchScienceObject, fitnessLaw, newNameFor, stampRecrop } from '@/lib/recrop-door';
import { parseRecropVerdict, outcomeOf, recropVerifyPrompt, fitnessPrompt } from '@/lib/figure-recrop';
import { cutFromVerdict, flatPng } from '@/lib/figure-recrop-cut';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  let body: { path?: unknown; verdict?: unknown };
  try { body = await req.json(); } catch { body = {}; }
  const path = typeof body.path === 'string' ? body.path : '';
  const denied = await recropDoor(req, 'cut', { path });
  if (denied) return denied;
  if (!path || !body.verdict || typeof body.verdict !== 'object') return NextResponse.json({ error: 'path and verdict required' }, { status: 400 });
  try {
    const db = sci();
    const { data: row } = await db.from('figure_recrops').select('path, question_id, final, decision, attempts').eq('path', path).maybeSingle();
    if (!row) return NextResponse.json({ error: 'not handed out — fetch it from the queue first' }, { status: 404 });
    if (row.decision || row.final !== 'working') return NextResponse.json({ error: `this figure is already finished (${row.final})` }, { status: 409 });
    if ((row.attempts as number) >= 2) return NextResponse.json({ error: 'two cuts already made — submit the second look' }, { status: 409 });
    const verdict = parseRecropVerdict(JSON.stringify(body.verdict));
    const finish = async (outcome: string, why: string) => {
      const { error } = await db.from('figure_recrops').update({ outcome, final: outcome, why: why.slice(0, 1500), judge: verdict, furniture: verdict.furniture, new_path: null, judged_at: new Date().toISOString() }).eq('path', path);
      if (error) throw new Error(error.message);
      await stampRecrop(true, `${outcome} · ${path}`, { path, outcome });
      return NextResponse.json({ done: true, final: outcome, why });
    };
    const early = outcomeOf(verdict, null, null);
    if (early.outcome === 'refused-school-mark' || early.outcome === 'refused') return finish(early.outcome, early.why);
    const src = await flatPng(await fetchScienceObject(path));
    const c = await cutFromVerdict(src, verdict);
    if (!c.plan || !c.crop) return finish('refused', 'the boxes kept nothing');
    if ((c.share ?? 0) > 0.97) return finish('refused', 'the cut would keep nearly the whole image — nothing to gain');
    const newPath = newNameFor(path);
    const up = await db.storage.from('question_images').upload(newPath, c.crop, { contentType: 'image/png', upsert: true });
    if (up.error) throw new Error(`upload: ${up.error.message}`);
    const { error } = await db.from('figure_recrops').update({
      judge: verdict, attempts: (row.attempts as number) + 1, new_path: newPath, plan: c.plan.mode,
      kept_share: Math.round((c.share ?? 0) * 100) / 100, furniture: verdict.furniture, judged_at: new Date().toISOString(),
    }).eq('path', path);
    if (error) throw new Error(error.message);
    const { data: q } = await db.from('questions').select('question_text, answer').eq('id', row.question_id as string).maybeSingle();
    const stem = String(q?.question_text ?? '');
    return NextResponse.json({
      done: false, new: `/api/agent/recrop/image?path=${encodeURIComponent(path)}&view=new`,
      kept_share: Math.round((c.share ?? 0) * 100) / 100, plan: c.plan.mode, sliced: c.sliced,
      verify_prompt: recropVerifyPrompt(stem), fitness_prompt: fitnessPrompt(await fitnessLaw(), stem, String(q?.answer ?? '')),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
