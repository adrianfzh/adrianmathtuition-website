// 🧠 "Explain it back" — the one judge, shared by the Learn units
// (/api/portal/learn/explain) and the Notebook re-attempts
// (/api/portal/notebook/explain, 4 Nov 2026, Adrian: "make it stick").
//
// The student writes one sentence on when/why the idea is used; the judge reads
// it ONLY against the content it is handed (never outside knowledge) and gives
// a warm pass / close / miss. Server-only (calls the model).
import Anthropic from '@anthropic-ai/sdk';

export const EXPLAIN_MODEL = 'claude-opus-5-5';
export const EXPLAIN_MAX_ANSWER = 200;

export type ExplainVerdict = 'pass' | 'close' | 'miss';

/** The words around the content: what the student just did ("finished a lesson unit on", "re-attempted a question on"). */
export function explainSystem(situation: string, topic: string, content: string, label = 'LESSON CONTENT'): string {
  return `You are Adrian, a warm and encouraging Singapore maths tutor. A student has just ${situation} "${topic}" and is telling you, in one sentence, when or why you use this idea.

Judge their sentence ONLY against the ${label.toLowerCase()} below — do not use outside knowledge, and do not penalise them for anything it doesn't teach. Reward the core intuition; small imprecision is fine.

Return STRICT JSON only, no prose, no code fences:
{"verdict":"pass"|"close"|"miss","feedback":"<25 words, warm, second-person, Adrian's voice>"}

- "pass": they've got the key idea.
- "close": right instinct, missing or muddling one thing — nudge them.
- "miss": not the right idea — point them gently back.

--- ${label} (the ONLY thing you may judge against) ---
${content}
--- END ${label} ---`;
}

/** Parse the judge's reply. Anything unreadable throws (the route answers 502). */
export function parseExplainReply(text: string, missFallback: string): { verdict: ExplainVerdict; feedback: string } {
  const m = text.match(/\{[\s\S]*\}/);
  const parsed = m ? JSON.parse(m[0]) : JSON.parse(text);
  const v = String(parsed.verdict || '').toLowerCase();
  const verdict: ExplainVerdict = v === 'pass' || v === 'miss' ? v : 'close';
  let feedback = String(parsed.feedback || '').slice(0, 200).trim();
  if (!feedback) feedback = verdict === 'miss' ? missFallback : 'Good thinking.';
  return { verdict, feedback };
}

/** One judged sentence. Throws on a model or parse failure. */
export async function judgeExplanation(system: string, answer: string, missFallback: string): Promise<{ verdict: ExplainVerdict; feedback: string }> {
  const msg = await new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }).messages.create({
    model: EXPLAIN_MODEL,
    max_tokens: 400,
    system,
    messages: [{ role: 'user', content: answer }],
  });
  const text = msg.content
    .filter(b => b.type === 'text')
    .map(b => (b as { text: string }).text)
    .join('')
    .trim();
  return parseExplainReply(text, missFallback);
}
