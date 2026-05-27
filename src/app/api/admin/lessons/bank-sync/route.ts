// GET /api/admin/lessons/bank-sync?level=AM[&topics=t1,t2][&since=ISO][&limit=800]
//
// Returns questions in (level, optionally topics-overlap) whose updated_at > since.
// Includes tombstoned rows (deleted_at IS NOT NULL) — the offline client uses the
// `deleted_at` field to drop them from its local cache.
//
// Response:
//   {
//     questions: BankQuestion[],   // active + tombstoned
//     cursor: string,              // max(updated_at) across returned rows — use as next `since`
//     hasMore: boolean,            // true if there are likely more rows past this page
//     serverNow: string            // ISO timestamp on the server — fallback cursor if no rows
//   }
//
// Cold-start: client passes since='' or omits it → full snapshot for that (level, topics) scope.
//
// Pagination strategy:
// We use `.range(0, limit-1)` instead of `.limit(n+1)`. The +1 trick fails when PostgREST's
// max-rows cap kicks in (Supabase default = 1000) — the cap silently shrinks `.limit(2001)` to
// 1000 rows and our "got more than limit" hasMore check never fires, so the client loop exits
// after one page. With explicit `.range()` and `hasMore = rows.length === limit`, this works
// reliably regardless of the PostgREST max-rows config.
//
// Default limit is 800 to stay well under typical Supabase max-rows caps (commonly 1000).

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';

const DEFAULT_LIMIT = 800;
const MAX_LIMIT = 1000;

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const level = searchParams.get('level');
  const topicsParam = (searchParams.get('topics') ?? '').trim();
  const since = (searchParams.get('since') ?? '').trim();
  const requested = Number(searchParams.get('limit') ?? DEFAULT_LIMIT);
  const limit = Math.max(1, Math.min(requested || DEFAULT_LIMIT, MAX_LIMIT));

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
    .order('id', { ascending: true })  // tiebreaker for rows with identical updated_at
    .range(0, limit - 1);

  if (topics.length > 0) q = q.overlaps('topics', topics);
  if (since) q = q.gt('updated_at', since);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = data ?? [];
  // If we received exactly `limit` rows, assume there's more on the server.
  // Worst case (exactly N*limit rows total) → one extra empty page request, harmless.
  const hasMore = rows.length === limit;
  const cursor = rows.length > 0
    ? (rows[rows.length - 1].updated_at as string)
    : (since || new Date().toISOString());

  return NextResponse.json({
    questions: rows,
    cursor,
    hasMore,
    serverNow: new Date().toISOString(),
    fetched: rows.length,
  });
}
