import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { practiceAuth, levelAllowed, qbLevelsFor, ALL_QB_LEVELS } from '@/lib/practice';

export const runtime = 'nodejs';

type TopicRow = {
  topic: string;
  questionCount: number;
  attempts: number;
  mastery: number | null;
  status: 'strong' | 'practising' | 'weak' | 'new';
  lastPracticedAt: string | null;
};

function statusFor(attempts: number, mastery: number | null): TopicRow['status'] {
  if (attempts === 0 || mastery == null) return 'new';
  if (mastery >= 75) return 'strong';
  if (mastery >= 40) return 'practising';
  return 'weak';
}

// GET /api/portal/practice/overview?level=AM
// Everything the progress-aware picker needs in one call: the scoped level list,
// per-topic question counts + the caller's mastery, and (students only) up to 3
// deterministic recommendations. Auth: portal student session (level-gated) OR
// admin Bearer (testing — all levels, no mastery).
export async function GET(req: NextRequest) {
  const caller = await practiceAuth(req);
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const isStudent = caller.kind === 'student';
  const levels = isStudent
    ? qbLevelsFor(caller.account.level, caller.account.subjects)
    : ALL_QB_LEVELS;

  const url = new URL(req.url);
  const activeLevel = url.searchParams.get('level') || levels[0]?.key;
  if (!activeLevel) return NextResponse.json({ error: 'level required' }, { status: 400 });
  if (!levelAllowed(caller, activeLevel)) {
    return NextResponse.json({ error: 'Level not available' }, { status: 403 });
  }

  const supabase = getSupabaseAdmin();

  // Admin (testing): authoritative topic list + counts, no per-student mastery.
  if (!isStudent) {
    const { data, error } = await supabase.rpc('practice_topics', { p_level: activeLevel });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const topics: TopicRow[] = (data || []).map((t: { topic: string; n: number }) => ({
      topic: t.topic,
      questionCount: Number(t.n) || 0,
      attempts: 0,
      mastery: null,
      status: 'new' as const,
      lastPracticedAt: null,
    }));
    return NextResponse.json({ levels, activeLevel, topics, recommended: [] });
  }

  // Student: topic list joined with their own attempts → mastery + status.
  // If subjects were never captured (older accounts), scoping silently falls
  // back to level-only via qbLevelsFor above — the overview still resolves.
  const { data, error } = await supabase.rpc('practice_overview', {
    p_user: caller.account.id,
    p_level: activeLevel,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const topics: TopicRow[] = (data || []).map((r: {
    topic: string;
    question_count: number;
    attempts: number;
    avg_mastery: number | null;
    last_practiced_at: string | null;
  }) => {
    const attempts = Number(r.attempts) || 0;
    const mastery = r.avg_mastery != null ? Math.round(Number(r.avg_mastery)) : null;
    return {
      topic: r.topic,
      questionCount: Number(r.question_count) || 0,
      attempts,
      mastery,
      status: statusFor(attempts, mastery),
      lastPracticedAt: r.last_practiced_at,
    };
  });

  // Recommendations (deterministic, no AI): weakest attempted topics first
  // (lowest mastery), then fill from not-yet-started topics in list order.
  const recommended: { topic: string; level: string; reason: string }[] = [];
  const weak = topics
    .filter(t => t.attempts > 0 && t.mastery != null && t.mastery < 75)
    .sort((a, b) => (a.mastery! - b.mastery!) || a.topic.localeCompare(b.topic));
  for (const t of weak) {
    if (recommended.length >= 3) break;
    recommended.push({
      topic: t.topic,
      level: activeLevel,
      reason: t.mastery! < 40 ? 'You keep slipping here' : 'Almost there — keep practising',
    });
  }
  for (const t of topics.filter(t => t.attempts === 0)) {
    if (recommended.length >= 3) break;
    recommended.push({ topic: t.topic, level: activeLevel, reason: 'New topic — start here' });
  }

  return NextResponse.json({ levels, activeLevel, topics, recommended });
}
