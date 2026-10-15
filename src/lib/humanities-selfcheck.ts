// The Humanities marker checks itself and improves itself (15 Oct 2026, Adrian: "i want our own marker to self
// aware of whether it is doing a good job and to auto fix or auto improve if required").
//
// The loop (run by /api/cron/humanities-selfcheck, lib/humanities-selfcheck-run.ts), every step on plan:
//  1. CHECK — every real student's marked answer gets one more, independent read by the stronger model,
//     told what we gave and asked whether it was right, which way it was off, and what general rule the
//     marker missed. That is the marker's view of itself: how often a careful second marker agrees.
//  2. LEARN — when three or more misses on one question type name a missed rule within 14 days, a writer
//     drafts ONE general rule line for that type from them.
//  3. TEST — the rule stands in for Adrian only after a test (CLAUDE.md doctrine): the production reader reads
//     the type's seeded answers (their level known by construction) and the missed students' answers (the
//     checker's level), once without the rule and once with it. The rule goes live only if the seeded answers
//     score no worse AND the missed answers score better; otherwise it is dropped.
//  4. LIVE — a live rule is added to that type's marking rules for every new answer (forward only — marked
//     answers are not changed). Adrian gets one Telegram line saying what changed; /admin/humanities-marker
//     turns a rule off.
// Pure helpers here; no I/O.

export const SELFCHECK_DAILY_CAP = 30;
export const LEARN_WINDOW_DAYS = 14;
export const MISSES_TO_LEARN = 3;
export const TEST_SEEDED = 12;
export const TEST_MISSED = 6;

export type AuditVerdict = 'agree' | 'delivered_high' | 'delivered_low';

/** The material the checker sees: the same payload the reader had, as text. */
export interface AuditInput {
  subject: string;
  question: string;
  material: string;
  standard: string;
  answer: string;
  delivered: { lo: number; hi: number; max: number; lift: string | null; points: boolean };
}

export function auditPrompt(a: AuditInput): string {
  const scale = a.delivered.points ? `marks out of ${a.delivered.max}` : `a level from 1 to ${a.delivered.max}`;
  const gave = a.delivered.lo === a.delivered.hi ? `${a.delivered.lo}` : `${a.delivered.lo}–${a.delivered.hi}`;
  return [
    `You check the work of a marker of Singapore secondary ${a.subject} answers. Mark this answer yourself, carefully and independently, then judge the marker.`,
    '',
    'QUESTION', a.question,
    ...(a.material ? ['', 'WHAT CAME WITH THE QUESTION', a.material] : []),
    '', a.delivered.points ? 'THE CREDITABLE POINTS (one mark each; a developed point may earn a second where allowed)' : 'THE LEVEL SCHEME', a.standard,
    '', 'THE STUDENT\'S ANSWER', a.answer,
    '', `THE MARKER GAVE: ${gave} (${scale}).${a.delivered.lift ? ` Its advice to the student: "${a.delivered.lift}"` : ''}`,
    '',
    'Steps:',
    `1. Decide your own ${a.delivered.points ? 'mark' : 'level'} from the ${a.delivered.points ? 'points' : 'scheme'}, as an experienced examiner would. Be neither generous nor harsh.`,
    '2. Compare with what the marker gave.',
    '3. If the marker was wrong, name the ONE general marking rule it failed to follow — a rule that would apply to any answer of this question type, never one about this answer\'s topic. If it was right, missed_rule is null.',
    '',
    'Reply with one JSON object only:',
    `{"level": <your ${a.delivered.points ? 'mark' : 'level'}, a whole number>, "why": "<under 40 words>", "missed_rule": "<one sentence, or null>"}`,
  ].join('\n');
}

export interface AuditResult { level: number; verdict: AuditVerdict; why: string; missedRule: string | null }

/** The checker's reply → its level, how the delivered range compares, and the missed rule. */
export function parseAudit(reply: string | null | undefined, delivered: { lo: number; hi: number; max: number }): AuditResult | null {
  const m = String(reply ?? '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  let j: { level?: unknown; why?: unknown; missed_rule?: unknown };
  try { j = JSON.parse(m[0]); } catch { return null; }
  const level = Number(j.level);
  if (!Number.isInteger(level) || level < 0 || level > delivered.max) return null;
  const lo = Math.min(delivered.lo, delivered.hi), hi = Math.max(delivered.lo, delivered.hi);
  const verdict: AuditVerdict = level < lo ? 'delivered_high' : level > hi ? 'delivered_low' : 'agree';
  const rule = typeof j.missed_rule === 'string' && j.missed_rule.trim() && verdict !== 'agree' ? j.missed_rule.trim().slice(0, 300) : null;
  return { level, verdict, why: String(j.why ?? '').slice(0, 400), missedRule: rule };
}

export interface MissRow { skill: string; verdict: string; missed_rule: string | null; created_at: string; run_id: string }

/** The question types with enough recent misses to learn from, and the misses for each. */
export function typesToLearn(misses: MissRow[], now: number, busySkills: Set<string>): Map<string, MissRow[]> {
  const since = now - LEARN_WINDOW_DAYS * 86_400_000;
  const out = new Map<string, MissRow[]>();
  for (const m of misses) {
    if (m.verdict === 'agree' || !m.missed_rule || Date.parse(m.created_at) < since || busySkills.has(m.skill)) continue;
    out.set(m.skill, [...(out.get(m.skill) ?? []), m]);
  }
  for (const [k, v] of out) if (v.length < MISSES_TO_LEARN) out.delete(k);
  return out;
}

export function draftPrompt(o: { subject: string; typeLabel: string; current: string[]; misses: { question: string; gave: string; should: string; why: string; missedRule: string }[] }): string {
  return [
    `A marker of Singapore secondary ${o.subject} answers keeps getting one question type wrong: "${o.typeLabel}".`,
    '',
    'ITS CURRENT RULES FOR THIS TYPE',
    ...(o.current.length ? o.current.map(r => `- ${r}`) : ['- (none beyond the level scheme)']),
    '',
    'WHERE A CAREFUL CHECKER DISAGREED',
    ...o.misses.map((m, i) => `${i + 1}. Question: ${m.question}\n   The marker gave ${m.gave}; the checker gave ${m.should}. Why: ${m.why}\n   Missed rule: ${m.missedRule}`),
    '',
    'Write ONE new marking rule for this question type that would have fixed most of these, in one plain sentence.',
    '- It must be general: true for any answer of this type, never about a topic, a source or an example in the cases above.',
    '- It must not contradict the current rules or the level scheme, and must not make the marker harsher or softer across the board — only more exact.',
    '- If the cases do not share one fixable cause, reply with rule null.',
    '',
    'Reply with one JSON object only: {"rule": "<the sentence, or null>"}',
  ].join('\n');
}

export function parseDraft(reply: string | null | undefined): string | null {
  const m = String(reply ?? '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const r = (JSON.parse(m[0]) as { rule?: unknown }).rule;
    return typeof r === 'string' && r.trim().split(/\s+/).length >= 5 ? r.trim().slice(0, 300) : null;
  } catch { return null; }
}

export interface TestCase { key: string; kind: 'seeded' | 'missed'; truth: number; base: number | null; patched: number | null }

export interface TestScore { seededBase: number; seededPatched: number; seededN: number; missedBase: number; missedPatched: number; missedN: number; live: boolean }

/** Exact hits per arm; live only when the seeded answers do no worse and the missed answers do better. */
export function scoreTest(cases: TestCase[]): TestScore {
  const hit = (c: TestCase, v: number | null) => (v === c.truth ? 1 : 0);
  const seeded = cases.filter(c => c.kind === 'seeded'), missed = cases.filter(c => c.kind === 'missed');
  const s = {
    seededBase: seeded.reduce((n, c) => n + hit(c, c.base), 0), seededPatched: seeded.reduce((n, c) => n + hit(c, c.patched), 0), seededN: seeded.length,
    missedBase: missed.reduce((n, c) => n + hit(c, c.base), 0), missedPatched: missed.reduce((n, c) => n + hit(c, c.patched), 0), missedN: missed.length,
  };
  return { ...s, live: s.seededN >= 4 && s.seededPatched >= s.seededBase && s.missedPatched > s.missedBase };
}

/** Seeded answers spread across the levels: round-robin by level, up to n. */
export function spreadSample<T extends { truth: number }>(items: T[], n: number): T[] {
  const by = new Map<number, T[]>();
  for (const it of items) by.set(it.truth, [...(by.get(it.truth) ?? []), it]);
  const lanes = [...by.keys()].sort((a, b) => a - b).map(k => by.get(k)!);
  const out: T[] = [];
  for (let i = 0; out.length < n && lanes.some(l => l.length > i); i++) for (const l of lanes) if (l[i] && out.length < n) out.push(l[i]);
  return out;
}

export const auditPct = (agree: number, all: number): string => (all ? `${Math.round((100 * agree) / all)}%` : '—');
