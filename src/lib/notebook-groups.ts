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
import { PAPER_SUBJECTS, SCIENCE_PAPER_SUBJECTS } from './portal-subjects';

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
export function splitFold<G extends NotebookGroup>(groups: readonly G[]): { open: G[]; earlier: G[] } {
  return { open: groups.slice(0, OPEN_GROUPS), earlier: groups.slice(OPEN_GROUPS) };
}

/** A group that is one marked paper (its key is the run id), not Practice or Other. */
export function isPaperGroup(g: Pick<NotebookGroup, 'key'>): boolean {
  return g.key !== 'practice' && g.key !== 'other';
}

/** Tab order: the maths, then the sciences, then anything else. */
const SUBJECT_ORDER: readonly string[] = [...PAPER_SUBJECTS, ...SCIENCE_PAPER_SUBJECTS, 'Other'];

/** 'AM' / 'A Math' → 'A Math'; an unknown or missing subject → 'Other'. */
export function notebookSubject(subject: string | null | undefined): string {
  const t = String(subject ?? '').trim();
  if (/^(am|a[ -]?math)$/i.test(t)) return 'A Math';
  if (/^(em|e[ -]?math)$/i.test(t)) return 'E Math';
  if (/^h2( math)?$/i.test(t)) return 'H2 Math';
  const hit = SUBJECT_ORDER.find(s => s.toLowerCase() === t.toLowerCase());
  return hit ?? 'Other';
}

/**
 * One tab per subject (30 Sep 2026: the Notebook listed physics slips beside A Math).
 * Placeholders (never seen) do not open a tab. The default tab is the subject of the
 * most recent sighting that is not fixed, else the first tab.
 */
export function splitBySubject<T extends Row>(rows: readonly T[]): { subjects: { subject: string; rows: T[] }[]; defaultSubject: string | null } {
  const by = new Map<string, T[]>();
  let newest: { at: string; subject: string } | null = null;
  for (const m of rows) {
    if (m.seen_count <= 0) continue;
    const k = notebookSubject(m.subject);
    by.set(k, [...(by.get(k) ?? []), m]);
    if (bandOf(m.state) !== 'fixed') {
      const at = latestSighting(m)?.date ?? m.last_seen_at ?? '';
      if (!newest || at > newest.at) newest = { at, subject: k };
    }
  }
  const subjects = SUBJECT_ORDER.filter(s => by.has(s)).map(subject => ({ subject, rows: by.get(subject)! }));
  return { subjects, defaultSubject: newest?.subject ?? subjects[0]?.subject ?? null };
}

// ---------------------------------------------------------------------------
// One card per lost-marks QUESTION (1 Oct 2026, Adrian: "I want student to be
// able to see their mistakes and the correct steps side by side … without
// clicking the review button"). A paper group's entries are attached to the
// paper's dropped questions by the "Q6(a)(ii), Q3(b)" label each entry carries;
// the card then shows the marking's own comparison (lib/review-fix) and the
// entry's actions. An entry whose question the loaded papers do not hold (a
// deleted run, a practice attempt) stays a title-only card, as before.
// ---------------------------------------------------------------------------

/** How many question cards a paper group shows before "n more on this paper". */
export const OPEN_CARDS = 3;

export interface NotebookQuestionCard {
  /** `${runId}:${questionNumber}` — the key the page renders the comparison under. */
  key: string;
  runId: string;
  questionNumber: string;
  /** The entries this question is evidence for — their tags and buttons sit on the card. */
  entries: NotebookMistake[];
}

export interface NotebookGroupWithCards extends NotebookGroup {
  /** The paper's lost-marks questions, in the paper's own order (biggest loss first). */
  cards: NotebookQuestionCard[];
  /** Entries no card claimed — drawn as title-only cards after the questions. */
  loose: NotebookMistake[];
}

/** "Q6(a)(ii), Q3(b), Q10(c)(iii)1." → ["6", "3", "10"] (each once, in order). */
export function questionNumbersIn(label: string | null | undefined): string[] {
  const out: string[] = [];
  for (const m of String(label ?? '').matchAll(/\bQ\s*(\d+[A-Za-z]?)/g)) {
    const n = m[1].toLowerCase();
    if (!out.includes(n)) out.push(n);
  }
  return out;
}

export function attachQuestions(
  groups: readonly NotebookGroup[],
  papers: readonly { id: string; dropped: readonly { questionNumber: string }[] }[],
): NotebookGroupWithCards[] {
  const byId = new Map(papers.map(p => [p.id, p]));
  return groups.map(g => {
    const paper = isPaperGroup(g) ? byId.get(g.key) : undefined;
    if (!paper) return { ...g, cards: [], loose: g.mistakes };
    const claimed = new Set<string>();
    const cards: NotebookQuestionCard[] = [];
    for (const q of paper.dropped) {
      const n = q.questionNumber.toLowerCase();
      if (cards.some(c => c.questionNumber.toLowerCase() === n)) continue;
      const entries = g.mistakes.filter(m => questionNumbersIn(m.where).includes(n));
      for (const m of entries) claimed.add(m.id);
      cards.push({ key: `${paper.id}:${q.questionNumber}`, runId: paper.id, questionNumber: q.questionNumber, entries });
    }
    return { ...g, cards, loose: g.mistakes.filter(m => !claimed.has(m.id)) };
  });
}

/** The cards a group shows before its fold, and the question numbers of the rest ("Q8, Q1, Q2 — 3 more"). */
export function splitCards(cards: readonly NotebookQuestionCard[]): { open: NotebookQuestionCard[]; more: NotebookQuestionCard[] } {
  return { open: cards.slice(0, OPEN_CARDS), more: cards.slice(OPEN_CARDS) };
}
