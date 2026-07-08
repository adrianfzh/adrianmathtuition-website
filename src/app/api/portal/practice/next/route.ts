import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { questionMarkdown } from '@/lib/bank-question-markdown';
import { practiceAuth, levelAllowed } from '@/lib/practice';

export const runtime = 'nodejs';

// POST /api/portal/practice/next  { level, topic, exclude?: string[] }
// Serves one random unseen real question (stem + parts, NO solution) from the
// topic's subgroups. `question: null` means the bank is exhausted for that filter.
// Auth: portal student session (level-gated) OR admin Bearer (testing).
export async function POST(req: NextRequest) {
  const caller = await practiceAuth(req);
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const { level, topic, exclude } = body as { level?: string; topic?: string; exclude?: string[] };
  if (!level || !topic) return NextResponse.json({ error: 'level and topic required' }, { status: 400 });
  if (!levelAllowed(caller, level)) return NextResponse.json({ error: 'Level not available' }, { status: 403 });

  const { data, error } = await getSupabaseAdmin().rpc('practice_next', {
    p_level: level,
    p_topic: topic,
    p_exclude: Array.isArray(exclude) ? exclude : [],
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const q = data?.[0];
  if (!q) return NextResponse.json({ question: null });

  // Deliberately NOT exposing the originating school/paper to students —
  // the portal shows the question and marks only.
  return NextResponse.json({
    question: {
      id: q.id,
      markdown: questionMarkdown(q),
      marks: q.total_marks ?? null,
      source: null,
      hasSolution: !!q.has_solution,
    },
  });
}
