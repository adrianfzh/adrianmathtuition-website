// 🔍 Spot the error from REAL marked mistakes — SPEC-SPOT-ERROR.md.
//
// Adrian, 4 Nov 2026: "we need to build this". A student learns as much from
// finding someone else's wrong line as from re-doing their own, so the marker's
// per-line verdicts (paper_marking_runs.result_json) become `autopsy` learning
// units — the format that already existed for hand-written ones (learn-types.ts).
//
// PRIVACY is the whole design (these are other students' mistakes):
//   • the harvester reads ONLY the typed line data and the printed question —
//     never the photos, the student's name / id / label, or any free-text note;
//   • a brief carries no run id (only an opaque key, a hash, for de-duplication);
//   • the unit a student sees is RE-WRITTEN by an author agent: new numbers, new
//     context, the SAME mistake (re-skin). `noveltyProblems` refuses a draft that
//     copies a line or a distinctive number from its source;
//   • every unit lands as status 'pending' and reaches nobody until Adrian
//     approves it on /admin/spot-error.
//
// PURE (repo testing policy): no I/O. The scripts and routes own reads/writes.

import { createHash } from 'node:crypto';
import { isErrorKind, type ErrorKind } from './error-kinds';
import type { AutopsyPayload } from './learn-types';

/** `payload.origin` on every unit this pipeline writes — how the review list and the picker find them. */
export const SPOT_ORIGIN = 'spot-error';

/** Where a spot-error unit came from. 'marked' = re-skinned from a marked paper; 'real-world' = hand-made from a video / article. */
export type SpotSource = 'marked' | 'real-world';

/** The autopsy payload plus the fields this pipeline adds. Everything here may reach a student — nothing identifying. */
export interface SpotPayload extends AutopsyPayload {
  origin: typeof SPOT_ORIGIN;
  source: SpotSource;
  /** The mistake's kind (error-kinds.ts). Real-world units use the closest one ('arithmetic' / 'concept'). */
  error_kind: ErrorKind;
  /** Opaque de-dup key (hash of the source); never reversible to a run without the database. */
  key: string;
}

/**
 * The kinds worth a card from a MARKED paper: a mistake of METHOD or
 * UNDERSTANDING on a visible line (Adrian, 4 Nov 2026: "copying the formula is
 * not a good choice for spot-error (there is no need to practice copying the
 * formula)" … "the spot errors for E Math seems too easy"). So never 'transfer'
 * (copied wrongly), 'rounding' or 'arithmetic' (calculator / one-step slips),
 * nor 'incomplete', 'misread', 'units', 'keywords'. 'careless' stays only for a
 * slip inside a method (a dropped term, a lost factor) — the author judges that.
 */
export const SPOT_KINDS: readonly ErrorKind[] = ['concept', 'sign', 'careless'];

/** Real-world cards (a video's or an article's slip) may also be plain arithmetic. */
export const REAL_WORLD_KINDS: readonly ErrorKind[] = ['concept', 'sign', 'careless', 'arithmetic'];

/**
 * Casual or dramatic words a Singapore teacher would not use on a worksheet
 * (Adrian, 4 Nov 2026: "don't put words like 'loses' -> it's not how
 * singaporean teachers speak"). Titles are plain: "Spot the error: standard form".
 */
export const BANNED_WORDS = ['loses', 'lose', 'lost a', 'blows up', 'sneaks', 'sneaky', 'giveaway', 'quietly', 'trap', 'oops', 'sneak', 'joining'];

/** An E Math card from a marked paper must be a multi-step question: at least this many working lines. */
export const EM_MIN_LINES = 4;

export function isSpotPayload(p: unknown): p is SpotPayload {
  return !!p && typeof p === 'object' && (p as Record<string, unknown>).origin === SPOT_ORIGIN;
}

// ---------------------------------------------------------------------------
// Harvest — marked runs → anonymous briefs for the author agent
// ---------------------------------------------------------------------------

type Json = Record<string, unknown>;
const rec = (v: unknown): Json | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : null);
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** One harvested mistake, stripped to what an author needs. No ids, names, notes or photos. */
export interface SpotBrief {
  /** Opaque: sha256(runId|question) cut to 16 hex. */
  key: string;
  level: string | null;
  topic: string | null;
  error_kind: ErrorKind;
  /** The printed question (exam text, not the student's). */
  prompt: string;
  /** The student's working, re-typed by the marker: one line each. */
  lines: { text: string; wrong: boolean }[];
  /** 1-based index of the one wrong line. */
  wrong_line: number;
  /** The marker's correction for that line. */
  correction: string | null;
  /** The marker's one-line reason for the lost marks, if any. */
  reason: string | null;
  /** How common this kind is across the harvest — the ranking signal. */
  kind_count?: number;
}

export function briefKey(runId: string, question: string): string {
  return createHash('sha256').update(`${runId}|${question}`).digest('hex').slice(0, 16);
}

/** A run subject the harvest reads: maths only (science "lines" are sentences, not working). */
function isMathRun(subject: unknown): boolean {
  const s = str(subject).toLowerCase();
  return s === '' || s === 'math' || s === 'maths';
}

/**
 * The good candidates in one run: exactly ONE wrong line that is not a
 * knock-on of an earlier one, 3–8 readable lines, a kind worth a card, and a
 * printed question to re-skin. Adrian's own reading of the kind wins.
 */
export function briefsFromRun(run: { id: string; subject?: unknown; result_json: unknown }): SpotBrief[] {
  if (!isMathRun(run.subject)) return [];
  const rj = rec(run.result_json);
  if (!rj || !isMathRun(rj.subject)) return [];
  const results = Array.isArray(rj.results) ? rj.results : [];
  const out: SpotBrief[] = [];
  for (const raw of results) {
    const q = rec(raw);
    const mo = rec(q?.marking_output);
    if (!q || !mo) continue;
    const lines = (Array.isArray(mo.lines) ? mo.lines : [])
      .map(rec)
      .filter((l): l is Json => !!l && l.is_crossed_out !== true && !!str(l.transcription_plain));
    if (lines.length < 3 || lines.length > 8) continue;
    const wrongAt = lines
      .map((l, i) => (l.verdict === 'wrong' && l.follows_wrong !== true ? i : -1))
      .filter(i => i >= 0);
    if (wrongAt.length !== 1) continue;
    const w = lines[wrongAt[0]];
    const override = rec(q.triage_override);
    const kind = isErrorKind(override?.error_kind) ? override!.error_kind : w.error_type;
    if (!isErrorKind(kind) || !SPOT_KINDS.includes(kind)) continue;
    const question = rec(mo.question);
    const prompt = str(question?.prompt);
    if (prompt.length < 20) continue;
    // Sketches and graph reads are described in words, not written as working —
    // they cannot be laid out as lines to spot.
    if (lines.some(l => /^sketch:/i.test(str(l.transcription_plain)))) continue;
    const meta = rec(mo.meta);
    const parts = Array.isArray(mo.parts) ? mo.parts.map(rec) : [];
    const reason = parts.map(p => str(p?.error_summary) || str(p?.gap)).find(Boolean) || null;
    out.push({
      key: briefKey(run.id, str(q.question_number)),
      level: str(meta?.level_detected) || null,
      topic: str(meta?.topic_detected) || null,
      error_kind: kind,
      prompt,
      lines: lines.map((l, i) => ({ text: str(l.transcription_plain), wrong: i === wrongAt[0] })),
      wrong_line: wrongAt[0] + 1,
      correction: str(rec(w.correction)?.text_plain) || null,
      reason,
    });
  }
  return out;
}

/**
 * Rank: the most frequent kinds first (Adrian: "prefer frequent mistakes"),
 * but spread across kinds and topics so a batch is not twenty rounding slips.
 * `skip` = keys already turned into units.
 */
export function rankBriefs(briefs: SpotBrief[], limit: number, skip: ReadonlySet<string> = new Set()): SpotBrief[] {
  const fresh = briefs.filter(b => !skip.has(b.key));
  const count = new Map<string, number>();
  for (const b of fresh) count.set(b.error_kind, (count.get(b.error_kind) ?? 0) + 1);
  // Round-robin over kinds in frequency order; inside a kind, one per topic first.
  const kinds = [...count.keys()].sort((a, b) => count.get(b)! - count.get(a)!);
  const queues = new Map<string, SpotBrief[]>();
  for (const k of kinds) {
    const own = fresh.filter(b => b.error_kind === k);
    const seenTopic = new Set<string>();
    const first: SpotBrief[] = [], rest: SpotBrief[] = [];
    for (const b of own) {
      const t = (b.topic ?? '').toLowerCase();
      (seenTopic.has(t) ? rest : first).push(b);
      seenTopic.add(t);
    }
    queues.set(k, [...first, ...rest]);
  }
  const out: SpotBrief[] = [];
  while (out.length < limit && [...queues.values()].some(q => q.length)) {
    for (const k of kinds) {
      const b = queues.get(k)!.shift();
      if (b) out.push({ ...b, kind_count: count.get(k) });
      if (out.length >= limit) break;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Draft checks — run by the insert script before anything is written
// ---------------------------------------------------------------------------

export interface SpotDraft {
  subject: string;
  topic: string;
  title: string;
  payload: SpotPayload;
}

const MAX_LINE = 400;

/** Shape problems with a draft. Empty = fine. */
export function draftProblems(d: SpotDraft, spineTopics: ReadonlySet<string>): string[] {
  const out: string[] = [];
  const p = d.payload;
  if (!spineTopics.has(`${d.subject}|${d.topic}`)) out.push(`topic "${d.subject} / ${d.topic}" is not in topic_spine`);
  if (!d.title?.trim()) out.push('title missing');
  if (!p || p.origin !== SPOT_ORIGIN) out.push(`payload.origin must be "${SPOT_ORIGIN}"`);
  if (p?.source !== 'marked' && p?.source !== 'real-world') out.push('payload.source must be marked | real-world');
  const kinds = p?.source === 'real-world' ? REAL_WORLD_KINDS : SPOT_KINDS;
  if (!isErrorKind(p?.error_kind) || !kinds.includes(p.error_kind)) out.push(`error_kind "${p?.error_kind}" is not a spot kind (method or understanding only — no copying, rounding or calculator slips)`);
  if (!/^Spot the error: [a-z0-9]/i.test(d.title ?? '')) out.push('title must read "Spot the error: <topic in plain words>"');
  if (p?.source === 'marked' && d.subject === 'EM' && (p.working?.length ?? 0) < EM_MIN_LINES) out.push(`E Math cards need a multi-step question (at least ${EM_MIN_LINES} working lines)`);
  if (!/^[0-9a-z-]{6,40}$/.test(p?.key ?? '')) out.push('key missing or malformed');
  if (!str(p?.problem_md)) out.push('problem_md missing');
  if (!Array.isArray(p?.working) || p.working.length < 2 || p.working.length > 8) out.push('working must have 2–8 lines');
  else if (p.working.some(l => !str(l) || l.length > MAX_LINE)) out.push('a working line is empty or too long');
  if (!Number.isInteger(p?.wrong_line) || p.wrong_line < 1 || p.wrong_line > (p?.working?.length ?? 0)) out.push('wrong_line out of range');
  if (!str(p?.why_md)) out.push('why_md missing');
  if (!str(p?.fix_md)) out.push('fix_md missing');
  // Never a name, never a pointer back to the script.
  const all = [p?.problem_md, ...(p?.working ?? []), p?.why_md, p?.fix_md].join('\n');
  if (/\b(student|your friend|classmate|he wrote|she wrote)\b/i.test(all)) out.push('text points at a person — keep it to "this working"');
  if (/\bAdrian\b/.test(all)) out.push('never name the tutor in student text');
  const lower = `${d.title}\n${all}`.toLowerCase();
  const casual = BANNED_WORDS.filter(w => new RegExp(`\\b${w}\\b`).test(lower));
  if (casual.length) out.push(`casual wording a teacher would not use: ${casual.join(', ')}`);
  return out;
}

/** Numbers too common to identify anything (small integers, round figures, angle constants). */
const COMMON = new Set(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '100', '1000', '180', '360', '90', '0.5', '20', '50', '25', '60', '30', '45']);

/** The numbers in a text, normalised ("1,000" → "1000", "0.6280" → "0.628"). */
export function numbersIn(text: string): string[] {
  const out: string[] = [];
  for (const m of text.replace(/(\d),(\d{3})/g, '$1$2').matchAll(/\d+(?:\.\d+)?/g)) {
    let n = m[0];
    if (n.includes('.')) n = n.replace(/0+$/, '').replace(/\.$/, '');
    out.push(n);
  }
  return out;
}

const norm = (s: string) => s.toLowerCase().replace(/\$|\\[a-z]+|[{}\s]/g, '');
const words = (s: string) => s.toLowerCase().replace(/\$[^$]*\$/g, ' ').match(/[a-z]+/g) ?? [];

// Seven words, not five: stock exam phrases ("correct to 4 significant figures",
// "show that the triangles are similar") are not copying.
function shingles(s: string, n = 7): Set<string> {
  const w = words(s);
  const out = new Set<string>();
  for (let i = 0; i + n <= w.length; i++) out.add(w.slice(i, i + n).join(' '));
  return out;
}

/**
 * Is the draft a RE-WRITE, not a copy? Refuses: a working line equal to a
 * source line; any distinctive source number (not in COMMON) reused anywhere;
 * seven words in a row copied from the source question. Empty = fine.
 */
export function noveltyProblems(d: SpotDraft, src: Pick<SpotBrief, 'prompt' | 'lines'>): string[] {
  const out: string[] = [];
  const srcLines = new Set(src.lines.map(l => norm(l.text)));
  d.payload.working.forEach((l, i) => { if (srcLines.has(norm(l))) out.push(`working line ${i + 1} is copied from the source`); });
  const srcNums = new Set([src.prompt, ...src.lines.map(l => l.text)].flatMap(numbersIn).filter(n => !COMMON.has(n)));
  const draftText = [d.payload.problem_md, ...d.payload.working, d.payload.why_md, d.payload.fix_md].join(' ');
  const reused = [...new Set(numbersIn(draftText).filter(n => srcNums.has(n)))];
  if (reused.length) out.push(`reuses the source's numbers: ${reused.join(', ')}`);
  const srcSh = shingles(src.prompt);
  const copied = [...shingles(d.payload.problem_md)].filter(s => srcSh.has(s));
  if (copied.length) out.push(`copies the question's wording: "${copied[0]}"`);
  return out;
}

// ---------------------------------------------------------------------------
// The Notebook link — which approved card goes with a mistake
// ---------------------------------------------------------------------------

/** Paper subject (portal-subjects) → the learning_units subjects a student of it may be shown. */
const SUBJECT_REACH: Record<string, readonly string[]> = {
  'A Math': ['AM', 'EM', 'S2', 'S1'],
  'E Math': ['EM', 'S2', 'S1'],
  'H2 Math': ['JC', 'AM', 'EM'],
};

export interface SpotUnitRef { id: string; subject: string; topic: string; error_kind: string }

const topicWords = (t: string) => new Set(t.toLowerCase().match(/[a-z]{4,}/g) ?? []);

/**
 * The card for one Notebook mistake: same kind, a subject the student's paper
 * reaches, and — when one shares a topic word ("Trigonometry") — that one.
 * Null when nothing fits: no card beats an off-level one.
 */
export function pickSpotUnit(
  mistake: { error_kind: string | null; topic: string | null; subject: string | null },
  units: readonly SpotUnitRef[],
): SpotUnitRef | null {
  if (!mistake.error_kind || !mistake.subject) return null;
  const reach = SUBJECT_REACH[mistake.subject];
  if (!reach) return null;
  const fit = units.filter(u => u.error_kind === mistake.error_kind && reach.includes(u.subject));
  if (!fit.length) return null;
  const want = topicWords(mistake.topic ?? '');
  const score = (u: SpotUnitRef) => {
    const shared = [...topicWords(u.topic)].some(w => want.has(w)) ? 10 : 0;
    return shared + (reach.length - reach.indexOf(u.subject)); // own level first
  };
  return [...fit].sort((a, b) => score(b) - score(a) || a.id.localeCompare(b.id))[0];
}
