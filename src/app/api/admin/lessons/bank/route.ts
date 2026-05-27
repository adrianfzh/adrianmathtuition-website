// GET /api/admin/lessons/bank?level=AM&topics=topic1,topic2&kind=worked_example&q=...
// Returns question bank rows filtered to the lesson's topics, for the "Insert from bank" panel.
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const level = searchParams.get('level');
  const topicsParam = searchParams.get('topics') ?? '';
  const search = searchParams.get('q')?.trim();
  const limit = Math.min(Number(searchParams.get('limit') ?? 100), 500);

  if (!level || !topicsParam) return NextResponse.json({ error: 'level and topics required' }, { status: 400 });
  const topics = topicsParam.split(',').map(s => s.trim()).filter(Boolean);
  if (topics.length === 0) return NextResponse.json({ questions: [] });

  const supa = getSupabaseAdmin();
  let q = supa
    .from('questions')
    .select('id, school, year, paper, question_number, topic, difficulty, total_marks, embedding_text, image_url, images, has_image')
    .eq('level', level)
    .in('topic', topics)
    .order('school')
    .order('year', { ascending: false })
    .order('question_number')
    .limit(limit);

  if (search) q = q.ilike('embedding_text', `%${search}%`);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ questions: data ?? [] });
}
