// 🕳 "Do we have the questions for this paper?" — the hand-in hint.
//
// Adrian, 10 Sep 2026: *"students should drop their question paper if required,
// app should hint if we do not have the question paper in the database."*
//
// What went wrong. Isabelle handed in `isabelle TYS AM 2025 P2` as photos of her
// own working paper. The name parsed to a real national paper, but the 2025
// papers had not been filed yet, so every rung of the marker's grounding ladder
// came up empty and it worked out each question's allocation from her working —
// 68 of a guessed 73, printed against the registry's 90. Nothing on the way in
// had asked her for the one thing that would have fixed it for free: photographs
// of the printed question pages, which she was holding.
//
// So the app asks. While the student is still typing the paper's name, the bot's
// read-only `phase:'paper-available'` answers whether ANY rung holds this paper
// (an attached PDF, the exam library, a stored mark scheme, the question bank);
// when none does, the notice below asks for the printed pages. It is advice, not
// a gate — nothing here can refuse or delay a hand-in, and every failure answers
// "available" so the notice never fires wrongly.
//
// Pure, no I/O. Tested in paper-check.test.ts.

export type PaperCheck = {
  /** A real past paper someone could file — GCE/TYS with year + level + paper, or a school exam that also names its school. */
  named: boolean;
  /** Does anything we hold ground this paper? */
  available: boolean;
  /** Which rung answered: attached | library | stored-scheme | bank; null when none did. */
  via: string | null;
  /** How the paper is spoken — "GCE 2025 A Math Paper 2". */
  label: string | null;
  key: string | null;
};

/** The answer that shows nothing. Every unknown, error and timeout resolves here. */
export const QUIET: PaperCheck = { named: false, available: true, via: null, label: null, key: null };

/**
 * Shape whatever the bot said into the answer the form renders. Deliberately
 * paranoid: only a payload that explicitly says `named:true, available:false`
 * can raise the notice, so an older bot (which 400s on an unknown phase), a
 * garbled body or a shape change all fall back to silence.
 */
export function shapePaperCheck(raw: unknown): PaperCheck {
  if (!raw || typeof raw !== 'object') return QUIET;
  const r = raw as Record<string, unknown>;
  if (r.named !== true) return QUIET;
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 120) : null);
  return {
    named: true,
    available: r.available !== false,
    via: str(r.via),
    label: str(r.label),
    key: str(r.key),
  };
}

/**
 * Is this typed name even worth asking about? Every named paper carries a
 * 4-digit year (lib/paper-key only ever reads one out of the name itself), so a
 * name without one can never raise the notice — and the form should not spend a
 * round trip per keystroke finding that out.
 */
export function looksLikeNamedPaper(name: string): boolean {
  const s = String(name || '').trim();
  if (s.length < 6) return false;
  return /\b(19|20)\d{2}\b/.test(s);
}

// ── the copy, in one place ───────────────────────────────────────────────────
// Student-facing: "app", never "portal". Calm — this is a request for two more
// photos, not a warning that anything is wrong.

/** The heading on the notice. */
export const PAPER_MISSING_TITLE = 'Add the question pages too';

/**
 * The notice itself. `label` is how the paper is spoken back to the student
 * ("GCE 2025 A Math Paper 2"); a missing one degrades to "this paper" rather
 * than printing an empty gap.
 */
export function paperMissingNotice(label: string | null): string {
  const what = (label && label.trim()) || 'this paper';
  return `We don’t have the questions for ${what} yet. If your pages don’t show the printed questions, please also photograph each question page (the printed pages) and add them here — otherwise the marking has to guess the marks for each question.`;
}

/** What the small "Why?" toggle opens. */
export const PAPER_MISSING_WHY =
  'Every question is marked out of a printed number — the [2] or [3] beside it. Without the question paper the marking works those numbers out from your working, so the total on your marked cover is only official when the printed marks are known. Photograph the printed pages and the marks come straight off the paper.';
