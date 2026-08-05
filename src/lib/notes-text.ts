// ── Notes portal: student-facing text cleanup ────────────────────────────────
//
// `subgroups.description` and `content_snippets.card_title` were written for the
// content generator, not for a reader. The descriptions carry a trailing
// "Generation hint: …" instruction to the model, and some card titles carry a
// provenance tag — "(KB)" for imported knowledge-base items, "(fresh)" for newly
// authored ones. Both shipped straight onto the page in the first cut of /notes.
//
// Pure string work so it can be unit-tested; the callers are server components.

export interface NotesDescription {
  /** What the page covers — the part a student should read. */
  summary: string;
  /**
   * A representative question, lifted out of the trailing `Example: '…'`
   * sentence so the page can present it as an example rather than as prose.
   */
  example: string | null;
}

/** Instruction to the generator: everything from "Generation hint:" onwards. */
const GENERATION_HINT = /\s*(?:generation|gen|prompt)\s+hint\s*:[\s\S]*$/i;

/** The trailing `Example: '…'` sentence, if the description ends with one. */
const EXAMPLE = /(?:^|[.\s])(?:e\.g\.|example)\s*:\s*([\s\S]*)$/i;

/** Provenance tags the generator appends to card titles. */
const PROVENANCE = /\s*\((?:kb|fresh)\)\s*$/i;

const QUOTE_PAIRS: [string, string][] = [
  ["'", "'"],
  ['"', '"'],
  ['‘', '’'],
  ['“', '”'],
];

/** Collapse the newlines and double spaces that crept in during authoring. */
function tidy(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Drop the quotes around an example, but only when a single pair wraps the whole
 * string — `'a' or 'b'` has to keep its quotes or it turns into nonsense.
 */
function unquote(text: string): string {
  for (const [open, close] of QUOTE_PAIRS) {
    if (
      text.length > 1 &&
      text.startsWith(open) &&
      text.endsWith(close) &&
      !text.slice(1, -1).includes(close)
    ) {
      return text.slice(1, -1);
    }
  }
  return text;
}

/**
 * Split a raw sub-group description into what a student sees.
 *
 * Returns empty strings rather than throwing on null — a missing description is
 * normal (the column is nullable) and the caller just renders less.
 */
export function cleanDescription(raw: string | null | undefined): NotesDescription {
  const text = tidy((raw ?? '').replace(GENERATION_HINT, ''));
  const match = EXAMPLE.exec(text);
  if (!match) return { summary: text, example: null };

  // The captured example keeps its own sentence-ending period outside the
  // quotes ("…'." ) — that period belongs to the description, not the question.
  let example = tidy(match[1]).replace(/(['"’”])\.$/, '$1');
  example = unquote(example).trim();

  const summary = tidy(text.slice(0, match.index)).replace(/[.\s]+$/, '');
  return {
    summary: summary ? `${summary}.` : '',
    example: example || null,
  };
}

/** Card title with the generator's provenance tag removed. */
export function cleanTitle(raw: string | null | undefined): string {
  return (raw ?? '').replace(PROVENANCE, '').trim();
}
