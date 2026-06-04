// GET /api/admin/lessons/bank?level=AM&topics=topic1,topic2&q=...&hasImage=...&difficulty=...
// Returns question bank rows filtered to the lesson's topics, in the same shape as the
// edit-cards bank endpoint so the polished BankPanel can be re-used.
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const level = searchParams.get('level');
  const topicsParam = searchParams.get('topics') ?? '';
  const search = (searchParams.get('q') ?? searchParams.get('search') ?? '').trim();
  const hasImage = searchParams.get('hasImage'); // 'true' | 'false' | null
  const difficultyCsv = searchParams.get('difficulty') ?? '';
  const exam = (searchParams.get('exam') ?? '').trim(); // Promo | MY | Prelim | '' (JC only)
  const limit = Math.min(Number(searchParams.get('limit') ?? 100), 500);
  const offset = Number(searchParams.get('offset') ?? 0);

  if (!level || !topicsParam) return NextResponse.json({ error: 'level and topics required' }, { status: 400 });
  const topics = topicsParam.split(',').map(s => s.trim()).filter(Boolean);
  if (topics.length === 0) return NextResponse.json({ questions: [], total: 0 });

  // JC was split into JC1/JC2 (Promo/MY=JC1, Prelim=JC2) + a few legacy 'JC' rows. A JC lesson
  // should see the whole family; non-JC levels match exactly.
  const JC_FAMILY = ['JC', 'JC1', 'JC2'];
  const isJC = JC_FAMILY.includes(level);

  const supa = getSupabaseAdmin();

  // questions.topics is text[] — match any question whose topics array overlaps with the lesson's topics.
  let qQuery = supa
    .from('questions')
    .select(
      'id, school, year, paper, question_number, question_text, parts, answer, solution, solution_images, topics, total_marks, has_image, image_url, images, difficulty, source_file, exam_type',
      { count: 'exact' },
    )
    .overlaps('topics', topics);
  qQuery = isJC ? qQuery.in('level', JC_FAMILY) : qQuery.eq('level', level);
  if (isJC && exam) qQuery = qQuery.eq('exam_type', exam);
  qQuery = qQuery
    .order('school', { ascending: true })
    .order('year', { ascending: false })
    .order('paper', { ascending: true })
    .order('question_number', { ascending: true })
    .range(offset, offset + limit - 1);

  if (hasImage === 'true') qQuery = qQuery.eq('has_image', true);
  if (hasImage === 'false') qQuery = qQuery.eq('has_image', false);

  const difficulties = difficultyCsv ? difficultyCsv.split(',').map(s => s.trim()).filter(Boolean) : [];
  if (difficulties.length > 0) qQuery = qQuery.in('difficulty', difficulties);

  // Search matches question text OR school OR source filename (so you can search by school).
  if (search) {
    const esc = search.replace(/[%,()]/g, ' ');
    qQuery = qQuery.or(`question_text.ilike.%${esc}%,school.ilike.%${esc}%,source_file.ilike.%${esc}%`);
  }

  const { data: questions, error, count } = await qQuery;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const qList = questions ?? [];
  if (qList.length === 0) return NextResponse.json({ questions: [], total: count ?? 0 });

  // Best-effort usage counts via the bulk function used by edit-cards. If the RPC isn't available
  // here we just return 0 — the bank panel treats usage_count as optional.
  let usageById: Record<string, number> = {};
  try {
    const qIds = qList.map(q => q.id);
    const { data: usage } = await supa.rpc('question_card_usage_counts', { q_ids: qIds });
    for (const u of (usage ?? []) as Array<{ question_id: string; usage_count: number }>) {
      usageById[u.question_id] = u.usage_count;
    }
  } catch { usageById = {}; }

  const out = qList.map(q => ({
    ...q,
    usage_count: usageById[q.id] ?? 0,
    subgroup_links: [],
  }));

  return NextResponse.json({ questions: out, total: count ?? out.length });
}
