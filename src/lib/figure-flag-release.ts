// figure_flags release rules — shared by the figures-bank route (server) and
// page (client) so the two can never disagree about what a tap may clear.
//
// Why this exists (3 Sep 2026, 23:28 SGT): three question figures the fitness
// pass had flagged as a WRONG figure / a LEAKED answer were released with
// "✓ Looks fine — release" on the flagged tab. The image looked fine — those
// faults are invisible in pixels — the card never showed WHY it was flagged,
// and the route overwrote the note with null on release, so the reason was
// gone the moment the tap landed. A leaked answer served under a green tick.
//
// Rules:
//  • a correctness hold (wrong-figure / answer-leak / a RE-OPENED row) needs
//    an explicit override (`force`), and the page must show the reason first;
//  • a release NEVER nulls the note — it prefixes it, so the history survives
//    on the row and the next reader can see what was overridden.

/** Notes that mean "the picture is not this question's answer-free figure".
 *  Pixel checks cannot see these, so no bulk or blind release may clear them.
 *  Kept as a regex so the page can test the same words on the client. */
export const CORRECTNESS_HOLD = /wrong-figure|answer-leak|RE-OPENED|blocks-answering|Adrian: hide/i;

export function isCorrectnessHold(note: string | null | undefined): boolean {
  return CORRECTNESS_HOLD.test(note ?? '');
}

export const NOTE_MAX = 500;

/** The note a release writes. Never null: the previous note is kept behind a
 *  prefix that says a human released it, and whether that was an override. */
export function releaseNote(previous: string | null | undefined, opts: { force?: boolean; extra?: string } = {}): string {
  const prev = (previous ?? '').trim();
  const prefix = opts.force ? 'Adrian: released despite hold' : 'Adrian: released';
  const extra = (opts.extra ?? '').trim();
  const head = extra ? `${prefix} (${extra})` : prefix;
  return (prev ? `${head} · ${prev}` : head).slice(0, NOTE_MAX);
}

export type FitnessSeverity = 'blocks-answering' | 'cosmetic';

/** The verdict vocabulary across all three writers. The figfit pass and the
 *  nightly figure-fitness task use ok · wrong-figure · answer-leak · mismatch ·
 *  incomplete · illegible · foreign · wrong-kind · unsure; the extraction law's
 *  ingestion gate adds watermark; missing-object is the every-reference-404s
 *  verdict — recorded, never flagged, but named so a note carrying it reads. */
const VERDICTS = new Set([
  'ok', 'wrong-figure', 'answer-leak', 'mismatch', 'incomplete', 'illegible',
  'foreign', 'wrong-kind', 'unsure', 'watermark', 'missing-object',
]);

/** Fitness notes read `<writer> <date> · <severity> · <verdict> · <reason>` —
 *  SEVERITY FIRST — the grammar the figfit pass set (RESUME-figfit.md rule 2)
 *  and both later writers follow: `ingest-fitness <date> · …` from the
 *  extraction law's gate and `figure-fitness <date> · …` from the nightly task
 *  (docs/FIGURES.md §4). A human action may prefix another segment
 *  (`Adrian: repair · …`, `RE-OPENED … · …`). Severity is read from anywhere in
 *  the text. The verdict is the first segment AFTER the leading prefix that is a
 *  verdict word, skipping the segment that is the severity — NOT "the segment
 *  after the first ·": that is the severity, and reading it as the verdict
 *  showed 'cosmetic' / 'blocks-answering' twice on every held row and never the
 *  real verdict (3 Sep 2026). A note that follows no template parses to nulls. */
export function parseFitnessNote(note: string | null | undefined): {
  severity: FitnessSeverity | null;
  verdict: string | null;
} {
  if (!note) return { severity: null, verdict: null };
  const severity: FitnessSeverity | null = /blocks-answering/i.test(note) ? 'blocks-answering'
    : /cosmetic/i.test(note) ? 'cosmetic' : null;
  const parts = note.split('·').map((s) => s.trim()).filter(Boolean);
  // parts[0] is always a prefix — the writer + date, or a human action in front
  // of it — never the verdict.
  let verdict: string | null = null;
  for (const p of parts.slice(1)) {
    const word = p.toLowerCase();
    if (word === severity) continue;
    if (VERDICTS.has(word)) { verdict = p; break; }
  }
  return { severity, verdict };
}

// ── Solutions lane: the two verdicts that DECIDE a row without changing its
// status (9 Sep 2026). Same bug the Fitness lane had on 5 Sep: "✏️ Redraw" and
// "🙈 Keep hidden" wrote a note and left status='held', and the lane listed every
// held row — so every card Adrian had decided came straight back on refresh
// ("i clicked through alot of redraws for solutions but when i refreshed the
// page, they are still there"; 53 rows carried the bare note "redraw requested").
// Worse, the old write REPLACED the note, so the cleaning session's verdict on
// those 53 is gone. Now: the verdict is a PREFIX (the prior note survives), the
// lane hides decided rows and shows them behind their own door, and a second
// tap is a no-op.
export const SOLUTION_DECIDED = {
  redraw: 'Adrian: redraw · ',
  hidden: 'Adrian: kept hidden · ',
  // 9 Sep 2026. Adrian, opening the question behind a held card: "the solution
  // diagram looks different? the solution diagram is actually good". It was:
  // that question carries TWO solution images — the watermarked scan the card
  // holds, and a clean redraw filed as solutions/<qid>-N.png that the render
  // gate already serves. The card was asking him to judge a picture no student
  // sees. An audit of all 317 held solution flags found 32 like it; 30 where
  // the redraw fully covers the scan are stamped with this, and the two whose
  // redraw DROPPED content were left in the queue for him.
  superseded: 'Superseded: a clean redraw already serves this question · ',
} as const;
export type SolutionDecision = keyof typeof SOLUTION_DECIDED;

/** Which decision, if any, a solution-lane note records. Recognises the
 *  prefixed form AND the bare legacy notes the pre-9-Sep actions wrote, so the
 *  rows Adrian already tapped leave the working lane without a data migration. */
export function decidedSolutionKind(note: string | null | undefined): SolutionDecision | null {
  const n = (note ?? '').trim();
  if (!n) return null;
  // The prefix without its trailing " · " too: a decision on a row with no prior
  // note is written bare ("Adrian: redraw"), and must still count as decided.
  const bare = (p: string) => p.replace(/\s*·\s*$/, '');
  if (n.startsWith(bare(SOLUTION_DECIDED.redraw)) || /^redraw requested\b/i.test(n)) return 'redraw';
  if (n.startsWith(bare(SOLUTION_DECIDED.hidden)) || /^kept hidden\b/i.test(n)) return 'hidden';
  if (n.startsWith(bare(SOLUTION_DECIDED.superseded))) return 'superseded';
  return null;
}

/** The note a decision writes: the prefix in front of whatever was there, with
 *  Adrian's optional words inside it. Never trimmed to a cap — the prefix goes on
 *  the FRONT, so a cap would eat the evidence off the END (the fitness lane's
 *  5 Sep lesson). Idempotent: deciding the same way twice returns the note as is. */
export function decideSolutionNote(prior: string | null | undefined, kind: SolutionDecision, extra?: string | null): string {
  const prev = (prior ?? '').trim();
  if (decidedSolutionKind(prev) === kind) return prev;
  const words = (extra ?? '').trim();
  const head = words ? `${SOLUTION_DECIDED[kind].trimEnd()} ${words} · ` : SOLUTION_DECIDED[kind];
  return prev ? `${head}${prev}` : head.replace(/\s*·\s*$/, '');
}

