// GET /api/admin/lessons/bank-sync?level=AM[&topics=t1,t2][&since=ISO][&limit=2000]
//
// Returns questions in (level, optionally topics-overlap) whose updated_at > since.
// Includes tombstoned rows (deleted_at IS NOT NULL) — the offline client uses the
// `deleted_at` field to drop them from its local cache.
//
// Response:
//   {
//     questions: BankQuestion[],   // active + tombstoned, capped at `limit`
//     cursor: string,              // max(updated_at) across returned rows — use as next `since`
//     hasMore: boolean,            // true if `limit` was hit
//     serverNow: string            // ISO timestamp on the server — fallback cursor if no rows
//   }
//
// Cold-start: client passes since='' or omits it → full snapshot for that (level, topics) scope.

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const level = searchParams.get('level');
  const topicsParam = (searchParams.get('topics') ?? '').trim();
  const since = (searchParams.get('since') ?? '').trim();
  const limit = Math.min(Number(searchParams.get('limit') ?? 2000), 5000);

  if (!level) return NextResponse.json({ error: 'level required' }, { status: 400 });
  const topics = topicsParam ? topicsParam.split(',').map(s => s.trim()).filter(Boolean) : [];

  const supa = getSupabaseAdmin();
  let q = supa
    .from('questions')
    .select(
      'id, school, year, paper, question_number, question_text, parts, answer, solution, solution_images, topics, total_marks, has_image, image_url, images, difficulty, source_file, updated_at, deleted_at'
    )
    .eq('level', level)
    .order('updated_at', { ascending: true })
    .limit(limit + 1);

  if (topics.length > 0) q = q.overlaps('topics', topics);
  if (since) q = q.gt('updated_at', since);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const all = data ?? [];
  const hasMore = all.length > limit;
  const rows = hasMore ? all.slice(0, limit) : all;

  const cursor = rows.length > 0
    ? (rows[rows.length - 1].updated_at as string)
    : (since || new Date().toISOString());

  return NextResponse.json({
    questions: rows,
    cursor,
    hasMore,
    serverNow: new Date().toISOString(),
  });
}
