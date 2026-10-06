// GET /api/agent/recrop/queue?n=5 — the next science figures to re-crop (7 Oct 2026,
// lib/recrop-door.ts). Each comes with the typed question, what the sweep said, the judge's
// brief, and where to fetch the picture (plain, and with the 0–1000 grid drawn on it).
// Handing a figure out writes a `figure_recrops` row marked 'working', so two sessions never
// take the same one; a row left 'working' for 90 minutes is handed out again.
import { NextRequest, NextResponse } from 'next/server';
import { recropDoor, sci, WORKING_STALE_MS, CLOUD_BATCH } from '@/lib/recrop-door';
import { isRecropCandidate, recropPrompt } from '@/lib/figure-recrop';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const n = Math.min(Math.max(Number(req.nextUrl.searchParams.get('n')) || 5, 1), 12);
  const denied = await recropDoor(req, 'queue', { n });
  if (denied) return denied;
  try {
    const db = sci();
    const flags: { path: string; question_id: string; note: string | null }[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db.from('figure_flags').select('path, question_id, note').eq('kind', 'question').eq('status', 'held').order('path').range(from, from + 999);
      if (error) throw new Error(error.message);
      flags.push(...((data ?? []) as typeof flags));
      if (!data || data.length < 1000) break;
    }
    const taken = new Map<string, { final: string; judged_at: string }>();
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db.from('figure_recrops').select('path, final, judged_at').order('path').range(from, from + 999);
      if (error) throw new Error(error.message);
      for (const r of data ?? []) taken.set(r.path as string, { final: r.final as string, judged_at: r.judged_at as string });
      if (!data || data.length < 1000) break;
    }
    const stale = (t: { final: string; judged_at: string } | undefined) => !!t && t.final === 'working' && Date.now() - Date.parse(t.judged_at) > WORKING_STALE_MS;
    const open = flags.filter((f) => isRecropCandidate(f.note) && (!taken.has(f.path) || stale(taken.get(f.path))));
    const pick = open.slice(0, n);
    if (pick.length) {
      const { error } = await db.from('figure_recrops').upsert(pick.map((f) => ({
        path: f.path, question_id: f.question_id, outcome: 'working', final: 'working', batch: CLOUD_BATCH(),
        judged_at: new Date().toISOString(), attempts: 0, judge: null, new_path: null, why: null, fitness: null,
      })));
      if (error) throw new Error(error.message);
    }
    const qids = [...new Set(pick.map((f) => f.question_id))];
    const stems = new Map<string, string>();
    if (qids.length) {
      const { data } = await db.from('questions').select('id, question_text').in('id', qids);
      for (const q of data ?? []) stems.set(q.id as string, String(q.question_text ?? ''));
    }
    const img = (p: string, view: string) => `/api/agent/recrop/image?path=${encodeURIComponent(p)}&view=${view}`;
    return NextResponse.json({
      left: open.length - pick.length,
      items: pick.map((f) => ({
        path: f.path, note: f.note, stem: (stems.get(f.question_id) ?? '').slice(0, 900),
        original: img(f.path, 'orig'), grid: img(f.path, 'grid'),
        judge_prompt: recropPrompt(stems.get(f.question_id) ?? '', f.note),
      })),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
