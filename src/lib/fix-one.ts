// "Fix one" on the marked-paper screen (SPEC-STUDENT-FIRST.md §Fix one, 22 Oct 2026).
//
// One practice question shown under the question that lost the most marks. This
// file is the pure half: which question lost the most, which sub-skill it is, and
// which bank row to show. The data half is api/portal/marking/fix-one/route.ts.
//
// The pick: a question from the SAME sub-skill the student has not attempted,
// short ones first (1–4 marks, an MCQ or one value to type); when the sub-skill
// has nothing left, a twin of the question they lost marks on.
import { fnv1a } from './skill-pick';
import { serveRefusal, type GateContext, type GateRow } from './serve-gate';
import { studentRow } from './part-syllabus';
import { mcqKey } from './science-levels';

/** Most "Another one" taps per paper (the first question counts). */
export const FIX_ONE_MAX = 3;

/** Deck level (result_json.revise.level) → practice level key. Same map as portal-marking's links. */
const REVISE_LEVEL: Record<string, string> = { am: 'AM', em: 'EM', jc: 'JC2', s1: 'S1', s2: 'S2' };

export interface FixTarget {
  questionNumber: string;
  /** Practice level key (EM, AM, JC2, S1, S2) — null when the run has no revise mapping. */
  level: string | null;
  topic: string | null;
  subgroupId: number | null;
  /** The bank row of the question they lost marks on (trusted paper match only). */
  bankId: string | null;
}

/**
 * The question that lost the most marks, with its sub-skill (result_json.revise) and
 * bank row. `dropped` is buildStudentMarking's list, biggest loss first.
 */
export function fixTarget(
  dropped: readonly { questionNumber: string }[],
  revise: unknown,
  bankIds: Record<string, string>,
): FixTarget | null {
  const top = dropped[0];
  if (!top) return null;
  const block = revise && typeof revise === 'object' ? (revise as { level?: unknown; items?: unknown }) : null;
  const level = REVISE_LEVEL[String(block?.level ?? '').toLowerCase()] ?? null;
  let topic: string | null = null;
  let subgroupId: number | null = null;
  if (level && Array.isArray(block?.items)) {
    for (const raw of block!.items as unknown[]) {
      const it = raw && typeof raw === 'object' ? (raw as { for?: unknown; topic?: unknown; subgroup_id?: unknown }) : null;
      if (!it || String(it.for ?? '') !== top.questionNumber) continue;
      const id = Number(it.subgroup_id);
      if (!Number.isInteger(id) || typeof it.topic !== 'string' || !it.topic) continue;
      topic = it.topic; subgroupId = id;
      break;
    }
  }
  return { questionNumber: top.questionNumber, level: subgroupId ? level : null, topic, subgroupId, bankId: bankIds[top.questionNumber] ?? null };
}

export interface FixCandidate extends GateRow {
  id: string;
  answer?: string | null;
  solution?: string | null;
  solution_source?: string | null;
  twin_of?: string | null;
  question_text?: string | null;
  has_image?: boolean | null;
  image_url?: string | null;
  difficulty?: string | null;
  /** How it reached the list: filed under the sub-skill, or a twin of the failed question. */
  from: 'skill' | 'twin';
  /** Open figure flag on it (practice_next never serves those). */
  figureFlagged?: boolean;
  /** A school row from the sub-skill that practice_pool does NOT serve this student. */
  outOfPool?: boolean;
}

/**
 * The grade route marks a generated row only when it passed the checks: the bot's
 * four gates ('ai_opus'), or a twin that passed the twin checks (verified — SPEC-TWINS,
 * Adrian 30 Sep 2026: "if they pass the checks consider them verified").
 */
export function gradableRow(q: { ai_generated?: boolean | null; solution_source?: string | null; verified?: boolean | null; twin_of?: string | null }): boolean {
  if (q.ai_generated !== true) return true;
  return q.solution_source === 'ai_opus' || (q.verified === true && !!q.twin_of);
}

function partCount(parts: unknown): number {
  return Array.isArray(parts) ? parts.length : 0;
}

/** Short = an MCQ, or 1–4 marks with at most one part (one value to type). */
function shortness(q: FixCandidate): number {
  if (mcqKey(q.answer)) return 0;
  const m = typeof q.total_marks === 'number' ? q.total_marks : Number(q.total_marks) || 0;
  if (m >= 1 && m <= 4 && partCount(q.parts) <= 1) return 1;
  if (m >= 1 && m <= 4) return 2;
  return 3;
}

/**
 * The rows that may be shown, best first. Drops: attempted, already shown on this run,
 * the failed question itself, anything the serve gate refuses (removed, national,
 * unverified, flagged, legacy, other level), a part-marks row with nothing to serve,
 * rows the grader would refuse, rows with no question or no answer, open figure flags,
 * and school rows the practice pool does not serve. Sub-skill rows come before twins.
 */
export function rankFixCandidates(
  rows: readonly FixCandidate[],
  opts: { attempted: ReadonlySet<string>; shown: ReadonlySet<string>; failedId: string | null; gate: GateContext; seed: string },
): FixCandidate[] {
  const seen = new Set<string>();
  const ok: FixCandidate[] = [];
  for (const q of rows) {
    if (!q?.id || seen.has(q.id)) continue;
    seen.add(q.id);
    if (opts.attempted.has(q.id) || opts.shown.has(q.id) || q.id === opts.failedId) continue;
    if (q.figureFlagged || q.outOfPool) continue;
    if (serveRefusal(q, { ...opts.gate, assigned: false })) continue;
    if (!studentRow(q)) continue;
    if (!gradableRow(q)) continue;
    if (!(q.answer?.trim() || q.solution?.trim())) continue;
    if (!(q.question_text?.trim() || q.has_image || q.image_url || partCount(q.parts) > 0)) continue;
    if (q.difficulty === 'Advanced' || q.difficulty === 'Challenging') continue;
    ok.push(q);
  }
  const marks = (q: FixCandidate) => (typeof q.total_marks === 'number' ? q.total_marks : Number(q.total_marks) || 99);
  return ok.sort((a, b) =>
    (a.from === b.from ? 0 : a.from === 'skill' ? -1 : 1)
    || shortness(a) - shortness(b)
    || partCount(a.parts) - partCount(b.parts)
    || marks(a) - marks(b)
    || fnv1a(`${opts.seed}|${a.id}`) - fnv1a(`${opts.seed}|${b.id}`),
  );
}

export interface FixPick { id: string; q: string; from: 'skill' | 'twin'; at: string }
export interface FixOneCache { picks: FixPick[] }

/** paper_marking_runs.fix_one, re-validated (a malformed value reads as no picks). */
export function readFixCache(raw: unknown): FixOneCache {
  const picks = raw && typeof raw === 'object' && Array.isArray((raw as { picks?: unknown }).picks)
    ? ((raw as { picks: unknown[] }).picks)
    : [];
  return {
    picks: picks.flatMap((p) => {
      const r = p && typeof p === 'object' ? (p as Record<string, unknown>) : null;
      if (!r || typeof r.id !== 'string' || !r.id) return [];
      return [{ id: r.id, q: String(r.q ?? ''), from: r.from === 'twin' ? 'twin' : 'skill', at: String(r.at ?? '') } as FixPick];
    }),
  };
}
