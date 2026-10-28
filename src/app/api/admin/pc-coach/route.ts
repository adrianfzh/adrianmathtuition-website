// /api/admin/pc-coach — the P&C coach's try-it door (SPEC-SELF-LEARNING.md §4c). Admin only.
//   GET  ?bank=1                 → JC P&C bank questions (stem + parts) to pick from
//   POST { question | spec, typed?, theirSpec? }
//        → the spec (read from the words by one model call when no spec is sent), the exact
//          count, the checked method + its picture, and "where did I count wrong" for `typed`.
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';
import { count, type PcSpec } from '@/lib/pc-count';
import { explain } from '@/lib/pc-explain';
import { pcPicture } from '@/lib/pc-picture';
import { readPcQuestion } from '@/lib/pc-read';
import { whereWrong, whereWrongLines } from '@/lib/pc-wrong';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  const { data, error } = await getSupabaseAdmin().from('questions')
    .select('id, level, school, year, question_number, question_text, answer, parts')
    .like('level', 'JC%').contains('topics', ['Permutations and Combinations']).is('deleted_at', null)
    .order('year', { ascending: false }).limit(80);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = (data ?? []).map((q: Record<string, unknown>) => ({
    id: q.id, where: `${q.school ?? ''} ${q.year ?? ''} Q${q.question_number ?? ''}`.trim(),
    stem: String(q.question_text ?? ''),
    parts: Array.isArray(q.parts) ? (q.parts as Record<string, unknown>[]).map(p => ({ label: String(p.label ?? ''), text: String(p.text ?? ''), answer: String(p.answer ?? '') })) : [],
    answer: String(q.answer ?? ''),
  })).filter(r => r.stem || r.parts.length);
  return NextResponse.json({ rows });
}

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  let spec: PcSpec | null = body.spec && typeof body.spec === 'object' ? body.spec : null;
  let read: { model: string; cost: number; error?: string } | null = null;
  if (!spec) {
    const text = String(body.question ?? '').trim();
    if (!text) return NextResponse.json({ error: 'Type a question.' }, { status: 400 });
    try {
      const r = await readPcQuestion(text);
      read = { model: r.model, cost: r.cost, ...(r.error ? { error: r.error } : {}) };
      spec = r.spec;
    } catch (e) {
      return NextResponse.json({ error: `Could not read the question: ${(e as Error).message}` }, { status: 502 });
    }
    if (!spec) return NextResponse.json({ read, error: read?.error ?? 'Could not read the question.' }, { status: 422 });
  }
  let exact, explained;
  try {
    exact = count(spec);
    explained = explain(spec);
  } catch (e) {
    return NextResponse.json({ spec, read, error: `The spec could not be counted: ${(e as Error).message}` }, { status: 422 });
  }
  const picture = explained.ok ? await pcPicture(explained.picture) : null;
  let where: { kind: string; lines: string[] } | null = null;
  const typed = String(body.typed ?? '').replace(/[\s,]/g, '');
  if (/^\d+$/.test(typed)) {
    const theirSpec = body.theirSpec && typeof body.theirSpec === 'object' ? body.theirSpec as PcSpec : undefined;
    const w = whereWrong(spec, Number(typed), theirSpec);
    where = { kind: w.kind, lines: w.kind === 'right' ? ['Right.'] : w.kind === 'cannot' ? [w.reason] : whereWrongLines(w) };
  }
  return NextResponse.json({ spec, read, exact, explained, picture, where });
}
