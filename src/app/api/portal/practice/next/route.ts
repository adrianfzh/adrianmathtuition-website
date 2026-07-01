import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { questionMarkdown } from '@/lib/bank-question-markdown';
import { verifyAdminAuth } from '@/lib/schedule-helpers';

export const runtime = 'nodejs';

// POST /api/portal/practice/next  { level, topic, exclude?: string[] }
// Serves one random unseen real question (stem + parts, NO solution) from the
// topic's subgroups. `question: null` means the bank is exhausted for that filter.
// Admin-only during testing (Bearer ADMIN_PASSWORD).
export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const { level, topic, exclude } = body as { level?: string; topic?: string; exclude?: string[] };
  if (!level || !topic) return NextResponse.json({ error: 'level and topic required' }, { status: 400 });

  const { data, error } = await getSupabaseAdmin().rpc('practice_next', {
    p_level: level,
    p_topic: topic,
    p_exclude: Array.isArray(exclude) ? exclude : [],
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const q = data?.[0];
  if (!q) return NextResponse.json({ question: null });

  const source = [q.school, q.year ? String(q.year) : null, q.paper ? `P${q.paper}` : null,
    q.question_number ? `Q${q.question_number}` : null].filter(Boolean).join(' ');

  return NextResponse.json({
    question: {
      id: q.id,
      markdown: questionMarkdown(q),
      marks: q.total_marks ?? null,
      source: source || null,
      hasSolution: !!q.has_solution,
    },
  });
}
