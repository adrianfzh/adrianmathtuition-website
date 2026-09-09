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
  return { req: { runId, photoIndex, allowReleased: b.allowReleased === true } };
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
 * the truth, the drawing follows it. Parts with no label are dropped: the bot
 * matches on (question, label) and would report a nameless one as unmatched.
 */
export function partsForPage(results: unknown, photoIndex: number): { question: string; label: string; awarded: number }[] {
  const rows = Array.isArray(results) ? (results as ResultRow[]) : [];
  return rows
    .filter(r => Number(r.photo_index) === photoIndex)
    .flatMap(r =>
      (Array.isArray(r.marking?.parts) ? r.marking!.parts! : [])
        .filter(p => typeof p.label === 'string' && p.label.trim() !== '')
        .map(p => ({ question: String(r.question_number ?? ''), label: p.label as string, awarded: Number(p.awarded) || 0 })),
    );
}
