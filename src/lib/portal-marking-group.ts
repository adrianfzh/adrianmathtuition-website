// The Papers list groups a marked Practice Again sheet UNDER the paper it was
// written from (Adrian, 8 Sep 2026: "grouping the marked pdf with the Practice
// Again — not individual pdfs, that's a little messy"). A sheet's assignment
// row carries both ends: `source_run_id` (the paper) and `run_id` (the sheet's
// own marking run, stamped when its hand-in was marked). Pure; tested.
//
// Rule: a listed run that is the marked run of a listed paper's sheet leaves
// the top-level list and is reachable from that paper's card. A sheet whose
// paper is NOT in the list (subject-gated, superseded, past the page cap)
// keeps its marked run at the top level — nothing the student handed in may
// vanish because its parent did.

export interface SheetLink {
  source_run_id: string | null;
  /** A batch sheet (10 Sep 2026): every paper it covers; source_run_id is the primary. */
  source_run_ids?: string[] | null;
  run_id: string | null;
  status: string;
}

/** The papers a sheet row hangs off — the primary first, then the rest of its batch. */
export function sheetParents(s: Pick<SheetLink, 'source_run_id' | 'source_run_ids'>): string[] {
  const out: string[] = [];
  for (const id of [s.source_run_id, ...(Array.isArray(s.source_run_ids) ? s.source_run_ids : [])]) {
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

export function groupPracticeAgain<P extends { id: string }, S extends SheetLink>(
  papers: readonly P[],
  sheets: readonly S[],
): { top: P[]; markedSheetByParent: Map<string, P> } {
  const byId = new Map(papers.map(p => [p.id, p] as const));
  const markedSheetByParent = new Map<string, P>();
  const nested = new Set<string>();
  for (const s of sheets) {
    if (s.status !== 'marked' || !s.run_id) continue;
    // A batch sheet (10 Sep 2026) is reachable from EVERY paper it covers; it
    // leaves the top list once, when any of them is listed.
    const parents = sheetParents(s).filter(p => p !== s.run_id && byId.has(p));
    if (!parents.length) continue;                      // no parent listed → child stays top-level
    const child = byId.get(s.run_id);
    if (!child || nested.has(s.run_id)) continue;
    const free = parents.filter(p => !markedSheetByParent.has(p)); // one sheet per paper; first wins
    if (!free.length) continue;
    for (const p of free) markedSheetByParent.set(p, child);
    nested.add(s.run_id);
  }
  return { top: papers.filter(p => !nested.has(p.id)), markedSheetByParent };
}

// ── The sheet's state beside its paper (15 Sep 2026) ────────────────────────
// Adrian, looking at a student's profile: "can we put the practice again
// together with the associated pdf (like in a card or section or something?)
// then it will be clear if student have completed THAT practice again sheet for
// THAT exam paper (should be handed up/marked or something)".
//
// groupPracticeAgain answers only the LAST of those states — it nests a sheet
// that has already come back and been marked. The states before it are exactly
// the ones he is asking about: written but not released, out with the student,
// handed in and waiting. So the pairing is its own map, over sheet rows in any
// state, and the caller decides which states belong on its surface.
//
// `student-app-view` built this map inline; it lives here now so the admin
// profile and the student mirror pair a sheet to a paper by the same rule.

/** Where a paper's Practice Again sheet has got to. */
export type SheetState = 'not-released' | 'to do' | 'handed in' | 'marked' | 'withdrawn';

export function sheetState(status: string): SheetState {
  switch (status) {
    case 'held': return 'not-released';
    case 'submitted': return 'handed in';
    case 'marked': return 'marked';
    case 'revoked': return 'withdrawn';
    default: return 'to do';                // 'assigned', and anything unknown
  }
}

/**
 * One sheet per paper: paper id → the sheet row hanging off it. Rows are taken
 * in the order given (every caller passes them newest first) and the first to
 * claim a paper keeps it; a batch sheet claims every paper it covers. Status is
 * NOT filtered here — a held or withdrawn sheet is real on the admin's page and
 * invisible on the student's, which is the caller's decision, not this rule's.
 */
export function sheetByParent<S extends SheetLink>(sheets: readonly S[]): Map<string, S> {
  const out = new Map<string, S>();
  for (const s of sheets) for (const pid of sheetParents(s)) if (!out.has(pid)) out.set(pid, s);
  return out;
}
