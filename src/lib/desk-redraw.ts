// The pure half of POST /api/admin/desk/redraw — what the request asked for,
// whether a released paper may be re-inked, and which part marks the drawing
// must follow. Kept out of the route so all three are tested rather than
// re-derived (the bot mirrors the release rule in ai/reannotate-page.js).
//
// 10 Sep 2026: `allowReleased` exists because auto-release moved Adrian's eye to
// AFTER the student's copy — he found three wrong ✗/✓ on Isabelle's page 3 of run
// 9e66d0b4 once she already had it. Without the flag, a released run still 409s.

export type RedrawRequest = {
  runId: string;
  photoIndex: number;
  /** Re-ink a paper the student already holds, then re-issue their copy. */
  allowReleased: boolean;
  /**
   * Whether a released re-ink also re-issues the student's copy. Default true —
   * one call from the desk replaces what they hold, which is the whole point.
   *
   * `false` is for a caller fixing SEVERAL pages of one paper (14 Sep 2026): the
   * re-issue rebuilds both PDFs and sends a Telegram line, so doing it per page
   * would rebuild N times and tell the student N times about one copy. The
   * page-gap self-fix redraws every missing page with this off and then re-issues
   * once — lib/page-gap-repair.ts.
   */
  reissue: boolean;
};

/** Parse the POST body. Returns the request, or the message the route answers 400 with. */
export function parseRedrawBody(body: unknown): { req: RedrawRequest } | { error: string } {
  const b = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const runId = typeof b.runId === 'string' ? b.runId.trim() : '';
  const photoIndex = Number(b.photoIndex);
  if (!runId || !Number.isInteger(photoIndex) || photoIndex < 0) {
    return { error: 'runId and photoIndex are required' };
  }
  // Only a literal `true`. A released paper is never re-inked because a body
  // carried the string "false", or a 0, or an accidental object.
  // Only a literal `false` turns the re-issue off, for the same reason: a body
  // that forgot the field, or carried a 0, still replaces the student's copy.
  return { req: { runId, photoIndex, allowReleased: b.allowReleased === true, reissue: b.reissue !== false } };
}

/**
 * The release rule, same wording as the bot's. Returns the refusal (the route's
 * 409 body) or null when the redraw may proceed.
 */
export function redrawReleaseRefusal(releasedAt: unknown, allowReleased: boolean): string | null {
  if (!releasedAt) return null;
  if (allowReleased === true) return null;
  return 'already released — the student has that copy';
}

type Part = { label?: unknown; awarded?: unknown };
export type ResultRow = { photo_index?: unknown; question_number?: unknown; marking?: { parts?: Part[] } };

/**
 * The run's CURRENT per-part marks for every question on one page — the record is
 * the truth, the drawing follows it.
 *
 * A part with no label is kept ONLY when it is its question's only part
 * (14 Sep 2026). The bot matches on (question, label) and normalises a missing
 * label to '', so a lone nameless part matches its question exactly — but two
 * nameless parts under one question would both answer to the same key and take
 * each other's mark, so those are still dropped. This is not a nicety: Isabelle
 * Toh Si Xian's page 4 is an unlabelled continuation of Q5 and Q6, marked 6/6
 * and 7/7, and the old filter emptied the page — a page that had lost its
 * annotated image could then never be redrawn, only fall back to her own photo.
 */
export function partsForPage(results: unknown, photoIndex: number): { question: string; label: string; awarded: number }[] {
  const rows = Array.isArray(results) ? (results as ResultRow[]) : [];
  return rows
    .filter(r => Number(r.photo_index) === photoIndex)
    .flatMap(r => {
      const parts = Array.isArray(r.marking?.parts) ? r.marking!.parts! : [];
      const named = (p: Part) => typeof p.label === 'string' && p.label.trim() !== '';
      const keep = parts.length === 1 ? parts : parts.filter(named);
      return keep
        .filter(p => named(p) || parts.length === 1)
        .map(p => ({
          question: String(r.question_number ?? ''),
          label: named(p) ? (p.label as string) : '',
          awarded: Number(p.awarded) || 0,
        }));
    });
}
