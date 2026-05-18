// Bank panel data source. GET filtered question-bank questions plus per-question
// "used in N cards" counts so the editor can show usage badges and warn on reuse.
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';

type SubgroupRow = { is_primary: boolean; subgroups: { id: number; name: string } | { id: number; name: string }[] | null };

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const level = searchParams.get('level');
  const topic = searchParams.get('topic');
  const subgroupId = searchParams.get('subgroupId');
  const search = (searchParams.get('search') ?? '').trim();
  const hasImage = searchParams.get('hasImage'); // 'true' | 'false' | null
  const difficultyCsv = searchParams.get('difficulty') ?? ''; // e.g. "Standard,Advanced"
  const limit = Math.min(Number(searchParams.get('limit') ?? 100), 500);
  const offset = Number(searchParams.get('offset') ?? 0);

  if (!level || !topic) {
    return NextResponse.json({ error: 'level and topic required' }, { status: 400 });
  }

  const supa = getSupabaseAdmin();

  // 1. If subgroupId is set, prefer fetching via question_subgroups join (more accurate)
  //    Otherwise fetch by level + topic (loose match — questions.topics is text[])
  let qQuery = supa
    .from('questions')
    .select(
      'id, school, year, paper, question_number, question_text, parts, answer, solution, solution_images, topics, total_marks, has_image, image_url, images, difficulty, source_file',
      { count: 'exact' },
    )
    .eq('level', level)
    .contains('topics', [topic])
    .order('school', { ascending: true })
    .order('year', { ascending: false })
    .order('paper', { ascending: true })
    .order('question_number', { ascending: true })
    .range(offset, offset + limit - 1);

  if (hasImage === 'true') qQuery = qQuery.eq('has_image', true);
  if (hasImage === 'false') qQuery = qQuery.eq('has_image', false);

  const difficulties = difficultyCsv ? difficultyCsv.split(',').map((s) => s.trim()).filter(Boolean) : [];
  if (difficulties.length > 0) qQuery = qQuery.in('difficulty', difficulties);

  if (search) {
    // simple ILIKE on question_text — adequate for now
    qQuery = qQuery.ilike('question_text', `%${search}%`);
  }

  // If subgroupId is set, we further intersect with question_subgroups
  let subgroupQuestionIds: Set<string> | null = null;
  if (subgroupId) {
    const { data: links, error: linkErr } = await supa
      .from('question_subgroups')
      .select('question_id')
      .eq('subgroup_id', Number(subgroupId));
    if (linkErr) return NextResponse.json({ error: linkErr.message }, { status: 500 });
    subgroupQuestionIds = new Set((links ?? []).map((r: { question_id: string }) => r.question_id));
    if (subgroupQuestionIds.size === 0) {
      return NextResponse.json({ questions: [], total: 0 });
    }
    qQuery = qQuery.in('id', Array.from(subgroupQuestionIds));
  }

  const { data: questions, error: qErr, count } = await qQuery;
  if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 });

  const qList = questions ?? [];
  if (qList.length === 0) {
    return NextResponse.json({ questions: [], total: count ?? 0 });
  }

  // 2. Lookup usage counts via the bulk function
  const qIds = qList.map((q) => q.id);
  const { data: usage, error: useErr } = await supa.rpc('question_card_usage_counts', { q_ids: qIds });
  if (useErr) {
    // Non-fatal — just return without counts
    console.error('usage count error', useErr);
  }
  const usageById: Record<string, number> = {};
  for (const u of (usage ?? []) as Array<{ question_id: string; usage_count: number }>) {
    usageById[u.question_id] = u.usage_count;
  }

  // 3. Lookup sub-group memberships for display (which sub-groups each question is in)
  const { data: sgLinks } = await supa
    .from('question_subgroups')
    .select('question_id, is_primary, subgroups(id, name)')
    .in('question_id', qIds);
  const sgByQ: Record<string, { id: number; name: string; isPrimary: boolean }[]> = {};
  for (const link of (sgLinks ?? []) as unknown as Array<{ question_id: string } & SubgroupRow>) {
    const sg = Array.isArray(link.subgroups) ? link.subgroups[0] : link.subgroups;
    if (!sg) continue;
    if (!sgByQ[link.question_id]) sgByQ[link.question_id] = [];
    sgByQ[link.question_id].push({ id: sg.id, name: sg.name, isPrimary: link.is_primary });
  }

  const out = qList.map((q) => ({
    ...q,
    usage_count: usageById[q.id] ?? 0,
    subgroup_links: sgByQ[q.id] ?? [],
  }));

  return NextResponse.json({ questions: out, total: count ?? out.length });
}
