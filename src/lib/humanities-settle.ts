// The belt on a humanities read (SPEC-HUMANITIES.md §The reader on the plan, 8 Oct 2026) — ported
// from the bot's lib/humanities-report.js so the reads can come back from the PLAN queue. Pure.
// The reader reads an answer two or three times; each read is checked here before anything is
// believed, and the reads are settled into ONE level with a range. The rules: a level, never a
// mark in words; every tagged claim is the student's own words, verbatim; one lift; at most two
// gap lines. A point-marked answer (Geography) is counted HERE from the per-point credits.
import type { HumanitiesClaim, HumanitiesReport, PointCredit } from './humanities-report';

// "3/4", "2 marks", "[5]" — a read that speaks in marks is cleaned or refused.
const MARK_RE = /\b\d+\s*\/\s*\d+\b|\b\d+\s*marks?\b|\[\s*\d+\s*\]/i;
export const hasMark = (s: unknown): boolean => MARK_RE.test(String(s || ''));
const flat = (s: unknown): string => String(s || '').replace(/\s+/g, ' ').toLowerCase();
/**
 * Does a line to the student speak in marks? A figure that is IN the question's own material is
 * not a mark for the answer: a source that says pupils "scored 11 marks lower" may be quoted
 * (the full bench, 8 Oct 2026 — every read of s29-q5 was refused for naming that figure).
 */
export function speaksInMarks(s: unknown, material?: string): boolean {
  const text = String(s || '');
  const found = text.match(new RegExp(MARK_RE.source, 'gi'));
  if (!found) return false;
  if (!material) return true;
  const m = flat(material);
  return found.some(f => !m.includes(flat(f)));
}
const clip = (s: unknown, n: number): string => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t; };

/** One read that passed the belt. On a point-marked answer `level` IS the marks, so one rule settles both. */
export interface CleanRead {
  level: number;
  claims: HumanitiesClaim[];
  lift: string;
  gap: string[];
  summary: string | null;
  marks?: number;
  credits?: PointCredit[];
}
export interface Checked { read: CleanRead | null; problems: string[]; dropped: string[] }
type Raw = Record<string, unknown> | null | undefined;
const rec = (x: unknown): Record<string, unknown> => (x && typeof x === 'object' ? x as Record<string, unknown> : {});

/**
 * The reader's reply → its JSON object, or null. Tolerant: the reply may be fenced, or carry a
 * line before or after the object; a trailing comma is forgiven. Anything else is a read that
 * did not parse, and the settle rules ask for another.
 */
export function parseReadReply(text: string | null | undefined): Record<string, unknown> | null {
  const t = String(text ?? '');
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  const tryParse = (slice: string): Record<string, unknown> | null => {
    for (const candidate of [slice, slice.replace(/,\s*([}\]])/g, '$1')]) {
      try {
        const v = JSON.parse(candidate);
        if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
      } catch { /* next */ }
    }
    return null;
  };
  const whole = tryParse(t.slice(a, b + 1));
  if (whole) return whole;
  // A reader that corrects itself writes its object twice ("Correction: … the corrected object:").
  // Take the LAST whole object in the reply.
  const objects: string[] = [];
  let depth = 0, start = -1, inString = false, escaped = false;
  for (let i = a; i <= b; i++) {
    const ch = t[i];
    if (inString) { if (escaped) escaped = false; else if (ch === '\\') escaped = true; else if (ch === '"') inString = false; continue; }
    if (ch === '"' && depth > 0) inString = true;
    else if (ch === '{') { if (depth++ === 0) start = i; }
    else if (ch === '}' && depth > 0 && --depth === 0 && start >= 0) { objects.push(t.slice(start, i + 1)); start = -1; }
  }
  for (const o of objects.reverse()) { const v = tryParse(o); if (v) return v; }
  return null;
}

/** Check one raw read. read is null when it cannot be used (no level, no lift, or it speaks in marks). */
export function validateRead(raw: Raw, { answer, levelsMax, tags, material }: { answer: string; levelsMax: number; tags: string[]; material?: string }): Checked {
  const problems: string[] = [];
  const dropped: string[] = [];
  if (!raw || typeof raw !== 'object') return { read: null, problems: ['not an object'], dropped };
  const level = Number(raw.level);
  if (!Number.isInteger(level) || level < 1 || level > levelsMax) problems.push(`level ${raw.level} is not 1..${levelsMax}`);
  const lift = clip(raw.lift, 260);
  if (!lift) problems.push('no lift');
  else if (speaksInMarks(lift, material)) problems.push('the lift speaks in marks');

  const tagSet = new Set(tags || []);
  const claims: HumanitiesClaim[] = [];
  const text = String(answer || '');
  for (const item of Array.isArray(raw.claims) ? raw.claims : []) {
    const c = rec(item);
    const quote = String(c.quote || '').trim();
    const tag = String(c.tag || '');
    if (!quote || !text.includes(quote)) { dropped.push(`not in the answer: ${clip(quote, 60)}`); continue; }
    if (!tagSet.has(tag)) { dropped.push(`unknown tag ${tag}`); continue; }
    if (claims.some(k => k.quote.includes(quote) || quote.includes(k.quote))) { dropped.push(`overlaps: ${clip(quote, 60)}`); continue; }
    const note = clip(c.note, 200);
    claims.push({ quote, tag, note: note && !speaksInMarks(note, material) ? note : null });
  }
  const gap = (Array.isArray(raw.gap) ? raw.gap : []).map(g => clip(g, 220)).filter(g => g && !speaksInMarks(g, material)).slice(0, 2);
  const summary = clip(raw.summary, 240) || null;
  if (problems.length) return { read: null, problems, dropped };
  return { read: { level, claims, lift, gap, summary }, problems, dropped };
}

export interface Agreement { levels: number[]; lo: number; hi: number; decided: boolean; needsThird: boolean; level: number | null }

/**
 * Settle the reads. Two the same → decided. Two apart → a third is needed.
 * Three with a majority and no read two levels from another → decided at the
 * majority, the range showing the odd one. Anything else → held.
 */
export function agreeReads(reads: { level: number }[]): Agreement {
  const levels = reads.map(r => r.level);
  const lo = Math.min(...levels), hi = Math.max(...levels);
  const base: Agreement = { levels, lo, hi, decided: false, needsThird: false, level: null };
  if (levels.length < 2) return base;
  if (levels.length === 2) {
    if (lo === hi) return { ...base, decided: true, level: lo };
    return { ...base, needsThird: true };
  }
  const counts = new Map<number, number>();
  for (const l of levels) counts.set(l, (counts.get(l) || 0) + 1);
  const [top, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (n >= 2 && hi - lo <= 1) return { ...base, decided: true, level: top };
  return base;
}

/** The read shown to the student: one that sits at the settled level (else the middle one), the most claims winning a tie. */
export function pickShownRead<T extends { level: number; claims: unknown[] }>(reads: T[], level: number | null): T {
  const sorted = [...reads].sort((a, b) => a.level - b.level);
  const target = level != null ? level : sorted[Math.floor(sorted.length / 2)].level;
  const at = reads.filter(r => r.level === target);
  return (at.length ? at : reads).slice().sort((a, b) => b.claims.length - a.claims.length)[0];
}

export function buildReport(reads: CleanRead[], agreement: Agreement, levelsMax: number): HumanitiesReport {
  const shown = pickShownRead(reads, agreement.level);
  return {
    level: agreement.level != null ? agreement.level : shown.level,
    level_lo: agreement.lo, level_hi: agreement.hi, levels_max: levelsMax,
    claims: shown.claims, lift: shown.lift, gap: shown.gap, summary: shown.summary,
  };
}

/**
 * Check one raw points read. read.level IS the marks (0..max), so the same agreeReads settles it.
 * The total is counted from the per-point credits, never taken from the reader's own sum.
 */
export function validatePointsRead(raw: Raw, { answer, points, max, develop, material }: { answer: string; points: { id: string }[]; max: number; develop: boolean; material?: string }): Checked {
  const problems: string[] = [];
  const dropped: string[] = [];
  if (!raw || typeof raw !== 'object') return { read: null, problems: ['not an object'], dropped };
  const ids = new Set((points || []).map(p => String(p.id)));
  const text = String(answer || '');
  const lift = clip(raw.lift, 260);
  if (!lift) problems.push('no lift');
  else if (speaksInMarks(lift, material)) problems.push('the lift speaks in marks');
  const top = develop ? 2 : 1;
  const credits: PointCredit[] = [];
  let others = 0;
  for (const item of Array.isArray(raw.points) ? raw.points : []) {
    const c = rec(item);
    const id = String(c.id || '');
    const credit = Number(c.credit);
    if (!Number.isInteger(credit) || credit < 0 || credit > top) { dropped.push(`credit ${c.credit} on ${id}`); continue; }
    const isOther = id === 'other';
    if (!isOther && !ids.has(id)) { dropped.push(`unknown point ${id}`); continue; }
    if (!isOther && credits.some(k => k.id === id)) { dropped.push(`point ${id} twice`); continue; }
    let quote = String(c.quote || '').trim();
    if (quote && !text.includes(quote)) { dropped.push(`not in the answer: ${clip(quote, 60)}`); quote = ''; }
    // A credited point must be shown in the student's own words; one that cannot be shown is not credited.
    if (credit > 0 && !quote) { dropped.push(`point ${id} credited with no quotation`); continue; }
    if (isOther && credit > 0 && ++others > 2) { dropped.push('more than two unlisted points'); continue; }
    if (isOther && credit === 0) continue;
    const note = clip(c.note, 200);
    credits.push({ id, credit, quote: credit > 0 ? quote : null, note: note && !speaksInMarks(note, material) ? note : null, ...(isOther ? { text: clip(c.text, 160) || null } : {}) });
  }
  const gap = (Array.isArray(raw.gap) ? raw.gap : []).map(g => clip(g, 220)).filter(g => g && !speaksInMarks(g, material)).slice(0, 2);
  const summary = clip(raw.summary, 240) || null;
  if (problems.length) return { read: null, problems, dropped };
  const marks = Math.min(Number(max) || 0, credits.reduce((n, c) => n + c.credit, 0));
  return { read: { level: marks, marks, credits, lift, gap, summary, claims: [] }, problems, dropped };
}

/** The points report: the read at the settled marks (the one crediting the most points on a tie). */
export function buildPointsReport(reads: CleanRead[], agreement: Agreement, max: number): HumanitiesReport {
  const sorted = [...reads].sort((a, b) => a.level - b.level);
  const target = agreement.level != null ? agreement.level : sorted[Math.floor(sorted.length / 2)].level;
  const at = reads.filter(r => r.level === target);
  const credited = (r: CleanRead) => (r.credits ?? []).filter(c => c.credit > 0).length;
  const shown = (at.length ? at : reads).slice().sort((a, b) => credited(b) - credited(a))[0];
  return {
    marking: 'points',
    level: agreement.level != null ? agreement.level : shown.level,
    level_lo: agreement.lo, level_hi: agreement.hi, levels_max: max,
    points: shown.credits ?? [], claims: [], lift: shown.lift, gap: shown.gap, summary: shown.summary,
  };
}

// ── What to do next (the bot's markHumanities loop, as one pure decision) ──
// The reads come back one at a time from a queue, so the loop is a question asked each time a
// run is looked at: wait, ask for one more read, or settle.

export type PassState = { pass: number; state: 'waiting' } | { pass: number; state: 'bad' } | { pass: number; state: 'clean'; read: CleanRead };
export type SettleStep =
  | { do: 'wait' }
  | { do: 'read'; pass: number }
  | { do: 'marked' | 'held'; agreement: Agreement; reads: CleanRead[] }
  | { do: 'failed'; error: string };

/** Reads that may be asked for before two usable ones are in hand (the first two and a retry of each). */
export const MAX_READS_FOR_TWO = 4;
/** Tries at the third, deciding read. */
export const MAX_THIRD_TRIES = 2;

export function nextStep(passes: PassState[]): SettleStep {
  const sorted = [...passes].sort((a, b) => a.pass - b.pass);
  if (!sorted.length) return { do: 'failed', error: 'no reads were queued' };
  if (sorted.some(p => p.state === 'waiting')) return { do: 'wait' };
  const next = sorted[sorted.length - 1].pass + 1;
  const clean = sorted.filter((p): p is Extract<PassState, { state: 'clean' }> => p.state === 'clean');
  const reads = clean.map(p => p.read);
  if (clean.length < 2) {
    return sorted.length < MAX_READS_FOR_TWO ? { do: 'read', pass: next } : { do: 'failed', error: 'fewer than two usable reads' };
  }
  const agreement = agreeReads(reads);
  if (agreement.decided) return { do: 'marked', agreement, reads };
  if (agreement.needsThird) {
    const sinceSecond = sorted.filter(p => p.pass > clean[1].pass).length;
    if (sinceSecond < MAX_THIRD_TRIES) return { do: 'read', pass: next };
  }
  return { do: 'held', agreement, reads };
}

/** Adrian's Telegram line for an answer that was held or could not be read (admin only — it may say marks). */
export function telegramLine({ studentName, skill, report, held, heldReason, error }: { studentName?: string | null; skill: string; report?: HumanitiesReport | null; held?: boolean; heldReason?: string | null; error?: string | null }): string {
  const who = studentName || 'A student';
  if (error) return `📜 Humanities · ${who} · ${skill} · FAILED — ${error}`;
  if (report && report.marking === 'points') {
    const m = report.level_lo === report.level_hi ? `${report.level_lo}` : `${report.level_lo}–${report.level_hi}`;
    return `📜 Humanities · ${who} · ${skill} · ${held ? 'HELD' : 'read'} ${m} of ${report.levels_max} marks${heldReason ? ' — ' + heldReason : ''}`;
  }
  const range = report ? (report.level_lo === report.level_hi ? `L${report.level_lo}` : `L${report.level_lo}–${report.level_hi}`) + ` of ${report.levels_max}` : '';
  return `📜 Humanities · ${who} · ${skill} · ${held ? 'HELD' : 'read'} ${range}${heldReason ? ' — ' + heldReason : ''}`;
}
