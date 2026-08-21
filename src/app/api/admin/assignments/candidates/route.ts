// GET /api/admin/assignments/candidates?level=AM&topic=Differentiation&tier=Advanced&limit=12
// Up to N bank questions (stem + parts, no solution) for the Send-work picker.
// Same quality filters as practice_next (RPC practice_candidates), random order
// so reopening the picker shows different ones.
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';
import { questionMarkdown, questionStructured, type BankQuestion } from '@/lib/bank-question-markdown';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const sp = new URL(req.url).searchParams;
  const level = sp.get('level') || '';
  const topic = sp.get('topic') || '';
  const tierRaw = sp.get('tier');
  const tier = tierRaw === 'Standard' || tierRaw === 'Advanced' ? tierRaw : null;
  const limit = Math.min(40, Math.max(1, Number(sp.get('limit')) || 12));
  if (!level || !topic) return NextResponse.json({ error: 'level and topic required' }, { status: 400 });

  const { data, error } = await getSupabaseAdmin().rpc('practice_candidates', {
    p_level: level, p_topic: topic, p_tier: tier, p_limit: limit,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  type Row = BankQuestion & {
    id: string; total_marks?: number | null; figure_url?: string | null; has_solution?: boolean | null;
    school?: string | null; year?: number | null; paper?: string | null; question_number?: string | null; difficulty?: string | null;
  };
  const questions = ((data || []) as Row[]).map((q) => {
    const { stem, parts } = questionStructured(q);
    const src = [q.school, q.year, q.paper, q.question_number ? `Q${q.question_number}` : null].filter(Boolean).join(' ');
    return {
      id: q.id,
      markdown: questionMarkdown(q),
      stem,
      parts,
      marks: q.total_marks ?? null,
      figureUrl: q.figure_url ?? null,
      difficulty: q.difficulty ?? null,
      // Adrian sees the source (he is choosing); the student never does.
      source: src || null,
      hasSolution: !!q.has_solution,
    };
  });
  return NextResponse.json({ questions });
}
