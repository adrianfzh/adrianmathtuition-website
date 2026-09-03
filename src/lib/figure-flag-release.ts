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

const VERDICTS = new Set([
  'ok', 'mismatch', 'wrong-figure', 'answer-leak', 'incomplete', 'illegible',
  'foreign', 'wrong-kind', 'watermark', 'unsure',
]);

/** Fitness notes read `<writer> <date> · <severity> · <verdict> · <reason>`
 *  (the grammar the figfit pass set and both later writers follow). A human
 *  action may prefix `Adrian: … · `. The verdict is the first segment that is
 *  a verdict word — NOT "the segment after the first ·", which is the severity. */
export function parseFitnessNote(note: string | null | undefined): {
  severity: FitnessSeverity | null;
  verdict: string | null;
} {
  if (!note) return { severity: null, verdict: null };
  const severity: FitnessSeverity | null = /blocks-answering/i.test(note) ? 'blocks-answering'
    : /cosmetic/i.test(note) ? 'cosmetic' : null;
  const parts = note.split('·').map((s) => s.trim()).filter(Boolean);
  const verdict = parts.find((p) => VERDICTS.has(p.toLowerCase())) ?? null;
  return { severity, verdict };
}
