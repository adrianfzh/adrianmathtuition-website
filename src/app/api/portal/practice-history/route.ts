// GET /api/portal/practice-history?limit=20 — the student's past graded attempts.
// Attempts read via the user-scoped client (RLS: own rows only); question stems
// attached via service role with answers/solutions stripped.
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer, createServiceClient } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const limit = Math.min(Number(new URL(req.url).searchParams.get('limit')) || 20, 50);
  const { data: attempts } = await supabase
    .from('student_attempts')
    .select('id, attempted_at, attempted_via, question_id, marking_verdict, marking_json')
    .eq('user_id', user.id)
    .order('attempted_at', { ascending: false })
    .limit(limit);

  const qIds = [...new Set((attempts || []).map(a => a.question_id).filter(Boolean))];
  const stems: Record<string, { text: string; topics: string[] }> = {};
  if (qIds.length) {
    const { data: qs } = await createServiceClient()
      .from('questions')
      .select('id, question_text, topics')
      .in('id', qIds);
    for (const q of qs || []) {
      stems[q.id] = { text: (q.question_text || '').slice(0, 160), topics: q.topics || [] };
    }
  }

  const items = (attempts || []).map(a => {
    const mj = (a.marking_json || {}) as Record<string, unknown>;
    return {
      id: a.id,
      attemptedAt: a.attempted_at,
      attemptedVia: a.attempted_via,
      verdict: a.marking_verdict || 'unmarked',
      score: typeof mj.score === 'number' ? mj.score : null,
      outOf: typeof mj.outOf === 'number' ? mj.outOf : null,
      topic: a.question_id ? (stems[a.question_id]?.topics?.[0] || null) : null,
      questionPreview: a.question_id ? (stems[a.question_id]?.text || null) : null,
    };
  });

  return NextResponse.json({ items });
}
