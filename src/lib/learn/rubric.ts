import { getSupabase } from '@/lib/supabase';
import type { Rubric } from './prompts';

// Admin-managed grading rubrics (see RUBRIC-SPEC.md). The grader loads the
// matching rubric from Supabase and builds its system prompt from the official
// band descriptors — so grading follows the real syllabus and is tunable in
// admin without code. buildEnglishSystem (the pure prompt builder) lives in
// ./prompts so the grading eval can import it without pulling in Supabase;
// re-exported here so existing `@/lib/learn/rubric` imports keep working.
export { buildEnglishSystem } from './prompts';
export type { Rubric, RubricCriterion } from './prompts';

export async function getRubric(opts: {
  level?: string; subject?: string; paper?: string; essayType?: string | null;
}): Promise<Rubric | null> {
  try {
    const sb = getSupabase();
    const { data } = await sb
      .from('rubrics')
      .select('*')
      .eq('level', opts.level ?? 'O-Level')
      .eq('subject', opts.subject ?? 'English')
      .eq('paper', opts.paper ?? 'Continuous Writing')
      .order('version', { ascending: false })
      .limit(1);
    return (data?.[0] as Rubric) ?? null;
  } catch {
    return null;
  }
}
