// POST /api/admin/regression-case — one-tap capture from Bot Analytics.
// Saves a confirmed-bad answer + Adrian's one-line expectation into the
// regression_cases table (math Supabase). The bot repo's
// scripts/regression-eval.js replays every active case as a permanent eval.
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { createServiceClient } from '@/lib/supabase-server';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const b = await req.json().catch(() => ({} as Record<string, unknown>));
  const expected = String(b.expected || '').trim();
  const questionText = String(b.questionText || '').trim();
  if (!expected || !questionText) {
    return NextResponse.json({ error: 'expected and questionText are required' }, { status: 400 });
  }
  // 'answer' = short, mathy, no directive verbs → the runner checks it
  // deterministically (equivalence). Anything else is an LLM-judged rubric.
  const looksLikeAnswer = expected.length <= 40
    && /[0-9=√^/.+-]/.test(expected)
    && !/\b(should|must|never|always|explain|describe|give|not|answer)\b/i.test(expected);
  const kind = looksLikeAnswer ? 'answer' : 'rubric';

  const sb = createServiceClient();
  const { error } = await sb.from('regression_cases').insert({
    source: 'analytics-tap',
    source_question_id: b.sourceQuestionId || null,
    channel: b.channel || null,
    question_text: questionText,
    image_url: b.imageUrl || null,
    level: b.level || null,
    topic: b.topic || null,
    expected,
    expected_kind: kind,
    bad_answer: String(b.badAnswer || '').slice(0, 4000),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, kind });
}
