import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { practiceAuth, levelAllowed, qbLevelsFor, bankScope, rpcAudience } from '@/lib/practice';
import { audienceBadge } from '@/lib/subgroup-visibility';

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
// AUDIENCE (2026-09-02): the RPC applies subgroups.visibility / ip_extra_level
// against the caller (rpcAudience) — a non-IP student never receives an
// 'ip' or 'hidden' row; admin receives every row with a `badge` to say why.
// Auth: portal student session (level-gated) OR admin Bearer (testing).
export async function GET(req: NextRequest) {
  const caller = await practiceAuth(req);
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const levels = caller.kind === 'student' ? qbLevelsFor(caller.account.level, caller.account.subjects) : null;
  const level = url.searchParams.get('level') || levels?.[0]?.key;
  if (!level) return NextResponse.json({ error: 'level required' }, { status: 400 });
  if (!levelAllowed(caller, level)) return NextResponse.json({ error: 'Level not available' }, { status: 403 });
  const topic = url.searchParams.get('topic') || null;

  const scope = bankScope(level);
  const audience = rpcAudience(caller);
  const { data, error } = await getSupabaseAdmin().rpc('practice_subgroups', {
    p_level: scope.level,
    p_topic: topic,
    p_qlevel: scope.qlevel,
    ...audience,
  });
  if (error) return NextResponse.json({ error: error.message, subgroups: [] }, { status: 500 });

  type Row = {
    id: number; topic: string; name: string; order_index: number | null; n: number; advanced_count: number;
    level?: string; visibility?: string | null; ip_extra_level?: string | null;
  };
  const subgroups = (data || []).map((r: Row) => ({
    id: Number(r.id),
    topic: r.topic,
    name: r.name,
    order: r.order_index == null ? null : Number(r.order_index),
    questionCount: Number(r.n) || 0,
    advancedCount: Number(r.advanced_count) || 0,
    // Admin only: "IP only" / "hidden" / "also IP S1" — students never see a
    // row they are not meant to, so they never need the label.
    badge: audience.p_admin ? audienceBadge({ level: r.level ?? scope.level, visibility: r.visibility, ip_extra_level: r.ip_extra_level }, scope.level) : null,
  }));
  return NextResponse.json({ level, subgroups });
}
