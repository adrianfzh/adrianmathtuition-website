// 💡 "How to approach it" — the pure half of the per-question hint (23 Sep 2026).
//
// Adrian on the shelf-row version: "It's not very good. And don't have to
// mention Adrian. Too verbose and not clear for students to understand." So a
// hint is now WRITTEN PER QUESTION: three short lines in student words, answer-
// free, produced once and cached on `questions.hint`. The teaching-knowledge
// shelf (method templates + pitfalls) is background the writer reads, never the
// text the student sees. This file holds the prompt and the validator; the
// route (src/app/api/portal/practice/hint) and the photo worker (bot
// scripts/topup-plan-worker.js --insert-gated) do the I/O.

import type { TeachingKnowledge } from './teaching-knowledge';
import { methodsPromptLines, pitfallsPromptLines } from './teaching-knowledge';

export const HINT_MODEL = process.env.PRACTICE_HINT_MODEL || 'claude-sonnet-5';
export const HINT_MAX_LINES = 3;
export const HINT_MAX_LINE_CHARS = 160;

export interface HintQuestion {
  level: string | null;
  topics: string[] | null;
  question_text: string;
  answer?: string | null;
  solution?: string | null;
}

/** The rules the writer follows — shared by the route and the photo worker's prompt. */
export const HINT_RULES = [
  'Write at most three short lines, one idea per line, for a Singapore secondary or JC student.',
  'Say how to START and what to look for — never a result, never a number the student must find, never the final answer.',
  'Plain student words. No names, no "the teacher", no praise, no preamble like "To approach this".',
  'Each line under 160 characters. Inline LaTeX with $…$ is fine for a formula the student should recall.',
  'If the question is a plain one-step exercise with nothing to say, reply with the single word NONE.',
] as const;

export function buildHintPrompt(q: HintQuestion, k: TeachingKnowledge | null): string {
  const shelf: string[] = [];
  if (k?.methods.length) shelf.push(`Background — how this kind of question is usually approached (use it only where it fits THIS question; do not copy it):\n${methodsPromptLines(k.methods)}`);
  if (k?.pitfalls.length) shelf.push(`Common slips on this topic:\n${pitfallsPromptLines(k.pitfalls)}`);
  const key = q.solution || q.answer
    ? `The key (for your eyes only — the hint must not reveal any of it):\n${q.solution || q.answer}`
    : '';
  return [
    `Level: ${q.level || '?'}. Topics: ${(q.topics || []).join(', ') || '?'}.`,
    `Question:\n${q.question_text}`,
    key,
    ...shelf,
    `Write the hint. Rules:\n${HINT_RULES.map(r => `- ${r}`).join('\n')}`,
    'Reply with the lines only, one per line, no bullets, no numbering, no heading.',
  ].filter(Boolean).join('\n\n');
}

/**
 * Turn the writer's reply into the stored hint. Returns '' for NONE, an empty
 * reply, or a reply with no usable line — the caller stores '' so the question
 * is not asked again. Bullets and numbering are stripped, lines capped at 3.
 */
export function normaliseHint(raw: string | null | undefined): string {
  const text = String(raw || '').trim();
  if (!text || /^none\.?$/i.test(text)) return '';
  const lines = text.split(/\r?\n/)
    .map(l => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
    .filter(l => l.length > 0 && !/^(hint|how to approach it)\s*:?$/i.test(l))
    .map(l => (l.length > HINT_MAX_LINE_CHARS ? `${l.slice(0, HINT_MAX_LINE_CHARS - 1).trimEnd()}…` : l))
    .slice(0, HINT_MAX_LINES);
  return lines.join('\n');
}

/** Markdown the practice page renders: one short paragraph per line. */
export function hintMarkdown(hint: string | null | undefined): string {
  const h = String(hint || '').trim();
  if (!h) return '';
  return h.split('\n').map(l => l.trim()).filter(Boolean).join('\n\n');
}
