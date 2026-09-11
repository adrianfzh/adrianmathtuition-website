// The Papers list shows a merged Practice Again sheet ONCE (Adrian, 11 Sep
// 2026: "should the two papers be grouped together then have one green card
// below for the two papers? easier to see for them"). The papers one sheet
// covers become a bundle — one frame, the paper cards inside, the sheet's card
// at the bottom — instead of the same green card repeated under each paper.
//
// Two rules, both Adrian's:
//   • the bundle sits where its NEWEST hand-in sits in the list (the sheet is
//     the newest thing about those papers);
//   • inside, the papers read like a syllabus, not a hand-in log — earliest
//     exam year first, Paper 1 before Paper 2 ("AM 2023 paper 1 (top of card)
//     and paper 2, then AM 2025 paper 1 (bottom)"). A paper whose name carries
//     no year goes after those that do, by hand-in date.
// Pure; tested.

export interface BundleSheet {
  id: string;
  /** Every paper the sheet covers; a single-paper sheet has one or none. */
  source_run_ids?: string[] | null;
}

export type ListEntry<P> =
  | { kind: 'paper'; paper: P }
  | { kind: 'bundle'; sheetId: string; papers: P[] };

/** Exam year and paper number as a student's paper name declares them ("A Math · GCE 2023 · Paper 1"). */
export function paperOrderKey(name: string | null | undefined): { year: number | null; paper: number | null } {
  const text = String(name ?? '');
  const year = (text.match(/\b(20\d\d)\b/) || [])[1];
  const paper = (text.match(/\bpaper\s*([1-4])\b/i) || [])[1];
  return { year: year ? Number(year) : null, paper: paper ? Number(paper) : null };
}

/** Syllabus order: year ascending (unknown last), then paper number ascending (unknown last), then hand-in date ascending. */
export function syllabusOrder<P extends { name: string; date: string }>(papers: readonly P[]): P[] {
  return [...papers].sort((a, b) => {
    const ka = paperOrderKey(a.name), kb = paperOrderKey(b.name);
    if (ka.year !== kb.year) {
      if (ka.year === null) return 1;
      if (kb.year === null) return -1;
      return ka.year - kb.year;
    }
    if (ka.paper !== kb.paper) {
      if (ka.paper === null) return 1;
      if (kb.paper === null) return -1;
      return ka.paper - kb.paper;
    }
    return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
  });
}

/**
 * Fold the list (newest first, as the page lists it) into entries. `sheetOf`
 * is the sheet the page already picked for each paper; only a sheet covering
 * two or more LISTED papers makes a bundle, and the bundle takes the slot of
 * the first of its papers the walk meets — the newest hand-in.
 */
export function bundleList<P extends { id: string; name: string; date: string }>(
  papers: readonly P[],
  sheetOf: (paperId: string) => BundleSheet | null | undefined,
): ListEntry<P>[] {
  const listed = new Set(papers.map(p => p.id));
  const members = new Map<string, P[]>();   // sheet id → its listed papers, list order
  const bundleOf = new Map<string, string>(); // paper id → sheet id
  for (const p of papers) {
    const s = sheetOf(p.id);
    const covers = (s?.source_run_ids ?? []).filter(id => listed.has(id));
    if (!s || covers.length < 2 || !covers.includes(p.id)) continue;
    bundleOf.set(p.id, s.id);
    members.set(s.id, [...(members.get(s.id) ?? []), p]);
  }
  const out: ListEntry<P>[] = [];
  const placed = new Set<string>();
  for (const p of papers) {
    const sid = bundleOf.get(p.id);
    if (!sid) { out.push({ kind: 'paper', paper: p }); continue; }
    if (placed.has(sid)) continue;
    placed.add(sid);
    const group = members.get(sid) ?? [p];
    // a "bundle" of one (its other papers fell off the list) is just a paper
    if (group.length < 2) { out.push({ kind: 'paper', paper: p }); continue; }
    out.push({ kind: 'bundle', sheetId: sid, papers: syllabusOrder(group) });
  }
  return out;
}
