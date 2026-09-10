// ─── The weekly "papers we don't hold" line ─────────────────────────────────
//
// Adrian, 11 Sep 2026: "Papers in on day one … A weekly line listing papers
// students named that we do not hold would close the loop." Every marking is
// grounded on the real paper when the bot holds it (docs/MARKING.md § When
// the paper is missing, SPEC-PAPER-MATCH.md); when it doesn't, a run is left
// carrying either the bot's own `paper_match.ungrounded` stamp (`{key,
// filter}`) or — an older run, before that stamp existed — a null
// `grounding.source` with reads that came back `question_found:false`. Both
// shapes are exactly what `runPaperFields` / `runsToReground` in
// `./extraction-inbox.ts` already read, so this module reuses that field
// extraction rather than re-deriving it.
//
// Pure: no Supabase, no Telegram. The cron (`/api/cron/missing-papers`)
// gathers the last 7 days of runs and the set of papers already held, and
// hands both to `groupMissingPapers`.

import { runPaperFields, type RegroundRun } from './extraction-inbox';

export type MissingPaperRun = RegroundRun;

export type MissingPaperGroup = {
  /** Comparable across the run's own key spelling and the library's — see
   *  `missingPaperKey`. Build the `held` set the same way. */
  key: string;
  /** "GCE 2025 AM P2" / "Xinmin 2026 AM Prelim P2" — what Adrian reads. */
  label: string;
  /** Distinct hand-ins (runs) marked against this paper this week. */
  count: number;
  runIds: string[];
};

type PaperFields = { school: string; year: number; level: string; paper: string };

/**
 * The identity a paper is grouped/held by — comparable across the two naming
 * conventions the rest of the pipeline already lives with (`paper_library`'s
 * "am 2025 p2 gce" vs the marker's own "gce 2025 am p2"), across the two
 * paper-number spellings ("p2" in the library, a bare "2" off a run's
 * `paper_match`), and across the library's finer-grained levels — a school's
 * own AM prelim can sit in `paper_library.level` as "S3_AM" or "AM_NA" while a
 * run only ever names the family, "AM" (see `levelFamily`). Callers building
 * the `held` set from `paper_library` / bank `questions` rows MUST use this
 * same function so the two sides compare equal. Pure.
 */
export function missingPaperKey(f: PaperFields): string {
  const school = String(f.school || '').trim().toLowerCase();
  const level = levelFamily(f.level);
  const paperDigits = String(f.paper ?? '').replace(/[^0-9]/g, '');
  return `${school}|${f.year}|${level}|p${paperDigits}`;
}

/**
 * Collapses a school-specific level onto the family a run can ever name: am /
 * em / jc1 / jc2 / jc2_h1 / s1 / s2 / …. `S3_AM`, `AM_NA`, `EM_NA`,
 * `S3_EM_NT`, … all fold onto am/em; H1/H2 fold onto jc2_h1/jc2. A level with
 * no known family (S1, S2, …) is lower-cased and left alone. Pure.
 */
function levelFamily(raw: string): string {
  const s = String(raw || '').trim().toUpperCase();
  if (/(^|_)H1(_|$)/.test(s) || s === 'JC2_H1') return 'jc2_h1';
  if (/(^|_)H2(_|$)/.test(s) || s === 'JC2') return 'jc2';
  if (s === 'JC1') return 'jc1';
  if (/(^|_)AM(_|$)/.test(s)) return 'am';
  if (/(^|_)EM(_|$)/.test(s)) return 'em';
  return s.toLowerCase();
}

function asRecord(x: unknown): Record<string, unknown> {
  return x && typeof x === 'object' ? (x as Record<string, unknown>) : {};
}

/** "PRELIM" → "Prelim". Pure. */
function titleCase(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1).toLowerCase() : s;
}

/**
 * The sitting a run names — "Prelim", "MYE" — read off wherever `paper_match`
 * happens to carry it (an older run's `.parsed.exam`, a newer stamp's
 * `.ungrounded.filter.examType`/`.exam`). '' when the run says nothing, which
 * just drops the segment from the label. Pure.
 */
function examTypeOf(pm: Record<string, unknown>): string {
  const parsed = asRecord(pm.parsed);
  const filter = asRecord(asRecord(pm.ungrounded).filter);
  const raw = parsed.exam ?? filter.examType ?? filter.exam ?? null;
  return raw ? titleCase(String(raw)) : '';
}

/**
 * "GCE 2025 AM P2" / "Xinmin 2026 AM Prelim P2". GCE carries no exam-type
 * segment because the school slot already says "GCE". Pure.
 */
function paperLabel(f: PaperFields, examType: string): string {
  const school = String(f.school || '').trim();
  const head = school.toUpperCase() === 'GCE' ? `GCE ${f.year}` : `${school} ${f.year}`;
  const exam = examType && examType.toUpperCase() !== 'GCE' ? ` ${examType}` : '';
  const paperDigits = String(f.paper ?? '').replace(/[^0-9]/g, '');
  return `${head} ${String(f.level).toUpperCase()}${exam} P${paperDigits}`;
}

/**
 * A run was marked WITHOUT its paper when either:
 *   1. the bot's own stamp says so (`paper_match.ungrounded`), or
 *   2. — an older run, before that stamp existed — nothing grounded it
 *      (`grounding.source` falsy) AND at least one read came back
 *      `question_found:false`.
 * A run already re-grounded (`paper_match.regrounded_key` set) is never
 * counted again — the loop already closed on it once. Pure; mirrors the
 * per-run half of `runsToReground` in `./extraction-inbox.ts`, minus the
 * "matches THIS one arriving paper" half — this is asked the other question,
 * summing up every paper any run names, not just one.
 */
function isUngrounded(rj: Record<string, unknown>): boolean {
  const pm = asRecord(rj.paper_match);
  if (typeof pm.regrounded_key === 'string' && pm.regrounded_key) return false;
  if (pm.ungrounded) return true;
  const results = Array.isArray(rj.results) ? (rj.results as Array<Record<string, unknown>>) : [];
  const blind = results.some((x) => x && x.question_found === false);
  const groundingSource = asRecord(rj.grounding).source;
  return blind && !groundingSource;
}

/**
 * Groups the last `windowDays` (default 7) of runs by the paper they name,
 * keeping only runs marked without it (`isUngrounded`) and papers not already
 * in `held` (build with `missingPaperKey` from `paper_library` rows of kind
 * questions/solutions/combined, plus bank `questions` rows, for the same
 * fields). Highest count first, then label. Pure — the caller supplies `now`
 * for a stable test clock.
 */
export function groupMissingPapers(
  runs: MissingPaperRun[],
  held: Set<string>,
  opts: { now?: Date; windowDays?: number } = {},
): MissingPaperGroup[] {
  const now = opts.now ?? new Date();
  const windowDays = opts.windowDays ?? 7;
  const since = now.getTime() - windowDays * 86_400_000;
  const groups = new Map<string, MissingPaperGroup>();
  for (const run of runs || []) {
    if (!run?.id || !run.created_at) continue;
    const t = new Date(run.created_at).getTime();
    if (!Number.isFinite(t) || t < since || t > now.getTime()) continue;
    const rj = asRecord(run.result_json);
    if (!isUngrounded(rj)) continue;
    const pm = asRecord(rj.paper_match);
    const fields = runPaperFields(pm as Parameters<typeof runPaperFields>[0]);
    if (!fields || !fields.school || !fields.year || !fields.level || !fields.paper) continue;
    const key = missingPaperKey(fields);
    if (held.has(key)) continue;
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
      existing.runIds.push(run.id);
      continue;
    }
    groups.set(key, { key, label: paperLabel(fields, examTypeOf(pm)), count: 1, runIds: [run.id] });
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/**
 * The one Telegram line — null when nothing is missing (send nothing that
 * week). A single hand-in reads "(1)"; two or more read "(N hand-ins)" —
 * Adrian's own wording (11 Sep 2026). Pure.
 */
export function missingPapersLine(groups: MissingPaperGroup[]): string | null {
  if (!groups.length) return null;
  const parts = groups.map((g) => `${g.label} (${g.count === 1 ? '1' : `${g.count} hand-ins`})`);
  return `📚 Papers named this week that we don't hold: ${parts.join(', ')}. Drop the question paper into the Extraction Inbox and those markings re-ground themselves.`;
}
