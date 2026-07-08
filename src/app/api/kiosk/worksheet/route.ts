// GET /api/kiosk/worksheet?level=&topic=&count=8&answers=1
// Build a random worksheet from the verified practice-question bank for a
// level+topic. Returns question text (+ marks, + optional answer) ONLY — never
// the worked solution or any originating school/paper metadata.
// Auth: valid kiosk device cookie OR admin. 401 otherwise.
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { verifyKioskAuth, KIOSK_LEVELS } from '@/lib/kiosk-session';

export const runtime = 'nodejs';

const MAX_COUNT = 20;
// Cap the pool we shuffle over — enough randomness without pulling the whole bank.
const POOL_CAP = 120;

// Fisher–Yates shuffle (unbiased) — randomisation happens in JS after fetching
// a capped verified pool, so the bank order can't be inferred.
function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export async function GET(req: NextRequest) {
  if (!verifyKioskAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const params = new URL(req.url).searchParams;
  const level = params.get('level') || '';
  const topic = (params.get('topic') || '').trim();
  const withAnswers = params.get('answers') === '1';
  const count = Math.min(MAX_COUNT, Math.max(1, parseInt(params.get('count') || '8', 10) || 8));

  const cfg = KIOSK_LEVELS[level];
  if (!cfg) return NextResponse.json({ error: 'level must be EM, AM or JC2' }, { status: 400 });
  if (!topic) return NextResponse.json({ error: 'topic required' }, { status: 400 });

  const { data, error } = await getSupabaseAdmin()
    .from('practice_questions')
    .select('id, question_text, marks, answer')
    .in('level', cfg.questionLevels)
    .eq('topic', topic)
    .eq('verified', true)
    .limit(POOL_CAP);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const picked = shuffle(data || []).slice(0, count);
  const questions = picked.map((r) => ({
    id: r.id as string,
    // practice_questions is flat — parts are already embedded in question_text.
    markdown: (r.question_text as string) ?? '',
    marks: (r.marks as number | null) ?? null,
    ...(withAnswers ? { answer: (r.answer as string | null) ?? null } : {}),
  }));

  return NextResponse.json({
    title: `${cfg.label} — ${topic}`,
    level,
    topic,
    questions,
  });
}
