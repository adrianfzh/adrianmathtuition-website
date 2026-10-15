// The creditable points for a Geography short question brought from school (15 Oct 2026, Adrian: "yes" to
// "Geography short questions from school"). A "Describe…" / "Explain…" question earns one mark a point,
// and a school question does not come with its list of points. At hand-in we write that list once —
// from the school's own answer scheme when the student sends it, else from the question and the
// syllabus — in the shape our own Geography questions use (docs/humanities/geography-brief.md). The
// answer is then read by the same point-marking reader. Server-only (one API call).
import Anthropic from '@anthropic-ai/sdk';
import { anthropicText } from './claude-models';
import type { CreditPoint } from './humanities-questions';
import type { OwnQuestion } from './humanities-own';

/** Writing a marking list is judgement work, so the large model (CLAUDE.md token rules (c)). */
export const OWN_POINTS_MODEL = process.env.OWN_POINTS_MODEL || 'claude-opus-5-5';

export function ownPointsPrompt(own: OwnQuestion): string {
  return [
    'You write the mark scheme for one short question from a Singapore secondary-school Geography paper (O-Level 2279 syllabus: Geography in Everyday Life, Tourism, Climate, Tectonics).',
    'It is marked one mark per creditable point. Where "develop" is true, a point that is developed (explained further, an example, or figures quoted) earns a second mark.',
    '',
    `QUESTION [${own.marks} marks]:`,
    own.question,
    ...(own.sources ? ['', 'THE FIGURE OR TABLE THE QUESTION USES (typed out; a picture is described in [Picture: …]):', own.sources] : []),
    ...(own.scheme
      ? ['', "THE SCHOOL'S OWN ANSWER SCHEME (use it: one point per creditable idea in it, in its meaning, and add nothing it does not credit):", own.scheme]
      : ['', 'There is no scheme. Write the points a Singapore Geography teacher would credit, from the syllabus and the figure or table above. Only points that are correct and plainly answer this question.']),
    '',
    'Reply with JSON only, in this shape:',
    '{"command":"describe|explain|compare|suggest","develop":true|false,"points":[{"id":"a","text":"…","develop":"…"}],"rules":["…"]}',
    '- "develop": true for "Explain two reasons…" style questions and for describing data, where the figures are the development; false when the answer is a chain of steps or a list, one mark each.',
    '- Each point "text": one plain sentence, 3 to 30 words. When develop is true, every point has a "develop" line saying what earns the second mark.',
    `- Give more points than the ${own.marks} marks need (a student may choose), at most 8.`,
    '- "rules": zero to two short lines only this question needs (for example "Describe only. A reason earns nothing." or "Credit the best two only."). Use [] when none.',
  ].join('\n');
}

export type OwnPoints = { points: CreditPoint[]; command: string; develop: boolean; rules: string[] };

/** The reply → a checked list, or null. */
export function parseOwnPoints(reply: string): OwnPoints | null {
  const m = String(reply ?? '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  let j: { command?: unknown; develop?: unknown; points?: unknown; rules?: unknown };
  try { j = JSON.parse(m[0]); } catch { return null; }
  const develop = j.develop === true;
  const raw = Array.isArray(j.points) ? j.points as { text?: unknown; develop?: unknown }[] : [];
  const points: CreditPoint[] = raw
    .map((p, i) => ({ id: String.fromCharCode(97 + i), text: String(p.text ?? '').trim(), ...(develop && p.develop ? { develop: String(p.develop).trim() } : {}) }))
    .filter(p => p.text.split(/\s+/).length >= 3)
    .slice(0, 8);
  if (points.length < 2) return null;
  const command = ['describe', 'explain', 'compare', 'suggest'].includes(String(j.command)) ? String(j.command) : 'explain';
  const rules = Array.isArray(j.rules) ? (j.rules as unknown[]).map(r => String(r).trim()).filter(Boolean).slice(0, 2) : [];
  return { points, command, develop, rules };
}

/** One call. null when it fails — the hand-in then says so and nothing is queued. */
export async function writeOwnPoints(own: OwnQuestion): Promise<OwnPoints | null> {
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await anthropic.messages.create({
      model: OWN_POINTS_MODEL,
      max_tokens: 4000,
      messages: [{ role: 'user', content: ownPointsPrompt(own) }],
    });
    return parseOwnPoints(anthropicText(msg));
  } catch (e) {
    console.error('[humanities-own-points]', e instanceof Error ? e.message : e);
    return null;
  }
}
