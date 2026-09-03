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
