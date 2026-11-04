// 🔀 Another way to solve this — SPEC-ANOTHER-WAY.md.
//
// Adrian, 4 Nov 2026: "can we build #5 too > but as a dropdown (closed by default), so
// students can click or tap if they want?" Under a worked solution, a CLOSED drop-down
// shows a genuinely different second method and ONE plain line on which is better here
// and why. The main solution stays one method (the marker's rule is untouched).
//
// Every row is written by a plan-billed author agent, re-solved by a BLIND checker that
// must reach the bank's own answer by the named second method, saved as 'pending', and
// reaches a student only after Adrian approves it on /admin/another-way.
//
// PURE (repo testing policy): no I/O. Scripts and routes own reads and writes.

import { BANNED_WORDS } from './spot-error';

/** What the author agent hands in for one bank question. */
export interface AltDraft {
  question_id: string;
  /** Short name of the bank solution's method, e.g. "Substitution". */
  main_method: string;
  /** Short name of the second method, e.g. "Elimination". */
  alt_method: string;
  /** House-style working: one step a line, ends with a bold **Answer:** line. */
  working: string;
  /** ONE plain line: which method is better HERE, and why. */
  better: string;
  /** The final answer the second method reaches. */
  alt_answer: string;
}

/** The blind checker's verdict (a fresh agent that never saw the draft's working). */
export interface AltChecks {
  /** The checker, solving by the named second method, reached the bank's answer. */
  same: boolean;
  /** The checker's own final answer. */
  solver_answer: string;
  /** The draft's working is right line by line. */
  working_ok: boolean;
  /** The second method is genuinely different (not the same method in another order). */
  different: boolean;
  /** The second method is in the O-Level E Math / A Math (or H2) syllabus. */
  in_syllabus: boolean;
  notes?: string;
}

/** A row as the student surfaces read it. */
export interface AltRow {
  question_id: string;
  main_method: string;
  alt_method: string;
  working: string;
  better: string;
  status: string;
  checks: Partial<AltChecks> | null;
}

/** What a student is sent — nothing about checks or status. */
export interface AltView {
  method: string;
  mainMethod: string;
  working: string;
  better: string;
  /** Adrian's admin preview only: approval still waiting (never set for a student). */
  waiting?: boolean;
}

/** Words that say "the same method again" — a second method must be a different idea. */
const SAME_METHOD = /\b(same method|in (a |the )?different order|just reorder|swap the order)\b/i;

/** Marker's material and names that never reach a student (CLAUDE.md readability + the app-never-names rules). */
const PLUMBING = /\[(?:[MAB]\d|SC\d)|\bmark scheme\b|\b(?:claude|opus|sonnet|haiku|fable|gemini|minimax|ai model)\b|\badrian\b/i;

/** Extra casual words for this surface, on top of spot-error's list (Adrian: plain Singapore-classroom wording). */
const CASUAL = ['trick', 'magic', 'super', 'awesome', 'cool', 'easy peasy', 'neat', 'nifty', 'boom', 'voila', 'hack', 'shortcut'];

/** The better-line must be one sentence of at most this many characters. */
export const BETTER_MAX = 200;

function hasWord(text: string, w: string): boolean {
  return new RegExp(`(^|[^a-z])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`, 'i').test(text);
}

/** Everything wrong with a draft, as plain lines. Empty = fit to save as 'pending'. */
export function altDraftProblems(d: AltDraft): string[] {
  const out: string[] = [];
  const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  if (!/^[0-9a-f-]{36}$/i.test(s(d.question_id))) out.push('question_id is not a uuid');
  const main = s(d.main_method), alt = s(d.alt_method), working = s(d.working), better = s(d.better), ans = s(d.alt_answer);
  if (!main) out.push('main_method missing');
  if (!alt) out.push('alt_method missing');
  if (main && alt && main.toLowerCase() === alt.toLowerCase()) out.push('the two methods have the same name');
  if (alt.length > 60) out.push('alt_method name is too long (a short name, e.g. "Elimination")');
  if (!working) out.push('working missing');
  else {
    if (!/\*\*Answer:/.test(working)) out.push('working must end with a bold **Answer:** line');
    if (working.split('\n').filter(l => l.trim()).length < 3) out.push('working is too short to be a method');
  }
  if (!better) out.push('better line missing');
  else {
    if (better.length > BETTER_MAX) out.push(`better line is longer than ${BETTER_MAX} characters`);
    if (better.includes('\n')) out.push('better line must be one line');
    if ((better.match(/[.!?](\s|$)/g) ?? []).length > 1) out.push('better line must be ONE sentence');
    if (!/\b(because|since|as)\b/i.test(better)) out.push('better line must say why ("… because …")');
  }
  if (!ans) out.push('alt_answer missing');
  const all = `${alt}\n${working}\n${better}`;
  if (SAME_METHOD.test(all)) out.push('reads as the same method in another order');
  if (PLUMBING.test(all)) out.push('mark codes, "mark scheme", a model name or a name in student text');
  for (const w of [...BANNED_WORDS, ...CASUAL]) if (hasWord(all, w)) out.push(`casual word "${w}"`);
  return out;
}

/** Why the blind check refuses a draft (empty = passed). */
export function checkProblems(c: Partial<AltChecks> | null | undefined): string[] {
  if (!c) return ['no blind check'];
  const out: string[] = [];
  if (c.same !== true) out.push(`blind solve did not reach the bank answer (${c.solver_answer ?? '—'})`);
  if (c.working_ok !== true) out.push('working has a wrong line');
  if (c.different !== true) out.push('not a genuinely different method');
  if (c.in_syllabus !== true) out.push('method is out of syllabus');
  return out;
}

/** May a student see this row? Approved by Adrian AND the blind check passed. */
export function altServable(row: Pick<AltRow, 'status' | 'checks'> | null | undefined): boolean {
  return !!row && row.status === 'approved' && checkProblems(row.checks).length === 0;
}

/**
 * The student's view of a servable row, or null. `preview` = Adrian's admin cookie: a WAITING row
 * whose blind check passed shows too, tagged `waiting`, so he can judge it where students will see it.
 */
export function altView(row: AltRow | null | undefined, preview = false): AltView | null {
  if (!row) return null;
  const waiting = preview && row.status === 'pending' && checkProblems(row.checks).length === 0;
  if (!waiting && !altServable(row)) return null;
  return {
    method: row.alt_method.trim(), mainMethod: row.main_method.trim(), working: row.working.trim(), better: row.better.trim(),
    ...(waiting ? { waiting: true } : {}),
  };
}
