// 🧩 The weekly stretch set — SPEC-STRETCH-SET.md (Adrian, 4 Nov 2026: "Yes, build it").
//
// Five things a week, each a different idea, so a student copes with a question
// they have never seen before:
//   1. costume — a recent topic in a NEW costume (the generator's 'unknown-swap' /
//                'diagram-swap' variations, approved by Adrian), else a fresh
//                recent-topic question;
//   2. stretch — an approved Challenge question (the pilot rows once approved, plus
//                the bank's real ones), else Advanced. "What does this remind you of?"
//                is asked before the student starts;
//   3. older   — a topic the student met 3+ weeks ago, lost-marks topics first
//                (interleaving + spacing);
//   4. spot    — an approved 🔍 spot-the-mistake card, the student's own frequent
//                kind of mistake first;
//   5. estimate first — a PROMPT on slot 1 or 3 (rotating weekly): guess the sign,
//                rough size or shape before solving; compared after. Never graded.
//
// PURE (repo testing policy): no I/O. lib/stretch-set-store.ts owns reads/writes.

import { ERROR_KIND_LABEL, isErrorKind, type ErrorKind } from './error-kinds';
import { mathAttemptWrong } from './practice-difficulty';

export type StretchSlot = 'costume' | 'stretch' | 'older' | 'spot';
export const STRETCH_SLOTS: readonly StretchSlot[] = ['costume', 'stretch', 'older', 'spot'];
/** The slots that carry a bank question (the estimate-first prompt rotates over these). */
export const QUESTION_SLOTS: readonly StretchSlot[] = ['costume', 'stretch', 'older'];

/** The new variation kinds the generator writes for slot 1 (gen_meta.variation, gen_meta.kind = 'costume'). */
export const COSTUME_KIND = 'costume';
export const COSTUME_VARIATIONS = ['unknown-swap', 'diagram-swap'] as const;
export type CostumeVariation = (typeof COSTUME_VARIATIONS)[number];

/** A topic counts as "recent" when met within this many days; "older" when last met before it. */
export const RECENT_DAYS = 21;

/** Where a slot's item came from — `why` says it in words for Adrian's preview. */
export type StretchSource =
  | 'costume'          // an approved new-costume question
  | 'recent'           // fallback for slot 1: a fresh question on a recent topic
  | 'challenge'        // an approved Challenge question
  | 'advanced'         // fallback for slot 2
  | 'older-mistake'    // slot 3 from a topic with lost marks
  | 'older'            // slot 3 from a topic met 3+ weeks ago
  | 'any-topic'        // fallback when the student has no history yet
  | 'spot-kind'        // a spot card of the student's own frequent mistake kind
  | 'spot';            // any approved spot card at the student's level

export interface StretchItem {
  slot: StretchSlot;
  source: StretchSource;
  questionId?: string;
  unitId?: string;
  topic: string | null;
  /** One line for Adrian: why this item (admin preview only). */
  why: string;
  /** This item carries the estimate-first prompt this week. */
  estimate?: boolean;
  /** "What does this remind you of?" before starting (the stretch slot). */
  remind?: boolean;
}

export interface StretchGap { slot: StretchSlot; note: string }

// ── weeks ───────────────────────────────────────────────────────────────────

/** The Monday (SGT) of the week holding `sgtDate` (YYYY-MM-DD). */
export function weekStartISO(sgtDate: string): string {
  const d = new Date(`${sgtDate}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

/** A stable week number (weeks since 2026-01-05, a Monday) — rotates the estimate prompt. */
export function weekIndex(weekStart: string): number {
  const base = Date.UTC(2026, 0, 5);
  const t = Date.parse(`${weekStart}T00:00:00Z`);
  return Math.floor((t - base) / (7 * 86_400_000));
}

/**
 * Which question slot carries the estimate-first prompt this week: rotates
 * costume ↔ older. Never the stretch slot — it already asks "what does this
 * remind you of?", and one prompt a card keeps it light.
 */
export const ESTIMATE_SLOTS: readonly StretchSlot[] = ['costume', 'older'];
export function estimateSlotFor(weekStart: string, present: readonly StretchSlot[]): StretchSlot | null {
  const qs = ESTIMATE_SLOTS.filter(s => present.includes(s));
  if (!qs.length) return null;
  const i = ((weekIndex(weekStart) % qs.length) + qs.length) % qs.length;
  return qs[i];
}

/** A deterministic pick from a list for one student-week (no Math.random in a build that must be repeatable). */
export function seededIndex(seed: string, n: number): number {
  if (n <= 0) return 0;
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) % n;
}

// ── topics: what the student has met ─────────────────────────────────────────

const norm = (s: string) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim();
const words = (s: string) => new Set(norm(s).split(' ').filter(w => w.length >= 4));

/**
 * A topic as written somewhere (a lesson log, a paper, a question's tags) → the
 * bank topics of this level it means. Exact first; then "Differentiation" →
 * every "Differentiation (…)"; then a shared long word. [] when nothing fits.
 */
export function matchBankTopics(raw: string, bankTopics: readonly string[]): string[] {
  const r = norm(raw);
  if (!r) return [];
  const exact = bankTopics.filter(t => norm(t) === r);
  if (exact.length) return exact;
  const family = bankTopics.filter(t => norm(t).startsWith(`${r} `) || norm(t.replace(/\s*\(.*\)\s*$/, '')) === r);
  if (family.length) return family;
  const inner = bankTopics.filter(t => { const m = t.match(/\(([^)]+)\)/); return !!m && norm(m[1]) === r; });
  if (inner.length) return inner;
  const w = words(raw);
  if (!w.size) return [];
  return bankTopics.filter(t => [...words(t)].some(x => w.has(x)));
}

/** One sighting of a topic: a lesson, a practice attempt, or a lost mark on a paper. */
export interface TopicEvent {
  topic: string;          // as written at the source
  date: string;           // YYYY-MM-DD (SGT) or an ISO instant
  source: 'lesson' | 'attempt' | 'mistake';
  /** A Notebook mistake still open (dark / light / corrected-but-not-fixed). */
  open?: boolean;
  /** How often it was seen (Notebook seen_count). */
  weight?: number;
}

export interface TopicHistory {
  topic: string;          // the bank topic
  first: string;          // first sighting (date)
  last: string;           // last sighting
  mistakes: number;       // Notebook weight on it
  openMistakes: number;
}

/** Fold every sighting into one line per BANK topic of this level. */
export function topicHistory(events: readonly TopicEvent[], bankTopics: readonly string[]): TopicHistory[] {
  const by = new Map<string, TopicHistory>();
  const cache = new Map<string, string[]>();
  for (const e of events) {
    const date = (e.date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const key = e.topic.trim();
    if (!key) continue;
    let topics = cache.get(key);
    if (!topics) { topics = matchBankTopics(key, bankTopics); cache.set(key, topics); }
    for (const t of topics) {
      const h = by.get(t) ?? { topic: t, first: date, last: date, mistakes: 0, openMistakes: 0 };
      if (date < h.first) h.first = date;
      if (date > h.last) h.last = date;
      if (e.source === 'mistake') {
        h.mistakes += Math.max(1, e.weight ?? 1);
        if (e.open) h.openMistakes += 1;
      }
      by.set(t, h);
    }
  }
  return [...by.values()];
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/** Topics met in the last RECENT_DAYS, most recent first. */
export function recentTopics(hist: readonly TopicHistory[], today: string, days = RECENT_DAYS): string[] {
  return hist.filter(h => daysBetween(h.last, today) < days)
    .sort((a, b) => b.last.localeCompare(a.last) || b.openMistakes - a.openMistakes || a.topic.localeCompare(b.topic))
    .map(h => h.topic);
}

/**
 * Topics FIRST met 3+ weeks ago — learnt a while back (spacing + interleaving).
 * Order: ones not touched in the last 3 weeks first (fading), then lost-marks
 * topics, then the longest-unseen. In exam season a Sec 4 student meets every
 * topic in papers, so "not met since" alone would leave this slot empty.
 */
export function olderTopics(hist: readonly TopicHistory[], today: string, days = RECENT_DAYS): TopicHistory[] {
  const quiet = (h: TopicHistory) => (daysBetween(h.last, today) >= days ? 1 : 0);
  return hist.filter(h => daysBetween(h.first, today) >= days)
    .sort((a, b) => quiet(b) - quiet(a) || b.openMistakes - a.openMistakes || b.mistakes - a.mistakes || a.last.localeCompare(b.last) || a.topic.localeCompare(b.topic));
}

// ── spot the mistake ─────────────────────────────────────────────────────────

/** learning_units subjects a practice level reaches (own level first). */
export const SPOT_REACH: Record<string, readonly string[]> = {
  AM: ['AM', 'EM', 'S2', 'S1'], S3_AM: ['AM', 'EM', 'S2', 'S1'],
  EM: ['EM', 'S2', 'S1'], S3_EM: ['EM', 'S2', 'S1'],
  JC1: ['JC', 'AM', 'EM'], JC2: ['JC', 'AM', 'EM'], JC: ['JC', 'AM', 'EM'],
  S2: ['S2', 'S1'], S1: ['S1'],
};

/** The student's most frequent mistake kinds, most first (Notebook seen_count). */
export function topErrorKinds(mistakes: readonly { error_kind: string | null; seen_count?: number | null }[]): ErrorKind[] {
  const n = new Map<ErrorKind, number>();
  for (const m of mistakes) if (isErrorKind(m.error_kind)) n.set(m.error_kind, (n.get(m.error_kind) ?? 0) + Math.max(1, m.seen_count ?? 1));
  return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([k]) => k);
}

export interface SpotUnitLite { id: string; subject: string; topic: string; error_kind: string | null; origin: string | null }

/**
 * The spot card for this week: approved units in reach of the level, not used in
 * the student's recent sets; the student's frequent kinds first, then a topic
 * they have met, then their own level. Null when nothing is approved in reach.
 */
export function pickSpotForSet(
  levelKey: string,
  units: readonly SpotUnitLite[],
  opts: { kinds: readonly ErrorKind[]; metTopics: readonly string[]; used: ReadonlySet<string>; seed: string },
): { unit: SpotUnitLite; kindMatch: boolean } | null {
  const reach = SPOT_REACH[levelKey] ?? [levelKey];
  const fresh = units.filter(u => reach.includes(u.subject) && !opts.used.has(u.id));
  const pool = fresh.length ? fresh : units.filter(u => reach.includes(u.subject));
  if (!pool.length) return null;
  const met = new Set(opts.metTopics.map(t => norm(t)));
  const metWords = new Set(opts.metTopics.flatMap(t => [...words(t)]));
  const score = (u: SpotUnitLite) => {
    const k = u.error_kind && isErrorKind(u.error_kind) ? opts.kinds.indexOf(u.error_kind) : -1;
    const kindScore = k >= 0 ? 100 - k * 10 : 0;
    const topicScore = met.has(norm(u.topic)) ? 8 : [...words(u.topic)].some(w => metWords.has(w)) ? 4 : 0;
    return kindScore + topicScore + (reach.length - reach.indexOf(u.subject));
  };
  const best = Math.max(...pool.map(score));
  const top = pool.filter(u => score(u) === best).sort((a, b) => a.id.localeCompare(b.id));
  const unit = top[seededIndex(opts.seed, top.length)];
  const k = unit.error_kind && isErrorKind(unit.error_kind) ? opts.kinds.indexOf(unit.error_kind) : -1;
  return { unit, kindMatch: k >= 0 };
}

export function kindLabel(k: string | null | undefined): string {
  return k && isErrorKind(k) ? ERROR_KIND_LABEL[k] : 'mistake';
}

// ── the student's inputs ─────────────────────────────────────────────────────

export interface Prediction { sign?: 'positive' | 'negative' | 'zero'; size?: string; note?: string }

export interface SlotResponse {
  remind?: string;
  prediction?: Prediction;
  /** The student's own "was your guess close?" — the prediction accuracy. */
  predictionClose?: boolean;
  /** Spot card: tapped a line; and whether it was the wrong one. */
  spotPicked?: boolean;
  spotRight?: boolean;
}

const clip = (s: unknown, n: number) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, n) : '');

/** One POST from the student → a clean patch for one slot, or null when it carries nothing usable. */
export function parseResponse(raw: unknown): { slot: StretchSlot; patch: SlotResponse } | null {
  if (!raw || typeof raw !== 'object') return null;
  const b = raw as Record<string, unknown>;
  const slot = STRETCH_SLOTS.find(s => s === b.slot);
  if (!slot) return null;
  const patch: SlotResponse = {};
  if (typeof b.remind === 'string') { const r = clip(b.remind, 200); if (r) patch.remind = r; }
  if (b.prediction && typeof b.prediction === 'object') {
    const p = b.prediction as Record<string, unknown>;
    const pred: Prediction = {};
    if (p.sign === 'positive' || p.sign === 'negative' || p.sign === 'zero') pred.sign = p.sign;
    const size = clip(p.size, 40); if (size) pred.size = size;
    const note = clip(p.note, 120); if (note) pred.note = note;
    if (Object.keys(pred).length) patch.prediction = pred;
  }
  if (typeof b.predictionClose === 'boolean') patch.predictionClose = b.predictionClose;
  if (slot === 'spot' && typeof b.spotRight === 'boolean') { patch.spotPicked = true; patch.spotRight = b.spotRight; }
  return Object.keys(patch).length ? { slot, patch } : null;
}

/** Merge a patch in; a spot answer and a prediction are kept from the FIRST time (no second guesses). */
export function mergeResponse(prev: SlotResponse | undefined, patch: SlotResponse): SlotResponse {
  const out: SlotResponse = { ...(prev ?? {}) };
  if (patch.remind && !out.remind) out.remind = patch.remind;
  if (patch.prediction && !out.prediction) out.prediction = patch.prediction;
  if (typeof patch.predictionClose === 'boolean') out.predictionClose = patch.predictionClose;
  if (patch.spotPicked && !out.spotPicked) { out.spotPicked = true; out.spotRight = patch.spotRight; }
  return out;
}

export function predictionLine(p: Prediction | undefined): string {
  if (!p) return '';
  const bits: string[] = [];
  if (p.sign) bits.push(p.sign);
  if (p.size) bits.push(`about ${p.size}`);
  if (p.note) bits.push(p.note);
  return bits.join(', ');
}

// ── results ──────────────────────────────────────────────────────────────────

export interface AttemptLite { questionId: string; attemptedAt: string; verdict: string | null; score: number | null; outOf: number | null; helpSteps: number }

export interface SlotResult { tried: boolean; rightFirstTime: boolean | null }

/** Tried + right at the first attempt, from the student's attempts on that question since the set was built. */
export function slotResult(questionId: string | undefined, attempts: readonly AttemptLite[]): SlotResult {
  if (!questionId) return { tried: false, rightFirstTime: null };
  const mine = attempts.filter(a => a.questionId === questionId).sort((a, b) => a.attemptedAt.localeCompare(b.attemptedAt));
  if (!mine.length) return { tried: false, rightFirstTime: null };
  const a = mine[0];
  return { tried: true, rightFirstTime: !mathAttemptWrong({ student: '', questionId: a.questionId, attemptedAt: a.attemptedAt, verdict: a.verdict, score: a.score, outOf: a.outOf, helpSteps: a.helpSteps }) };
}

export interface SetProgress { total: number; done: number; rightFirst: number; predictions: number; predictionsClose: number }

export function setProgress(items: readonly StretchItem[], results: Record<string, SlotResult>, responses: Record<string, SlotResponse>): SetProgress {
  let done = 0, rightFirst = 0, predictions = 0, predictionsClose = 0;
  for (const it of items) {
    const r = responses[it.slot];
    if (it.slot === 'spot') { if (r?.spotPicked) { done++; if (r.spotRight) rightFirst++; } }
    else {
      const res = results[it.slot];
      if (res?.tried) { done++; if (res.rightFirstTime) rightFirst++; }
    }
    if (r?.prediction) { predictions++; if (r.predictionClose) predictionsClose++; }
  }
  return { total: items.length, done, rightFirst, predictions, predictionsClose };
}

// ── words the student reads ──────────────────────────────────────────────────

export const SLOT_TITLE: Record<StretchSlot, { emoji: string; title: string; blurb: string }> = {
  costume: { emoji: '🎭', title: 'Same maths, new look', blurb: 'A topic from the last few weeks, asked a different way.' },
  stretch: { emoji: '🧗', title: 'Stretch question', blurb: 'A harder one. Take your time.' },
  older: { emoji: '🔁', title: 'From a while back', blurb: 'A topic you met a few weeks ago — see if it stuck.' },
  spot: { emoji: '🔍', title: 'Spot the mistake', blurb: 'Someone else’s working. Find the wrong line.' },
};

/** The bank's final answer for the "your guess vs the answer" line (shown only after an attempt). */
export function answerText(q: { answer?: string | null; parts?: unknown }): string {
  if (typeof q.answer === 'string' && q.answer.trim()) return q.answer.trim().slice(0, 300);
  const out: string[] = [];
  const walk = (ps: unknown) => {
    if (!Array.isArray(ps)) return;
    for (const p of ps) {
      if (!p || typeof p !== 'object') continue;
      const r = p as Record<string, unknown>;
      if (typeof r.answer === 'string' && r.answer.trim()) out.push(`${typeof r.label === 'string' ? `(${r.label.replace(/[()]/g, '')}) ` : ''}${r.answer.trim()}`);
      walk(r.parts ?? r.subparts);
    }
  };
  walk(q.parts);
  return out.join('; ').slice(0, 300);
}
