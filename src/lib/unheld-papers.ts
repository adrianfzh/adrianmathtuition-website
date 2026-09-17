// "Papers we marked this week without a scheme we hold" (18 Sep 2026, Adrian:
// "i thought every paper should be grounded against the scheme already?").
// Grounding IS built — the marker uses the scheme it holds (an extracted or
// approved scheme row, the bank's per-part marks, an attached library paper).
// The gap is the papers we do NOT hold: a school prelim nobody dropped in the
// inbox, a TYS year not yet extracted — those are marked on a split derived
// from the printed brackets, which is where Q10's generous 2/3 came from
// (Isabelle, 17 Sep). This line names them once a week so Adrian can drop the
// scheme in; the next marking of that paper is then grounded. For Adrian only.
export type GroundingStamp = {
  scheme?: { status?: string | null; key?: string | null } | null;
  source?: string | null;
  allocation?: string | null;
};
export type RunForHeld = {
  paper_name: string | null;
  student_name?: string | null;
  created_at: string;
  paper_subject?: string | null;
  result_json: { grounding?: GroundingStamp | null; paper_match?: { trusted?: boolean; key?: string | null } | null; source?: { paper_kind?: string | null } | null } | null;
};

/** The paper's scheme was held when the marker had an extracted or approved
 *  scheme row, or the bank's own per-part allocation, or a trusted paper match
 *  with an attached source. A derived scheme (built from the page) is NOT held. */
export function schemeHeld(run: RunForHeld): boolean {
  const g = run.result_json?.grounding ?? null;
  const status = String(g?.scheme?.status || '').toLowerCase();
  if (status === 'extracted' || status === 'approved') return true;
  if (String(g?.allocation || '').toLowerCase() === 'bank') return true;
  if (run.result_json?.paper_match?.trusted && String(g?.source || '') === 'attached') return true;
  return false;
}

export type UnheldPaper = { name: string; students: number; runs: number; latest: string };

/** Group the week's unheld runs by paper name (case-folded), newest first.
 *  Practice Again sheets and non-maths papers are left out — they have no
 *  scheme to file. */
export function unheldPapers(runs: RunForHeld[]): UnheldPaper[] {
  const by = new Map<string, UnheldPaper & { studentSet: Set<string> }>();
  for (const r of runs) {
    if (!r || !r.paper_name) continue;
    if (/practice\s*again/i.test(r.paper_name)) continue;
    if (r.paper_subject && !/^(math|maths|mathematics)$/i.test(r.paper_subject)) continue;
    if (r.result_json?.source?.paper_kind === 'practice-again') continue;
    if (schemeHeld(r)) continue;
    const key = r.paper_name.trim().toLowerCase().replace(/\s+/g, ' ');
    const cur = by.get(key) ?? { name: r.paper_name.trim(), students: 0, runs: 0, latest: r.created_at, studentSet: new Set<string>() };
    cur.runs += 1;
    if (r.student_name) cur.studentSet.add(r.student_name);
    if (Date.parse(r.created_at) > Date.parse(cur.latest)) cur.latest = r.created_at;
    by.set(key, cur);
  }
  return [...by.values()].map(v => ({ name: v.name, students: v.studentSet.size, runs: v.runs, latest: v.latest }))
    .sort((a, b) => b.runs - a.runs || Date.parse(b.latest) - Date.parse(a.latest));
}

/** The Monday line. Nothing when every paper was held. */
export function unheldLine(list: UnheldPaper[]): string {
  if (!list.length) return '';
  const top = list.slice(0, 6).map(p => `${p.name} (${p.runs} marking${p.runs === 1 ? '' : 's'})`).join('; ');
  return `📐 Marked this week WITHOUT a scheme we hold: ${list.length} paper${list.length === 1 ? '' : 's'} — ${top}${list.length > 6 ? `; +${list.length - 6} more` : ''}. Drop the scheme in the Extraction Inbox and the next marking of that paper is grounded.`;
}
