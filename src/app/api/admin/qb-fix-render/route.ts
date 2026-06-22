// One-time migration: scan the question bank for mechanical rendering defects and fix them
// (over-escaped commands, \\%, calculator funcs), verifying with KaTeX that no fix introduces
// a new render error. Also reports STRUCTURAL defects (flattened tables, extraction notes)
// that need source re-extraction — those are never auto-changed.
//
//   GET  ?offset=0&limit=1500   → dry-run: what WOULD change (no writes)
//   POST ?offset=0&limit=1500   → apply the verified fixes
//
// Batched by offset so each call stays under the serverless timeout; loop until nextOffset null.
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';
import { fixQuestion, structuralFlags, type QuestionFields } from '@/lib/qb-render-fixes';

export const runtime = 'nodejs';
export const maxDuration = 60;

type Row = QuestionFields & {
  id: string; school: string | null; year: number | null; paper: string | null; question_number: string | null;
};
const ref = (r: Row) => `${r.school ?? '?'} ${r.year ?? ''} P${r.paper ?? ''}Q${r.question_number ?? ''}`.trim();

async function run(req: NextRequest, write: boolean) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const url = new URL(req.url);
  const offset = Math.max(0, parseInt(url.searchParams.get('offset') ?? '0', 10) || 0);
  const limit = Math.min(2000, Math.max(1, parseInt(url.searchParams.get('limit') ?? '1500', 10) || 1500));

  const supa = getSupabaseAdmin();
  const { data, error } = await supa
    .from('questions')
    .select('id, school, year, paper, question_number, question_text, solution, answer, parts')
    .order('id', { ascending: true })
    .range(offset, offset + limit - 1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as Row[];
  const fixedRefs: string[] = [];
  const skippedWorse: string[] = [];
  const structural: Record<string, string[]> = {};
  let fixedCount = 0;

  for (const r of rows) {
    // Structural flags (report only).
    for (const f of structuralFlags(r)) (structural[f] ||= []).push(ref(r));

    const { next, changed, errBefore, errAfter } = fixQuestion(r);
    if (!changed) continue;
    if (errAfter > errBefore) { skippedWorse.push(ref(r)); continue; } // safety gate

    fixedCount++;
    fixedRefs.push(ref(r));
    if (write) {
      const { error: upErr } = await supa.from('questions').update({
        question_text: next.question_text,
        solution: next.solution,
        answer: next.answer,
        parts: next.parts,
      }).eq('id', r.id);
      if (upErr) return NextResponse.json({ error: `update ${r.id}: ${upErr.message}`, offset }, { status: 500 });
    }
  }

  const nextOffset = rows.length === limit ? offset + limit : null;
  return NextResponse.json({
    mode: write ? 'apply' : 'dry-run',
    scanned: rows.length,
    offset,
    nextOffset,
    fixed: fixedCount,
    fixedSample: fixedRefs.slice(0, 40),
    skippedWorse,                          // fixes that would have broken something — left untouched
    structural: Object.fromEntries(Object.entries(structural).map(([k, v]) => [k, { count: v.length, sample: v.slice(0, 40) }])),
  });
}

export async function GET(req: NextRequest) { return run(req, false); }
export async function POST(req: NextRequest) { return run(req, true); }
