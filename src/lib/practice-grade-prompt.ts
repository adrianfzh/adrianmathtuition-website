// The portal practice grader's prompt — extracted from practice-grade.ts so the
// calibration eval (scripts/practice-grade-eval.mjs) can score the EXACT prompt
// production sends, without pulling in supabase-server/next. No imports here;
// keep this module dependency-free.
//
// Rubric changes for the E6 calibration gate happen HERE, and every change must
// re-run the eval: node scripts/practice-grade-eval.mjs

export const ERROR_TAGS = [
  'arithmetic-slip', 'method-error', 'conceptual-gap', 'sign-error',
  'rounding', 'notation', 'missing-step', 'incomplete', 'misread-question',
] as const;

export function collectScheme(parts: unknown, out: string[], prefix = ''): void {
  if (!Array.isArray(parts)) return;
  for (const p of parts as Record<string, unknown>[]) {
    const label = `${prefix}${p.label ?? ''}`;
    out.push(`(${label}) [${p.marks ?? '?'}m] ${p.text ?? ''}`);
    if (p.answer) out.push(`    ANSWER (${label}): ${p.answer}`);
    if (p.solution) out.push(`    SOLUTION (${label}): ${p.solution}`);
    if (Array.isArray(p.subparts)) collectScheme(p.subparts, out, `${label}.`);
  }
}

export function buildGradingPrompt(opts: {
  question: Record<string, unknown>;
  lines?: string[];
  isPhoto: boolean;
  weaknessTags: string[];
}): string {
  const { question, lines, isPhoto, weaknessTags } = opts;

  const scheme: string[] = [];
  collectScheme(question.parts, scheme);
  if (question.answer) scheme.push(`OVERALL ANSWER: ${question.answer}`);
  if (question.solution) scheme.push(`FULL SOLUTION: ${question.solution}`);

  const watch = weaknessTags.length
    ? `\nThis student's recurring error types (watch for them, mention only if they occur): ${weaknessTags.join(', ')}.`
    : '';

  const workingSection = isPhoto
    ? `STUDENT'S WORKING: in the attached photo (handwritten or on a tablet).
First transcribe it FAITHFULLY into discrete numbered steps — one mathematical step per line, with the mathematics as LaTeX in $...$ (e.g. "$x^2 - 3x = 5$", "$\\sqrt{50} = 5\\sqrt{2}$"). Transcribe what is written, including mistakes — do not correct while transcribing. If part of the photo is unreadable, transcribe it as "(illegible)". Then mark those transcribed lines; lineComments reference the transcribed line numbers.`
    : `STUDENT'S WORKING (numbered lines — reference these numbers ONLY):
${lines!.map((l, i) => `${i + 1}. ${l || '(blank line)'}`).join('\n')}
In "transcribedLines", return these same lines in the same order — exactly one entry per input line (keep blank lines as "") — with the mathematics rewritten as LaTeX in $...$ (e.g. "9C5 * 2^4" becomes "$\\binom{9}{5} \\cdot 2^4$"). Stay faithful to what the student wrote, including mistakes — never correct while transcribing.`;

  const transcriptionField = `\n  "transcribedLines": ["<each ${isPhoto ? 'transcribed step' : 'input line as LaTeX'}, in order>"],`;

  return `You are an experienced Singapore ${question.level} mathematics examiner marking one student's working against the official mark scheme.

QUESTION (LaTeX in $...$):
${question.question_text || ''}
${scheme.length ? '\nMARK SCHEME:\n' + scheme.join('\n') : ''}
Total marks: ${question.total_marks ?? 'per parts above'}

${workingSection}
${watch}

Mark per the scheme — method marks where the approach is valid, accuracy marks only for correct values — the way an experienced tutor marks by hand:
- Error carried forward: each error costs its mark ONCE; judge later lines by the method applied to the carried value, never re-penalising downstream lines. Self-corrections cost nothing.
- The accuracy mark needs the asked-for quantity, correct and in the required form. A wrong final value (e.g. a calculator slip after a correct setup) keeps the method marks but always loses the accuracy mark — put the corrected value in the fix. If the asked-for quantity never appears at all, the part earns 0 even when the preliminary algebra is correct — say what was asked for.
- "Explain / show / prove" marks are all-or-nothing: a vague, circular, self-contradictory or incomplete justification, an unjustified assumption (e.g. treating points as collinear without showing it), or an illegal algebraic step earns 0 for those marks — no partial credit for effort. Name the gap precisely ("this shows X but does not prove Y"). Geometry statements need their reasons; a true statement missing its reason loses that mark.
- Never deduct for presentation, notation style, method policy, or missing working when the required values are correct: a correct answer on a "write down" or 1-mark question earns full marks with no working, and calculator-obtained results (solving, factorising) are acceptable. Raise style concerns as feedback alongside full marks, not as deductions.
- Estimation questions: rounding to 1 significant figure (or convenient near values) is the REQUIRED technique — never penalise the rounding or demand the exact value.
- If the attempt is fundamentally off-track, score it honestly, explain why the approach is not relevant to what is asked, and advise re-attempting after studying the correct method (outline it in nextSteps).

Reply with ONLY a JSON object (no markdown fences):
{${transcriptionField}
  "verdict": "correct"|"partial"|"wrong",
  "score": <number>, "outOf": <number>,
  "partBreakdown": [{"label":"a","awarded":2,"outOf":3,"comment":"<why, one sentence>"}],
  "lineComments": [{"line":<1-based line number>,"ok":true|false,"comment":"<what's right/wrong>","fix":"<the corrected step, only when ok=false>","tag":"<one of: ${ERROR_TAGS.join(', ')}>","severity":"major"|"minor"}],
  "strengths": ["<max 3, genuine>"],
  "nextSteps": ["<2-3 concrete actions>"]
}
Comment on every line that earns or loses a mark; skip trivial restatements. "tag" only on ok=false lines.
Write all mathematics in comments, fixes, partBreakdown comments and nextSteps as LaTeX in $...$ (it is rendered with KaTeX). The reply must be valid JSON — escape LaTeX backslashes (write \\\\sqrt in the JSON string).`;
}
