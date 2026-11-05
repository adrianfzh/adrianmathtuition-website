// The SPEAKING PARTNER for oral Part 2, Spoken Interaction (5 Nov 2026, Adrian: "we can do the
// oral part now for english" → "Yes, build it"). SPEC-ENGLISH-ORAL-LISTENING.md §Speaking partner.
//
// The real exam is a discussion: the examiner listens, then asks about what the candidate just
// said. So Part 2 is taken in turns, like voice notes: each of the set's prompts (turn 0, 2, 4 —
// read from the recorded MP3) is followed by ONE question that reacts to the answer (turn 1, 3, 5
// — written on the spot, read aloud by the same voice). Six answers, about eight minutes.
//
// Pure: the turns, the follow-up prompt, its parser, the stand-in questions. The I/O half (the
// model call and the voice) is lib/english-oral-store.ts.
import type { OralSet } from './english-oral';

export interface PartnerAnswer { q: number; said?: string | null; heard?: string; followUp?: string | null }

/** Each set prompt is followed by one reacting question. */
export const turnCount = (s: Pick<OralSet, 'interaction'>): number => s.interaction.length * 2;
export const isFollowUpTurn = (q: number): boolean => q % 2 === 1;
/** The set prompt behind a turn (0, 1, 2). */
export const mainIndex = (q: number): number => Math.floor(q / 2);

/** What was asked at every turn. A follow-up not written yet is ''. */
export function askedPrompts(s: Pick<OralSet, 'interaction'>, answers: PartnerAnswer[]): string[] {
  return Array.from({ length: turnCount(s) }, (_, q) => {
    if (!isFollowUpTurn(q)) return s.interaction[mainIndex(q)];
    return answers.find(a => a.q === q - 1)?.followUp ?? '';
  });
}

/** Is this a partner attempt (six turns), or one made before 5 Nov 2026 with three fixed prompts? */
export const isPartnerAttempt = (a: { part: string; status: string; answers: PartnerAnswer[] }): boolean =>
  a.part === 'interaction' && (a.status === 'recording' || a.answers.some(x => !!x.followUp));

const clip = (t: string, n: number): string => (t.length > n ? t.slice(0, n) + ' …' : t);

/** The follow-up writer's prompt: the topic, the talk so far, the answer just given. */
export function buildFollowUpPrompt(s: Pick<OralSet, 'scene' | 'interaction'>, talk: { asked: string; said: string }[]): string {
  const so = talk.map((t, i) => `${i === talk.length - 1 ? 'LAST QUESTION' : 'QUESTION'}: ${t.asked}\nSTUDENT: ${clip(t.said.trim() || '(nothing)', 2500)}`).join('\n\n');
  const later = s.interaction.slice(mainIndex(talk.length - 1) + 1);
  return `You are the examiner in a practice for the Singapore O-Level English oral exam, Part 2 (Spoken Interaction): a discussion with a Secondary 4 student on a topic linked to a picture. The student's words were turned into text from speech.

THE PICTURE (in words)
${s.scene}

THE DISCUSSION SO FAR
${so}
${later.length ? `\nQUESTIONS STILL TO COME (do not ask these yet)\n${later.join('\n')}\n` : ''}
Write what you say next: ONE follow-up question that reacts to what the student JUST said, the way a good examiner keeps a discussion going.
- Pick up something specific they said (an idea, a claim, an example) and ask them to go further: a reason, an example from their own life, the other side, what would happen if, who should act and how.
- If they said very little or went off the question, ask the last question again more simply, or ask for one example.
- You may start with a few natural words ("I see.", "That's an interesting point."), at most 6 words. No praise, no feedback, no corrections, never mention grammar or marks.
- Spoken English, plain words a 15-year-old knows. The whole reply 35 words at most, ending with one question mark.
- Never give a name, never say what you are, never mention a computer, an app, a recording or a tutor.
- Keep to the topic. No questions about the student's family problems, health, religion, race or politics.

Also decide: is the student saying that THEY THEMSELVES are at risk right now (thinking of hurting themselves, being hurt or abused, unsafe at home, being bullied)? Discussing the topic, other people or a story is not at risk.

Reply with one JSON object and nothing else:
{"risk": <true or false>, "say": "<what you say next>"}`;
}

// Topic words stay allowed (a question may be about teachers, apps or computers); what may not appear is a name or what the partner is.
const NAMED = /\b(claude|opus|sonnet|haiku|fable|gemini|minimax|chatgpt|gpt|openai|anthropic|language model|chatbot|adrian|as an ai|i am an ai|i'm an ai)\b/i;
const FEEDBACK = /\b(grammar|your mistakes?|well done|good job|great answer|excellent answer|your marks?)\b/i;

/** The writer's reply → the words the partner says, checked. Null = not usable (a stand-in is asked). */
export function parseFollowUp(text: string): { say: string | null; risk: boolean | null } {
  const i = text.indexOf('{'); const j = text.lastIndexOf('}');
  let o: Record<string, unknown> | null = null;
  if (i >= 0 && j > i) { try { o = JSON.parse(text.slice(i, j + 1)) as Record<string, unknown>; } catch { o = null; } }
  if (!o) return { say: null, risk: null };
  const risk = typeof o.risk === 'boolean' ? o.risk : null;
  const say = typeof o.say === 'string' ? o.say.replace(/\s+/g, ' ').trim() : '';
  const ok = say.length >= 12 && say.length <= 260 && say.endsWith('?') && (say.match(/\?/g) ?? []).length <= 2
    && (say.match(/\S+/g) ?? []).length <= 45 && !NAMED.test(say) && !FEEDBACK.test(say);
  return { say: ok ? say : null, risk };
}

/** Asked when the writer is down or its reply fails the checks — the practice never stops on it. */
export const STAND_IN_FOLLOW_UPS = [
  'Can you give me an example from your own life?',
  'Why do you think so?',
  'Some people would disagree with you. What would you say to them?',
  'What could young people like you do about this?',
] as const;
export const standInFollowUp = (q: number): string => STAND_IN_FOLLOW_UPS[mainIndex(q) % STAND_IN_FOLLOW_UPS.length];
