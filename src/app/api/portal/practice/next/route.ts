import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { questionMarkdown, questionStructured, totalMarksOf } from '@/lib/bank-question-markdown';
import { practiceAuth, practiceLevelAllowed, bankScope, rpcAudience, scienceServeFor } from '@/lib/practice';
import { isScienceLevel } from '@/lib/science-levels';
import { scienceLevelCounts, scienceNext, toPayload } from '@/lib/science-bank';
import { adaptiveFallbacks, parseAdaptiveLevel, parseSkill, resolveTopicPool, serveUnlevelled } from '@/lib/science-practice';
import { scienceLevelsAllowedFor, scienceStructuredPracticeOpen } from '@/lib/portal-beta';
import { portalIdentity } from '@/lib/portal-auth';

export const runtime = 'nodejs';

// POST /api/portal/practice/next  { level, topic, exclude?: string[], tier?: 'Standard'|'Advanced', subgroupId?: number }
// Serves one random unseen real question (stem + parts, NO solution) from the
// topic's subgroups. `question: null` means the bank is exhausted for that filter.
// `tier` maps onto questions.difficulty: Advanced = Advanced + Challenging rows,
// Standard = everything else (incl. untagged). Omitted/unknown → no tier filter.
// `subgroupId` narrows to one question type within the topic (the picker's
// "pick a question type" rows); omitted → the whole topic.
// Auth: portal student session (level-gated) OR admin Bearer (testing).
export async function POST(req: NextRequest) {
  const caller = await practiceAuth(req);
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const { level, topic, exclude, tier, subgroupId, kind, skill, pool, difficulty } = body as {
    /** science MCQ only (5 Oct 2026): the run's current level in the silent stream — 'core' | 'exam' | 'challenge' */
    difficulty?: string;
    /** science only (5 Oct 2026): 'pure' | 'combined' — honoured for Adrian only; a student's own choice decides */
    pool?: string;
    level?: string; topic?: string; exclude?: string[]; tier?: string; subgroupId?: number | string | null;
    /** science only (1 Oct 2026): 'mcq' | 'structured' — the Science Practise tab's switch */
    kind?: string;
    /** science only (3 Oct 2026): one skill inside the topic — lib/science-practice TOPIC_SKILLS */
    skill?: string;
  };
  if (!level || !topic) return NextResponse.json({ error: 'level and topic required' }, { status: 400 });
  if (!(await practiceLevelAllowed(caller, level))) return NextResponse.json({ error: 'Level not available' }, { status: 403 });

  // Science levels: the science bank's twin of practice_next (lib/science-bank).
  if (isScienceLevel(level)) {
    // Topic by topic (5 Oct 2026): a student is served only an open topic.
    const serve = await scienceServeFor(caller, pool);
    const pick = resolveTopicPool(serve.open, level, topic, serve.combined);
    if (!pick.open) return NextResponse.json({ error: 'Topic not available yet' }, { status: 403 });
    try {
      // Written-answer questions stay with the admin cookie until the grader check passes:
      // a student is served MCQ whatever the request says (3 Oct 2026, the tab opened).
      const structuredOk = await scienceStructuredPracticeOpen();
      const useKind: 'mcq' | 'structured' | null = !structuredOk ? 'mcq' : kind === 'mcq' || kind === 'structured' ? kind : null;
      const useSkill = parseSkill(level, topic, skill);
      // 🎚 The silent level stream (5 Oct 2026, lib/science-practice stepAdaptive): the run sends
      // its current level; we serve from it, fall back to the next level when it runs out, and mix
      // in questions with no level yet by their share. Whole-topic MCQ runs only, behind
      // SCIENCE_LEVELS_OPEN_TO_STUDENTS (Adrian's cookie and the preview student always).
      const levelsOn = useKind === 'mcq' && !useSkill
        && (caller.kind === 'admin' || scienceLevelsAllowedFor(portalIdentity(caller.account)));
      const runLevel = levelsOn ? parseAdaptiveLevel(difficulty) : null;
      const base = {
        kind: useKind, levelKey: level, topic, exclude: Array.isArray(exclude) ? exclude : [],
        skill: useSkill, tier: tier === 'Standard' || tier === 'Advanced' ? tier as 'Standard' | 'Advanced' : null,
        combined: pick.combined, checkedOnly: serve.checkedOnly,
      };
      let q: Awaited<ReturnType<typeof scienceNext>> = null;
      let servedFrom: string | null = null;
      if (runLevel) {
        const counts = await scienceLevelCounts(level, topic, { combined: pick.combined, checkedOnly: serve.checkedOnly }).catch(() => null);
        const levelled = counts ? counts.core + counts.exam + counts.challenge : 0;
        if (counts && serveUnlevelled(counts.none, levelled, Math.random())) {
          q = await scienceNext({ ...base, unlevelledOnly: true });
          if (q) servedFrom = 'none';
        }
        for (const l of adaptiveFallbacks(runLevel)) {
          if (q) break;
          q = await scienceNext({ ...base, difficultyLevel: l });
          if (q) servedFrom = l;
        }
      }
      if (!q) q = await scienceNext(base);   // the whole topic, as before
      return NextResponse.json({ question: q ? toPayload(q) : null, ...(levelsOn ? { adaptive: true, levelServed: servedFrom } : {}) });
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
  }

  const scope = bankScope(level);
  const sg = subgroupId == null || subgroupId === '' ? NaN : Number(subgroupId);
  const { data, error } = await getSupabaseAdmin().rpc('practice_next', {
    p_level: scope.level,
    p_qlevel: scope.qlevel,
    p_topic: topic,
    p_exclude: Array.isArray(exclude) ? exclude : [],
    p_tier: tier === 'Standard' || tier === 'Advanced' ? tier : null,
    p_subgroup: Number.isFinite(sg) && sg > 0 ? sg : null,
    // Sub-group audience (lib/subgroup-visibility.ts): the RPC serves nothing
    // from a sub-group this caller may not see, whatever subgroupId they post,
    // and the topic mix skips questions filed only under such sub-groups.
    ...rpcAudience(caller),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const q = data?.[0];
  if (!q) return NextResponse.json({ question: null });

  // Deliberately NOT exposing the originating school/paper to students —
  // the portal shows the question and marks only.
  // `stem` + `parts` drive the portal's exam-style grid (label / text / marks
  // columns); `markdown` is the flat form for anything that just wants text.
  const { stem, parts } = questionStructured(q);
  return NextResponse.json({
    question: {
      id: q.id,
      markdown: questionMarkdown(q),
      stem,
      parts,
      marks: q.total_marks ?? totalMarksOf(parts),
      figureUrl: q.figure_url ?? null,
      source: null,
      hasSolution: !!q.has_solution,
    },
  });
}
