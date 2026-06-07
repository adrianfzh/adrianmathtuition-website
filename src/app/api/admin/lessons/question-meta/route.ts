// GET /api/admin/lessons/question-meta?ids=uuid1,uuid2 — lightweight source metadata for bank
// questions (used by the DOCX export to print [year/level/exam/school/paper/Qn] source tags).
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const ids = (new URL(req.url).searchParams.get('ids') ?? '')
    .split(',').map(s => s.trim()).filter(Boolean).slice(0, 500);
  if (ids.length === 0) return NextResponse.json({ questions: [] });
  const { data, error } = await getSupabaseAdmin()
    .from('questions')
    .select('id, school, year, paper, question_number, level, exam_type')
    .in('id', ids);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ questions: data ?? [] });
}
