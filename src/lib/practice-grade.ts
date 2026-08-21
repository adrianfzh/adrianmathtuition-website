// Grading engine for portal practice (Phase E). Claude Opus grades the
// student's numbered working lines against the question's real mark scheme.
//
// Privacy: the student's NAME is never sent to the model — only the question,
// the working, and anonymous weakness tags (PRIVACY.md §3.6).
// Anchoring: feedback references LINE NUMBERS, not quoted substrings — quote
// matching breaks on math notation (PLAN R7).
import Anthropic from '@anthropic-ai/sdk';
import { createServiceClient } from './supabase-server';
import { ERROR_TAGS, buildGradingPrompt } from './practice-grade-prompt';

export const GRADING_MODEL = 'claude-opus-5';
export const DAILY_GRADE_CAP = 20;

export { ERROR_TAGS };

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
  // Photo attempts: the model's faithful transcription of the handwritten
  // working — lineComments reference THESE line numbers.
  transcribedLines?: string[];
  // true when the model needed a second attempt to produce valid JSON —
  // treated as a lower-confidence grade (triggers a spot-check alert).
  parseRetried?: boolean;
}

export interface AttemptImage {
  data: string;       // raw base64, no data: prefix
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp';
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
  lines?: string[];
  image?: AttemptImage;
  weaknessTags: string[];
}): Promise<GradeResult> {
  const { question, lines, image, weaknessTags } = opts;
  const isPhoto = !!image;
  if (!isPhoto && !lines?.length) throw new Error('lines or image required');

  const prompt = buildGradingPrompt({ question, lines, isPhoto, weaknessTags });

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const content = (extra: string): Anthropic.MessageParam['content'] => {
    const text = { type: 'text' as const, text: prompt + extra };
    return isPhoto
      ? [{ type: 'image' as const, source: { type: 'base64' as const, media_type: image!.mediaType, data: image!.data } }, text]
      : [text];
  };

  let lastErr = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const msg = await anthropic.messages.create({
      model: GRADING_MODEL,
      max_tokens: 5000,
      messages: [{
        role: 'user',
        content: content(attempt === 0 ? '' : `\n\nYour previous reply was not valid JSON (${lastErr}). Reply with ONLY the JSON object.`),
      }],
    });
    const text = msg.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('');
    try {
      const jsonStr = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
      const raw = JSON.parse(jsonStr) as Record<string, unknown>;
      const transcribed = Array.isArray(raw.transcribedLines)
        ? (raw.transcribedLines as unknown[]).map(String).slice(0, 60)
        : undefined;
      const lineCount = isPhoto ? (transcribed?.length || 0) : lines!.length;
      if (isPhoto && !lineCount) { lastErr = 'no transcribedLines'; continue; }
      // Typed path: the LaTeX echo is display-only — pass it through only when
      // its count matches the input lines, so lineComments' numbering holds.
      const echo = isPhoto ? transcribed
        : (transcribed && transcribed.length === lineCount ? transcribed : undefined);
      const parsed = validate(raw, lineCount);
      if (parsed) return { ...parsed, ...(echo ? { transcribedLines: echo } : {}), parseRetried: attempt > 0 };
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
