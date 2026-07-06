// Grading engine for portal practice (Phase E). Claude Opus grades the
// student's numbered working lines against the question's real mark scheme.
//
// Privacy: the student's NAME is never sent to the model — only the question,
// the working, and anonymous weakness tags (PRIVACY.md §3.6).
// Anchoring: feedback references LINE NUMBERS, not quoted substrings — quote
// matching breaks on math notation (PLAN R7).
import Anthropic from '@anthropic-ai/sdk';
import { createServiceClient } from './supabase-server';

export const GRADING_MODEL = 'claude-opus-4-8';
export const DAILY_GRADE_CAP = 20;

export const ERROR_TAGS = [
  'arithmetic-slip', 'method-error', 'conceptual-gap', 'sign-error',
  'rounding', 'notation', 'missing-step', 'incomplete', 'misread-question',
] as const;

export interface LineComment {
  line: number;
  ok: boolean;
  comment: string;
  fix?: string;
  tag?: string;
  severity?: 'major' | 'minor';
}
export interface GradeResult {
  verdict: 'correct' | 'partial' | 'wrong';
  score: number;
  outOf: number;
  partBreakdown: { label: string; awarded: number; outOf: number; comment: string }[];
  lineComments: LineComment[];
  strengths: string[];
  nextSteps: string[];
}

function collectScheme(parts: unknown, out: string[], prefix = ''): void {
  if (!Array.isArray(parts)) return;
  for (const p of parts as Record<string, unknown>[]) {
    const label = `${prefix}${p.label ?? ''}`;
    out.push(`(${label}) [${p.marks ?? '?'}m] ${p.text ?? ''}`);
    if (p.answer) out.push(`    ANSWER (${label}): ${p.answer}`);
    if (p.solution) out.push(`    SOLUTION (${label}): ${p.solution}`);
    if (Array.isArray(p.subparts)) collectScheme(p.subparts, out, `${label}.`);
  }
}

function validate(raw: unknown, lineCount: number): GradeResult | null {
  const r = raw as Record<string, unknown>;
  if (!r || typeof r !== 'object') return null;
  if (!['correct', 'partial', 'wrong'].includes(r.verdict as string)) return null;
  if (typeof r.score !== 'number' || typeof r.outOf !== 'number' || r.outOf <= 0) return null;
  const score = Math.max(0, Math.min(r.score, r.outOf));
  const lineComments: LineComment[] = Array.isArray(r.lineComments)
    ? (r.lineComments as Record<string, unknown>[])
        .filter(c => typeof c.line === 'number' && c.line >= 1 && c.line <= lineCount && typeof c.comment === 'string')
        .map(c => ({
          line: c.line as number,
          ok: c.ok === true,
          comment: String(c.comment).slice(0, 500),
          ...(c.fix ? { fix: String(c.fix).slice(0, 500) } : {}),
          ...(typeof c.tag === 'string' && (ERROR_TAGS as readonly string[]).includes(c.tag) ? { tag: c.tag } : {}),
          ...(c.severity === 'major' || c.severity === 'minor' ? { severity: c.severity as 'major' | 'minor' } : {}),
        }))
    : [];
  const arr = (v: unknown) => (Array.isArray(v) ? (v as unknown[]).map(String).slice(0, 5) : []);
  const partBreakdown = Array.isArray(r.partBreakdown)
    ? (r.partBreakdown as Record<string, unknown>[])
        .filter(p => typeof p.label === 'string' && typeof p.awarded === 'number' && typeof p.outOf === 'number')
        .map(p => ({ label: String(p.label), awarded: p.awarded as number, outOf: p.outOf as number, comment: String(p.comment || '').slice(0, 300) }))
    : [];
  return {
    verdict: r.verdict as GradeResult['verdict'],
    score, outOf: r.outOf as number,
    partBreakdown, lineComments,
    strengths: arr(r.strengths), nextSteps: arr(r.nextSteps),
  };
}

export async function gradeAttempt(opts: {
  question: Record<string, unknown>;
  lines: string[];
  weaknessTags: string[];
}): Promise<GradeResult> {
  const { question, lines, weaknessTags } = opts;
  const scheme: string[] = [];
  collectScheme(question.parts, scheme);
  if (question.answer) scheme.push(`OVERALL ANSWER: ${question.answer}`);
  if (question.solution) scheme.push(`FULL SOLUTION: ${question.solution}`);

  const numbered = lines.map((l, i) => `${i + 1}. ${l || '(blank line)'}`).join('\n');
  const watch = weaknessTags.length
    ? `\nThis student's recurring error types (watch for them, mention only if they occur): ${weaknessTags.join(', ')}.`
    : '';

  const prompt = `You are an experienced Singapore ${question.level} mathematics examiner marking one student's working against the official mark scheme.

QUESTION (LaTeX in $...$):
${question.question_text || ''}
${scheme.length ? '\nMARK SCHEME:\n' + scheme.join('\n') : ''}
Total marks: ${question.total_marks ?? 'per parts above'}

STUDENT'S WORKING (numbered lines — reference these numbers ONLY):
${numbered}
${watch}

Mark strictly but fairly per the scheme: method marks where the approach is valid, accuracy marks only for correct values. Follow-through where the scheme allows. If the working is too sparse to earn a mark, it doesn't earn it.

Reply with ONLY a JSON object (no markdown fences):
{
  "verdict": "correct"|"partial"|"wrong",
  "score": <number>, "outOf": <number>,
  "partBreakdown": [{"label":"a","awarded":2,"outOf":3,"comment":"<why, one sentence>"}],
  "lineComments": [{"line":<1-based line number>,"ok":true|false,"comment":"<what's right/wrong>","fix":"<the corrected step, only when ok=false>","tag":"<one of: ${ERROR_TAGS.join(', ')}>","severity":"major"|"minor"}],
  "strengths": ["<max 3, genuine>"],
  "nextSteps": ["<2-3 concrete actions>"]
}
Comment on every line that earns or loses a mark; skip trivial restatements. "tag" only on ok=false lines.`;

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  let lastErr = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const msg = await anthropic.messages.create({
      model: GRADING_MODEL,
      max_tokens: 4000,
      messages: [{ role: 'user', content: attempt === 0 ? prompt : `${prompt}\n\nYour previous reply was not valid JSON (${lastErr}). Reply with ONLY the JSON object.` }],
    });
    const text = msg.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('');
    try {
      const jsonStr = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
      const parsed = validate(JSON.parse(jsonStr), lines.length);
      if (parsed) return parsed;
      lastErr = 'schema mismatch';
    } catch (e) {
      lastErr = e instanceof Error ? e.message.slice(0, 100) : 'parse error';
    }
  }
  throw new Error('Grading failed: model did not return valid JSON');
}

export async function upsertWeaknessTags(userId: string, airtableStudentId: string, tags: string[]) {
  if (!tags.length) return;
  const supabase = createServiceClient();
  for (const tag of [...new Set(tags)]) {
    const { data: row } = await supabase
      .from('weakness_tags').select('count').eq('user_id', userId).eq('tag', tag).maybeSingle();
    await supabase.from('weakness_tags').upsert({
      user_id: userId,
      airtable_student_id: airtableStudentId,
      tag,
      count: (row?.count || 0) + 1,
      last_seen: new Date().toISOString(),
    });
  }
}

export async function topWeaknessTags(userId: string, n = 3): Promise<string[]> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('weakness_tags').select('tag, count').eq('user_id', userId)
    .order('count', { ascending: false }).limit(n);
  return (data || []).map(r => r.tag);
}
