import Anthropic from '@anthropic-ai/sdk';
import { getSupabaseAdmin } from '@/lib/supabase';

// Stage 2 of the tiered practice router: when the real-question bank is exhausted
// for a (level, topic), GENERATE a new question anchored to real exemplars, then
// VERIFY it by running actual code (SymPy/Python via Anthropic code execution) —
// never a model re-guess. Only a question whose code-computed answer matches the
// claimed answer AND is well-posed is served/cached. Otherwise: regenerate, else
// the caller falls back to a real bank question. Numeric/mechanical topics only.

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const GEN_MODEL = 'claude-opus-4-8';
const VERIFY_MODEL = 'claude-opus-4-8';
const CODE_EXEC_TOOL = [{ type: 'code_execution_20250825', name: 'code_execution' }];
const CODE_EXEC_BETA = 'code-execution-2025-08-25';

function parseJsonLoose(text: string | undefined): any {
  if (!text) return null;
  const t = String(text).trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const first = t.indexOf('{'), last = t.lastIndexOf('}');
  if (first === -1 || last === -1) return null;
  try { return JSON.parse(t.slice(first, last + 1)); } catch { return null; }
}
function textOf(msg: any): string {
  return (msg?.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
}

type Exemplar = { question_text: string; answer: string; solution: string; total_marks: number | null };
type GenQuestion = { question: string; answer: string; solution: string; marks?: number };
type Verify = { wellPosed: boolean; matches: boolean; computedAnswer?: string; reason?: string };

async function gatherContext(level: string, topic: string) {
  const sb = getSupabaseAdmin();
  const [ex, syl, subs] = await Promise.all([
    sb.rpc('practice_exemplars', { p_level: level, p_topic: topic, p_limit: 4 }),
    sb.from('syllabus_prompts').select('system_prompt_text, includes, excludes').eq('level', level).limit(1),
    sb.from('subgroups').select('name, description').eq('level', level).eq('topic', topic),
  ]);
  return {
    exemplars: (ex.data || []) as Exemplar[],
    syllabus: (syl.data?.[0] as any) || null,
    subgroups: (subs.data || []) as { name: string; description: string | null }[],
  };
}

async function generateQuestion(ctx: Awaited<ReturnType<typeof gatherContext>>, level: string, topic: string): Promise<GenQuestion | null> {
  const exemplarText = ctx.exemplars.slice(0, 4).map((e, i) =>
    `Exemplar ${i + 1}${e.total_marks ? ` [${e.total_marks} marks]` : ''}:\nQ: ${e.question_text}\nAnswer: ${e.answer}`).join('\n\n');
  const scope = ctx.syllabus?.system_prompt_text ? `\n\nSyllabus scope (stay strictly within this):\n${ctx.syllabus.system_prompt_text}` : '';
  const concept = ctx.subgroups.filter((s) => s.description).map((s) => `- ${s.name}: ${s.description}`).join('\n');

  const system = `You are an experienced Singapore ${level} mathematics question author. You write ONE fresh exam-style practice question that tests the same concept and sits at the same difficulty as the real exemplars given — NOT a copy. The question must have a SINGLE, CLEAN, UNAMBIGUOUS numeric/exact answer that can be checked by computation. Avoid diagrams, proofs, and open-ended parts. Keep notation in plain text (x^2, sqrt(...), a/b, pi, e).`;
  const user = `Topic: ${topic}${concept ? `\n\nConcept(s) to preserve:\n${concept}` : ''}${scope}

Real exemplars (match their style, depth and difficulty; do NOT reuse their numbers):
${exemplarText}

Write ONE new question on this topic. Solve it yourself carefully and give the final answer and a concise worked solution.
Return ONLY JSON: {"question": "...", "answer": "...", "solution": "...", "marks": <int>}`;

  const resp = await anthropic.messages.create({ model: GEN_MODEL, max_tokens: 2000, system, messages: [{ role: 'user', content: user }] });
  const q = parseJsonLoose(textOf(resp));
  return q?.question && q?.answer ? q : null;
}

async function verifyByCode(q: GenQuestion): Promise<Verify | null> {
  const system = `You verify a proposed math practice question by SOLVING IT INDEPENDENTLY WITH CODE. Use the code execution tool (Python + SymPy) to compute the answer from scratch — do not trust the proposed answer. Then judge:
- wellPosed: does the question have a single, unambiguous, solvable answer within standard syllabus methods?
- matches: does YOUR code-computed answer equal the proposed answer, allowing mathematically-equivalent forms (e.g. 1/2 = 0.5, factored vs expanded)?
Return ONLY JSON: {"wellPosed": bool, "matches": bool, "computedAnswer": "...", "reason": "..."}`;
  const user = `Question:\n${q.question}\n\nProposed answer: ${q.answer}\n\nSolve it yourself with code, then return the JSON verdict.`;

  const stream = anthropic.messages.stream(
    { model: VERIFY_MODEL, max_tokens: 4000, system, messages: [{ role: 'user', content: user }], tools: CODE_EXEC_TOOL as any },
    { headers: { 'anthropic-beta': CODE_EXEC_BETA } },
  );
  const final = await stream.finalMessage();
  return parseJsonLoose(textOf(final));
}

async function cache(level: string, topic: string, q: GenQuestion, v: Verify, attempts: number) {
  try {
    await getSupabaseAdmin().from('practice_questions').insert({
      level, topic, question_text: q.question, marks: q.marks ?? null,
      answer: q.answer, solution: q.solution ?? null,
      verified: true, verified_at: new Date().toISOString(),
      generated_by: 'stage2/web', gen_model: GEN_MODEL, verify_model: `${VERIFY_MODEL}+code`,
      verify_mismatch: false, verify_log: v as any, attempts_made: attempts,
    });
  } catch { /* cache is best-effort; a serve still works without it */ }
}

export type GenerateResult =
  | { ok: true; question: GenQuestion; verify: Verify; attempts: number }
  | { ok: false; reason: string; attempts: number; lastVerify?: Verify | null };

/**
 * Generate a verified practice question for (level, topic). maxRetries = extra
 * attempts after the first. Returns ok:false (caller falls back to bank) if no
 * attempt passes the code-verify gate.
 */
export async function generatePracticeQuestion(opts: { level: string; topic: string; maxRetries?: number; cacheOnPass?: boolean }): Promise<GenerateResult> {
  const { level, topic, maxRetries = 1, cacheOnPass = true } = opts;
  const ctx = await gatherContext(level, topic);
  if (!ctx.exemplars.length) return { ok: false, reason: 'no exemplars with solutions for this topic', attempts: 0 };

  let lastVerify: Verify | null = null;
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    const q = await generateQuestion(ctx, level, topic);
    if (!q) { lastVerify = null; continue; }
    const v = await verifyByCode(q);
    lastVerify = v;
    if (v?.wellPosed && v?.matches) {
      if (cacheOnPass) await cache(level, topic, q, v, attempt);
      return { ok: true, question: q, verify: v, attempts: attempt };
    }
  }
  return { ok: false, reason: 'failed code-verification', attempts: maxRetries + 1, lastVerify };
}
