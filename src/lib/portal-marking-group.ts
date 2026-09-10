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
