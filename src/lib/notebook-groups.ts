// My Notebook = the mistakes list, grouped by the paper each mistake was last
// seen on (Adrian, 21 Sep 2026: "we should really simplify"). PURE: the page
// hands in the student's rows, this file decides the groups; the component
// only draws them.
//
//   • One group per paper, newest paper first ("E Math Prelim P1 · 12 Sep").
//     Practice attempts form one group of their own ("Practice").
//   • The first OPEN_GROUPS groups are open; the rest fold under one line,
//     "Earlier papers (n)" — this replaces the fade-by-time / cap-at-three
//     ideas with something a student reads at a glance.
//   • Fixed entries are not in the groups: they go under a single "Fixed (n)"
//     link at the foot. Removed entries never arrive here (shownByDefault).
import { bandOf, latestSighting, stateLabel, type MistakeEntry, type MistakeEvidence } from './notebook-mistakes';

/** How many paper groups are open before the fold. */
export const OPEN_GROUPS = 2;

export interface NotebookMistake {
  id: string;
  title: string;
  /** "Still happening" · "Getting better" · "Getting better · you marked this fixed" */
  stateText: string;
  /** rose for still happening, amber for getting better. */
  tone: 'rose' | 'amber';
  /** Still happening or getting better — the two buttons show. */
  live: boolean;
  /** "Q11(a), Q20" — where on the paper it showed last. */
  where: string | null;
  seen: number;
  cameBack: boolean;
  practice: { id: string; title: string }[];
  /** The paper's subject ('A Math' … 'Chemistry'); the card shows a pill for a science one (24 Sep 2026). */
  subject: string | null;
}

export interface NotebookGroup {
  /** The run id, 'practice', or 'other'. */
  key: string;
  title: string;
  /** ISO instant of the newest sighting in the group — the sort key. */
  at: string;
  mistakes: NotebookMistake[];
}

export interface NotebookGroups {
  groups: NotebookGroup[];
  /** Titles of the fixed entries, newest first. */
  fixed: { id: string; title: string }[];
}

type Row = MistakeEntry & { id: string };

function groupOf(e: MistakeEvidence | null): { key: string; title: string } {
  if (!e) return { key: 'other', title: 'Other' };
  if (e.kind === 'attempt') return { key: 'practice', title: 'Practice' };
  return { key: e.ref, title: e.paper || 'A marked paper' };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "12 Sep" in Singapore time (the locale prints "Sept", so the month is our own). */
function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const sg = new Date(d.getTime() + 8 * 3600_000);
  return `${sg.getUTCDate()} ${MONTHS[sg.getUTCMonth()]}`;
}

/** "E Math Prelim P1 · 12 Sep" — the group's heading. */
export function groupHeading(g: Pick<NotebookGroup, 'title' | 'at'>): string {
  const d = shortDate(g.at);
  return d ? `${g.title} · ${d}` : g.title;
}

export function groupMistakes<T extends Row>(
  rows: readonly T[],
  practiceFor: (m: T) => { id: string; title: string }[] = () => [],
): NotebookGroups {
  const byKey = new Map<string, NotebookGroup>();
  const fixed: { id: string; title: string; at: string }[] = [];
  for (const m of rows) {
    if (m.seen_count <= 0) continue; // a placeholder linked before any evidence
    const seen = latestSighting(m);
    if (bandOf(m.state) === 'fixed') {
      fixed.push({ id: m.id, title: m.title, at: seen?.date ?? m.last_clean_at ?? '' });
      continue;
    }
    const g = groupOf(seen);
    const at = seen?.date ?? m.last_seen_at ?? '';
    let group = byKey.get(g.key);
    if (!group) { group = { key: g.key, title: g.title, at, mistakes: [] }; byKey.set(g.key, group); }
    if (at > group.at) group.at = at;
    const band = bandOf(m.state);
    group.mistakes.push({
      id: m.id, title: m.title, stateText: stateLabel(m.state),
      tone: band === 'still-happening' ? 'rose' : 'amber',
      live: m.state === 'dark' || m.state === 'light',
      where: seen?.label ?? null, seen: m.seen_count, cameBack: m.came_back, practice: practiceFor(m),
      subject: m.subject ?? null,
    });
  }
  const groups = [...byKey.values()].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : a.title.localeCompare(b.title)));
  // Inside a group: still happening before getting better, then by title.
  for (const g of groups) g.mistakes.sort((a, b) => (a.tone === b.tone ? a.title.localeCompare(b.title) : a.tone === 'rose' ? -1 : 1));
  fixed.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  return { groups, fixed: fixed.map(({ id, title }) => ({ id, title })) };
}

/** The groups a student sees without opening the fold, and the rest. */
export function splitFold(groups: readonly NotebookGroup[]): { open: NotebookGroup[]; earlier: NotebookGroup[] } {
  return { open: groups.slice(0, OPEN_GROUPS), earlier: groups.slice(OPEN_GROUPS) };
}
