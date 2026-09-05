// Practice is the to-do list — SPEC-PORTAL-V2 §3, pure half.
//
// Adrian, 6 Sep 2026: a student's Practice tab is their to-do list and nothing
// else — work he assigned, Practice Again questions handed back from their own
// marked papers, questions they found with Find a question. The open topic
// picker and the timed set stay behind his admin cookie.
//
// Everything a student sees is a portal_assignments row; this module decides
// which section a row sits in, what state it shows, and the order. No I/O — the
// page and /api/portal/assignments call it over rows they have already scoped
// to the student (identity predicate in the query) and filtered through the
// subject gate (lib/portal-subjects).

import { subjectAllowed, type SubjectAccount } from './portal-subjects';
import type { AssignmentRow, AssignmentSource, AssignmentStatus } from './assignments';

export type TodoSectionKey = AssignmentSource;

/** The three sections, in display order. */
export const TODO_SECTIONS: readonly { key: TodoSectionKey; title: string; icon: string; blurb: string }[] = [
  { key: 'adrian', title: 'From Adrian', icon: '📬', blurb: 'Work Adrian sent you.' },
  { key: 'practice-again', title: 'Practice Again', icon: '🔁', blurb: 'From your marked papers — the skills worth another go.' },
  { key: 'find', title: 'Found by you', icon: '🔍', blurb: 'Questions you found with Find a question.' },
];

/** to do → done (handed in, being marked) → marked. Held and revoked rows have no state: they are not shown. */
export type TodoState = 'todo' | 'done' | 'marked';

export function todoState(status: AssignmentStatus | string): TodoState | null {
  switch (status) {
    case 'assigned': return 'todo';
    case 'submitted': return 'done';
    case 'marked': return 'marked';
    default: return null;
  }
}

/** An unknown or missing source reads as Adrian's — every row before this build was his. */
export function sectionFor(source: string | null | undefined): TodoSectionKey {
  return source === 'practice-again' || source === 'find' ? source : 'adrian';
}

export type TodoRow = Pick<AssignmentRow, 'id' | 'status' | 'source' | 'created_at'> & Partial<AssignmentRow>;

/**
 * May the student see this row at all? Held (not yet released) and revoked rows
 * never; a row carrying a subject only when the account has that subject.
 */
export function visibleToStudent(row: Pick<AssignmentRow, 'status'> & { subject?: string | null }, account: SubjectAccount | null | undefined): boolean {
  if (todoState(row.status) === null) return false;
  return subjectAllowed(account, row.subject ?? null);
}

const STATE_RANK: Record<TodoState, number> = { todo: 0, done: 1, marked: 2 };

export type TodoSection<R extends TodoRow = TodoRow> = {
  key: TodoSectionKey;
  title: string;
  icon: string;
  blurb: string;
  items: (R & { state: TodoState })[];
  counts: Record<TodoState, number>;
};

/**
 * Group rows into the three sections. Within a section: things still to do
 * first, then handed-in, then marked — newest first inside each band, so a
 * fresh item is never buried under an old finished one. Held/revoked rows are
 * dropped here too (belt and braces with the query). Every section is
 * returned, empty or not — the page decides what to render.
 */
export function groupPracticeTodo<R extends TodoRow>(rows: R[]): TodoSection<R>[] {
  const sections = TODO_SECTIONS.map(s => ({ ...s, items: [] as (R & { state: TodoState })[], counts: { todo: 0, done: 0, marked: 0 } as Record<TodoState, number> }));
  const byKey = new Map(sections.map(s => [s.key, s]));
  for (const r of rows) {
    const state = todoState(r.status);
    if (!state) continue;
    const s = byKey.get(sectionFor(r.source))!;
    s.items.push({ ...r, state });
    s.counts[state]++;
  }
  for (const s of sections) {
    s.items.sort((a, b) => STATE_RANK[a.state] - STATE_RANK[b.state] || Date.parse(b.created_at) - Date.parse(a.created_at));
  }
  return sections;
}

/** Totals across sections — the tab's own summary line. */
export function todoTotals(sections: TodoSection[]): Record<TodoState, number> {
  const t: Record<TodoState, number> = { todo: 0, done: 0, marked: 0 };
  for (const s of sections) for (const k of Object.keys(t) as TodoState[]) t[k] += s.counts[k];
  return t;
}

/** Chip text per state — "To do" / "Being marked" / "Marked · 3/5". */
export function todoStateLabel(state: TodoState, row: Pick<AssignmentRow, 'score' | 'out_of'>): string {
  if (state === 'todo') return 'To do';
  if (state === 'done') return 'Being marked';
  return row.score != null && row.out_of != null ? `Marked · ${row.score}/${row.out_of}` : 'Marked';
}

/**
 * The grey line under an item's title. Practice Again names the paper it came
 * from ("From AM 2021 P1"); Found by you names the tier the match was made at;
 * Adrian's rows keep topic · tier as the From Adrian list always has.
 */
export function todoSubtitle(
  row: Pick<AssignmentRow, 'source' | 'topic' | 'tier' | 'skill_title'>,
  paperName?: string | null,
): string {
  const parts: string[] = [];
  switch (sectionFor(row.source)) {
    case 'practice-again':
      if (paperName) parts.push(`From ${paperName}`);
      if (row.topic) parts.push(row.topic);
      break;
    case 'find':
      if (row.tier) parts.push(row.tier);
      if (row.topic) parts.push(row.topic);
      break;
    default:
      if (row.topic) parts.push(row.topic);
      if (row.tier) parts.push(row.tier);
  }
  return parts.join(' · ');
}

/** The rows' source runs, deduped — one paper_marking_runs read for the paper names. */
export function sourceRunIds(rows: Pick<AssignmentRow, 'source' | 'source_run_id'>[]): string[] {
  const ids = new Set<string>();
  for (const r of rows) if (sectionFor(r.source) === 'practice-again' && r.source_run_id) ids.add(r.source_run_id);
  return [...ids];
}
