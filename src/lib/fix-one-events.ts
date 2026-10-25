// "Fix one" telemetry (SPEC-STUDENT-FIRST.md §Fix one, 22 Oct 2026). Client-safe:
// FixOne.tsx fires these through logPortalEvent; api/portal/event checks them here.
//   fix:shown    — the question appeared on a marked paper (kept once per run per day)
//   fix:answered — the student sent an answer; detail.correct says how it went
export const FIX_EVENT_KINDS = ['fix:shown', 'fix:answered'] as const;
export type FixEventKind = (typeof FIX_EVENT_KINDS)[number];
export interface FixEventDetail { runId: string; questionId: string; correct?: boolean }

export function isFixEventKind(k: unknown): k is FixEventKind {
  return typeof k === 'string' && (FIX_EVENT_KINDS as readonly string[]).includes(k);
}

const UUID = /^[0-9a-f-]{36}$/i;

/** Only the three fields, only well-formed ids; anything else → null (400). */
export function sanitizeFixDetail(kind: FixEventKind, raw: unknown): FixEventDetail | null {
  const d = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
  if (!d || typeof d.runId !== 'string' || !UUID.test(d.runId) || typeof d.questionId !== 'string' || !UUID.test(d.questionId)) return null;
  if (kind === 'fix:answered') {
    if (typeof d.correct !== 'boolean') return null;
    return { runId: d.runId, questionId: d.questionId, correct: d.correct };
  }
  return { runId: d.runId, questionId: d.questionId };
}
