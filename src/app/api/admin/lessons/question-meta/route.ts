// GET /api/admin/lessons/question-meta?ids=uuid1,uuid2 — lightweight source metadata for bank
// questions (used by the DOCX export to print [year/level/exam/school/paper/Qn] source tags).
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';

// Compile a single answer string from the top-level answer + per-part/subpart answers.
type AnswerPart = { label?: string; answer?: string; subparts?: Array<{ label?: string; answer?: string }> };
function compiledAnswer(answer: string | null, parts: unknown): string | null {
  const bits: string[] = [];
  if (answer && answer.trim()) bits.push(answer.trim());
  for (const p of (Array.isArray(parts) ? (parts as AnswerPart[]) : [])) {
    if (!p) continue;
    if (p.answer && p.answer.trim()) bits.push(`${p.label ? `(${p.label}) ` : ''}${p.answer.trim()}`);
    for (const sp of (Array.isArray(p.subparts) ? p.subparts : [])) {
      if (sp?.answer && sp.answer.trim()) bits.push(`(${p.label ?? ''})(${sp.label ?? ''}) ${sp.answer.trim()}`);
    }
  }
  return bits.length > 0 ? bits.join('  ') : null;
}

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const ids = (new URL(req.url).searchParams.get('ids') ?? '')
    .split(',').map(s => s.trim()).filter(Boolean).slice(0, 500);
  if (ids.length === 0) return NextResponse.json({ questions: [] });
  const { data, error } = await getSupabaseAdmin()
    .from('questions')
    .select('id, school, year, paper, question_number, level, exam_type, answer, parts')
    .in('id', ids);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const out = (data ?? []).map(q => ({
    id: q.id, school: q.school, year: q.year, paper: q.paper, question_number: q.question_number,
    level: q.level, exam_type: q.exam_type,
    answer: compiledAnswer(q.answer as string | null, q.parts),
  }));
  return NextResponse.json({ questions: out });
}
