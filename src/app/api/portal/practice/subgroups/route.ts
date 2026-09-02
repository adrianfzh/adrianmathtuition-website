import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { practiceAuth, practiceLevelAllowed, practiceLevelsFor, bankScope } from '@/lib/practice';
import { isScienceLevel } from '@/lib/science-levels';

export const runtime = 'nodejs';

// GET /api/portal/practice/subgroups?level=AM[&topic=Circles]
// The question-type layer under each topic (Supabase `subgroups`, e.g.
// Circles → "Tangent at a Point on the Circle"), with answerable-question
// counts. One call per level — the picker caches it and filters client-side,
// so opening a topic sheet costs no round trip. Same eligibility filter as
// practice_topics, but FILING-ONLY: the topic total (practice_topics /
// practice_overview, via the `practice_pool` RPC) also counts questions that
// are not filed in any sub-group yet but carry the topic as a `topics[]` tag,
// so the per-type counts can sum to LESS than the topic total. The "Start
// (mix)" draw serves the whole pool; a type pick serves only its filing.
// (2026-08-22 — see PORTAL.md "Practice pool".)
// Auth: portal student session (level-gated) OR admin Bearer (testing).
export async function GET(req: NextRequest) {
  const caller = await practiceAuth(req);
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const levels = caller.kind === 'student' ? await practiceLevelsFor(caller) : null;
  const level = url.searchParams.get('level') || levels?.[0]?.key;
  if (!level) return NextResponse.json({ error: 'level required' }, { status: 400 });
  if (!(await practiceLevelAllowed(caller, level))) return NextResponse.json({ error: 'Level not available' }, { status: 403 });
  // Science levels carry no question-type layer in the portal yet — the
  // sheet shows plain "Start" for the whole topic.
  if (isScienceLevel(level)) return NextResponse.json({ subgroups: [] });
  const topic = url.searchParams.get('topic') || null;

  const scope = bankScope(level);
  const { data, error } = await getSupabaseAdmin().rpc('practice_subgroups', {
    p_level: scope.level,
    p_topic: topic,
    p_qlevel: scope.qlevel,
  });
  if (error) return NextResponse.json({ error: error.message, subgroups: [] }, { status: 500 });

  const subgroups = (data || []).map((r: { id: number; topic: string; name: string; order_index: number | null; n: number; advanced_count: number }) => ({
    id: Number(r.id),
    topic: r.topic,
    name: r.name,
    order: r.order_index == null ? null : Number(r.order_index),
    questionCount: Number(r.n) || 0,
    advancedCount: Number(r.advanced_count) || 0,
  }));
  return NextResponse.json({ level, subgroups });
}
