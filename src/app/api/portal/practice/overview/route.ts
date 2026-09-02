import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { practiceAuth, practiceLevelAllowed, practiceLevelsFor, bankScope } from '@/lib/practice';
import { isScienceLevel, scienceSubjectOf } from '@/lib/science-levels';
import { scienceMasteryFor, scienceTopicCounts } from '@/lib/science-bank';

export const runtime = 'nodejs';

type TopicRow = {
  topic: string;
  questionCount: number;
  advancedCount: number;   // Advanced + Challenging rows — drives the Advanced tier picker
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
  const levels = await practiceLevelsFor(caller);

  const url = new URL(req.url);
  const activeLevel = url.searchParams.get('level') || levels[0]?.key;
  if (!activeLevel) return NextResponse.json({ error: 'level required' }, { status: 400 });
  if (!(await practiceLevelAllowed(caller, activeLevel))) {
    return NextResponse.json({ error: 'Level not available' }, { status: 403 });
  }

  // Science levels (2026-09-02): counts from the science bank, mastery from
  // the student's own science attempts (marking_json.science — the attempt
  // row can't reference a science question id, see lib/science-bank).
  if (isScienceLevel(activeLevel)) {
    try {
      const counts = await scienceTopicCounts(activeLevel);
      const subject = scienceSubjectOf(activeLevel)!;
      const mastery = isStudent ? await scienceMasteryFor(caller.account.id, subject) : new Map();
      const topics: TopicRow[] = counts.map(t => {
        const m = mastery.get(t.topic);
        const attempts = m?.attempts ?? 0;
        return {
          topic: t.topic,
          questionCount: t.n,
          advancedCount: t.advanced_count,
          attempts,
          mastery: m?.mastery ?? null,
          status: statusFor(attempts, m?.mastery ?? null),
          lastPracticedAt: m?.lastPracticedAt ?? null,
        };
      });
      const recommended = topics
        .filter(t => t.attempts > 0 && t.mastery != null && t.mastery < 75)
        .sort((a, b) => (a.mastery! - b.mastery!) || a.topic.localeCompare(b.topic))
        .slice(0, 3)
        .map(t => ({ topic: t.topic, level: activeLevel, reason: t.mastery! < 40 ? 'You keep slipping here' : 'Almost there — keep practising' }));
      return NextResponse.json({ levels, activeLevel, topics, recommended });
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
  }

  const supabase = getSupabaseAdmin();
  const scope = bankScope(activeLevel);

  // Admin (testing): authoritative topic list + counts, no per-student mastery.
  if (!isStudent) {
    const { data, error } = await supabase.rpc('practice_topics', { p_level: scope.level, p_qlevel: scope.qlevel });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const topics: TopicRow[] = (data || []).map((t: { topic: string; n: number; advanced_count: number }) => ({
      topic: t.topic,
      questionCount: Number(t.n) || 0,
      advancedCount: Number(t.advanced_count) || 0,
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
    p_level: scope.level,
    p_qlevel: scope.qlevel,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const topics: TopicRow[] = (data || []).map((r: {
    topic: string;
    question_count: number;
    advanced_count: number;
    attempts: number;
    avg_mastery: number | null;
    last_practiced_at: string | null;
  }) => {
    const attempts = Number(r.attempts) || 0;
    const mastery = r.avg_mastery != null ? Math.round(Number(r.avg_mastery)) : null;
    return {
      topic: r.topic,
      questionCount: Number(r.question_count) || 0,
      advancedCount: Number(r.advanced_count) || 0,
      attempts,
      mastery,
      status: statusFor(attempts, mastery),
      lastPracticedAt: r.last_practiced_at,
    };
  });

  // Recommendations (deterministic, no AI): weakest attempted topics only —
  // real evidence or nothing. The old "New topic — start here" padding made a
  // data-less student see a fake-personalised section that merely repeated the
  // first rows of the list below it (Adrian, 2026-08-29: "up for you next may
  // not serve much purpose?"). With no attempts the section now hides.
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

  return NextResponse.json({ levels, activeLevel, topics, recommended });
}
