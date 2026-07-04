import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

// Bank Health — surfaces the coverage + quality of the practice-question bank
// so the content flywheel is visible: which sub-skills have verified practice
// questions, which are gaps, and which questions are getting flagged.
//
// v1 is Supabase-only (practice_questions / subgroups / student_revise_state /
// questions). Demand signals (Airtable Questions log) + misconceptions
// (Submissions) are a later phase.

const LEVELS = ['AM', 'EM', 'JC', 'S1', 'S2'];
const FOCUS_LEVEL = 'AM'; // the only level with generated practice today

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (new URL(req.url).searchParams.get('auth') === 'check') return NextResponse.json({ ok: true });

  const supa = getSupabaseAdmin();
  if (!supa) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });

  try {
    // ── All practice questions (small: tens of rows) ──────────────────────────
    const { data: pqs, error: pqErr } = await supa
      .from('practice_questions')
      .select('id, subgroup_id, level, topic, verified, flagged_count, hit_count, question_text');
    if (pqErr) throw pqErr;
    const practice = pqs || [];

    const EXCLUDE_THRESHOLD = 3;
    const verifiedCoveredByLevel: Record<string, Set<number>> = {};
    for (const q of practice) {
      if (q.verified) {
        (verifiedCoveredByLevel[q.level] ??= new Set()).add(q.subgroup_id);
      }
    }

    // ── Per-level coverage (cheap head counts) ────────────────────────────────
    const levels = await Promise.all(LEVELS.map(async (level) => {
      const { count } = await supa
        .from('subgroups')
        .select('*', { count: 'exact', head: true })
        .eq('level', level);
      const total = count || 0;
      const covered = verifiedCoveredByLevel[level]?.size || 0;
      return { level, subgroupsTotal: total, subgroupsCovered: covered,
        coveragePct: total ? Math.round((covered / total) * 100) : 0 };
    }));

    // ── Quality metrics ───────────────────────────────────────────────────────
    const pqTotal = practice.length;
    const pqVerified = practice.filter(q => q.verified).length;
    const pqExcluded = practice.filter(q => (q.flagged_count || 0) >= EXCLUDE_THRESHOLD).length;
    const hitCounts = practice.map(q => q.hit_count || 0);
    const avgHitCount = hitCounts.length ? Math.round((hitCounts.reduce((a, b) => a + b, 0) / hitCounts.length) * 10) / 10 : 0;

    // Flagged questions (any flag) with student reasons if present.
    const flaggedPqs = practice.filter(q => (q.flagged_count || 0) > 0)
      .sort((a, b) => (b.flagged_count || 0) - (a.flagged_count || 0));
    let flagReasons: Record<string, string[]> = {};
    if (flaggedPqs.length) {
      const ids = flaggedPqs.map(q => q.id);
      const { data: states } = await supa
        .from('student_revise_state')
        .select('practice_question_id, flag_reason')
        .in('practice_question_id', ids)
        .not('flag_reason', 'is', null);
      for (const s of states || []) {
        if (s.flag_reason) (flagReasons[s.practice_question_id] ??= []).push(s.flag_reason);
      }
    }
    const flagged = flaggedPqs.map(q => ({
      id: q.id, topic: q.topic, subgroupId: q.subgroup_id,
      flaggedCount: q.flagged_count || 0,
      excluded: (q.flagged_count || 0) >= EXCLUDE_THRESHOLD,
      preview: (q.question_text || '').slice(0, 140),
      reasons: flagReasons[q.id] || [],
    }));

    // ── Coverage gaps for the focus level (AM subgroups with no verified pq) ──
    const { data: focusSubs } = await supa
      .from('subgroups')
      .select('id, topic, name')
      .eq('level', FOCUS_LEVEL);
    const covered = verifiedCoveredByLevel[FOCUS_LEVEL] || new Set<number>();
    const gapsByTopic: Record<string, string[]> = {};
    for (const s of focusSubs || []) {
      if (!covered.has(s.id)) (gapsByTopic[s.topic] ??= []).push(s.name);
    }
    const focusGaps = Object.entries(gapsByTopic)
      .map(([topic, names]) => ({ topic, count: names.length, names }))
      .sort((a, b) => b.count - a.count);

    // ── Headline seed-bank size ───────────────────────────────────────────────
    const { count: qbCount } = await supa
      .from('questions')
      .select('*', { count: 'exact', head: true });

    return NextResponse.json({
      snapshot: { qbQuestions: qbCount || 0, pqTotal, pqVerified, pqExcluded, avgHitCount },
      levels,
      quality: { flagged },
      focus: { level: FOCUS_LEVEL, gaps: focusGaps },
    });
  } catch (err: any) {
    console.error('[bank-health] error:', err.message);
    return NextResponse.json({ error: err.message || 'Failed to load bank health' }, { status: 500 });
  }
}
