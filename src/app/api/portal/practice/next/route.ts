import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { questionMarkdown, questionStructured, totalMarksOf } from '@/lib/bank-question-markdown';
import { practiceAuth, practiceLevelAllowed, bankScope, rpcAudience } from '@/lib/practice';
import { isScienceLevel } from '@/lib/science-levels';
import { scienceNext, toPayload } from '@/lib/science-bank';

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
  const { level, topic, exclude, tier, subgroupId } = body as {
    level?: string; topic?: string; exclude?: string[]; tier?: string; subgroupId?: number | string | null;
  };
  if (!level || !topic) return NextResponse.json({ error: 'level and topic required' }, { status: 400 });
  if (!(await practiceLevelAllowed(caller, level))) return NextResponse.json({ error: 'Level not available' }, { status: 403 });

  // Science levels: the science bank's twin of practice_next (lib/science-bank).
  if (isScienceLevel(level)) {
    try {
      const q = await scienceNext({
        levelKey: level, topic, exclude: Array.isArray(exclude) ? exclude : [],
        tier: tier === 'Standard' || tier === 'Advanced' ? tier : null,
      });
      return NextResponse.json({ question: q ? toPayload(q) : null });
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
