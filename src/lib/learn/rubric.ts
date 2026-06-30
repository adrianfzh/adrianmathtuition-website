import { getSupabase } from '@/lib/supabase';
import { JSON_SHAPE, ENGLISH_SYSTEM } from './prompts';

// Admin-managed grading rubrics (see RUBRIC-SPEC.md). The grader loads the
// matching rubric from Supabase and builds its system prompt from the official
// band descriptors — so grading follows the real syllabus and is tunable in
// admin without code. Falls back to the built-in ENGLISH_SYSTEM if none found.

export type RubricCriterion = {
  name: string;
  maxMarks: number;
  descriptors: { band: number; range: string; text: string }[];
};
export type Rubric = {
  id: string;
  level: string;
  subject: string;
  paper: string;
  essay_type: string | null;
  criteria: RubricCriterion[];
  grading_notes: string | null;
  out_of: number | null;
};

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

export function buildEnglishSystem(rubric: Rubric | null): string {
  if (!rubric || !rubric.criteria?.length) return ENGLISH_SYSTEM; // safe fallback
  const out = rubric.out_of ?? 30;
  const rubricText = rubric.criteria
    .map((c) =>
      `${c.name} (out of ${c.maxMarks}):\n` +
      c.descriptors.map((d) => `  Band ${d.band} (${d.range}): ${d.text}`).join('\n'))
    .join('\n\n');

  return `You are a Singapore ${rubric.level} ${rubric.subject} examiner giving a STUDENT instant, encouraging-but-honest feedback on their own writing, so they can improve WITHOUT a teacher.

The student may submit a SINGLE SENTENCE, a PARAGRAPH, or a FULL ESSAY — adapt, and NEVER refuse or demand a full essay:
- FULL ESSAY (${rubric.paper}): grade against the official rubric below — give each criterion a band + one-line reason, and overall.score out of ${out} with overall.band (e.g. "Content 7/10 · Language 13/20").
- PARAGRAPH or SINGLE SENTENCE: do NOT ask for more. Give focused, encouraging feedback to improve THAT exact piece. Set overall.score to null and overall.band to a short scope label (e.g. "Paragraph feedback" / "Sentence feedback"); each rubric criterion may use band "—". Focus annotations + nextSteps on improving exactly what they wrote.

OFFICIAL MARKING RUBRIC — ${rubric.paper}:
${rubricText}
${rubric.grading_notes ? `\nExaminer notes: ${rubric.grading_notes}` : ''}

For each annotation: quote an EXACT substring of the student's text (verbatim, ≤120 chars) and give a specific, actionable fix; tag = short kebab-case error type; severity = "minor" | "major". Give 2-4 nextSteps and 1-3 genuine strengths.

${JSON_SHAPE}`;
}
