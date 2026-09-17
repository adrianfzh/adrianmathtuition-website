// "What have students handed in that I have not looked at?" (Adrian, 17 Sep 2026,
// /admin/students: "highlight or put coloured boxes around the cards whose papers /
// practice agains I have not looked at yet"). A run counts as NOT looked at until
// Adrian opens it on the desk (GET /api/admin/desk/run stamps admin_viewed_at).
// Only hand-ins from the app count — a paper Adrian uploaded himself he has seen.
// Pure; tested.
export type HandinRow = {
  id: string;
  student_id: string | null;
  paper_name: string | null;
  created_at: string;
  admin_viewed_at: string | null;
  /** result_json.portal_submission — set on a hand-in from the app. */
  portal_submission: unknown;
  /** ✓ Looked at on the desk or the Papers tab (18 Sep 2026: counts as looked, like opening it). */
  checked_at?: string | null;
  /** Only a RELEASED marking can be "not looked at" — a paper still being marked is not his yet. */
  released_at?: string | null;
  /** A re-marked paper's earlier marking (superseded) is never counted. */
  superseded_by?: string | null;
  /** 'auto:…' = released by the system; with portal_submission, the "from the app" test. */
  released_via?: string | null;
};

/**
 * THE rule — one for the student directory, the profile's Papers tab and the
 * desk (18 Sep 2026, Adrian: "alessi says 5 papers, 3 practice agains not looked
 * at, but when i go into the student itself, i don't see 5 papers"). A run is
 * "not looked at" when it is a current released marking that came in through
 * the app (a hand-in or a system release) and Adrian has neither opened it on
 * the desk (admin_viewed_at) nor ticked ✓ Looked at (checked_at). A paper he
 * uploaded and released himself was seen on the way out; an earlier marking of
 * a re-marked paper is history.
 */
export function notLookedAt(r: Partial<HandinRow> | null | undefined): boolean {
  if (!r) return false;
  if (!r.released_at) return false;
  if (r.superseded_by) return false;
  const fromApp = !!r.portal_submission || String(r.released_via || '').startsWith('auto:');
  if (!fromApp) return false;
  return !r.admin_viewed_at && !r.checked_at;
}

export type UnseenSummary = {
  papers: number;
  practiceAgain: number;
  /** ISO time of the newest unseen hand-in. */
  latest: string | null;
  /** Up to three paper names, newest first, for the card's hover/subline. */
  names: string[];
};

export function isPracticeAgainName(name: string | null | undefined): boolean {
  return /\bpractice\s*again\b/i.test(String(name || ''));
}

/** Per student: the app hand-ins Adrian has not opened on the desk. Students
 *  with nothing unseen are absent from the map. */
export function unseenByStudent(rows: HandinRow[]): Map<string, UnseenSummary> {
  const out = new Map<string, UnseenSummary>();
  const sorted = [...rows].filter(r => r && r.student_id && notLookedAt(r))
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  for (const r of sorted) {
    const sid = r.student_id as string;
    const cur = out.get(sid) ?? { papers: 0, practiceAgain: 0, latest: null, names: [] };
    if (isPracticeAgainName(r.paper_name)) cur.practiceAgain += 1; else cur.papers += 1;
    if (!cur.latest) cur.latest = r.created_at;
    if (cur.names.length < 3) cur.names.push(String(r.paper_name || 'paper'));
    out.set(sid, cur);
  }
  return out;
}

/** The badge text on the card: "2 papers · 1 Practice Again not looked at". */
export function unseenLabel(u: UnseenSummary | null | undefined): string {
  if (!u || (u.papers === 0 && u.practiceAgain === 0)) return '';
  const bits: string[] = [];
  if (u.papers) bits.push(`${u.papers} paper${u.papers === 1 ? '' : 's'}`);
  if (u.practiceAgain) bits.push(`${u.practiceAgain} Practice Again`);
  return `${bits.join(' · ')} not looked at`;
}
