// Resolving "where did a moved lesson actually END UP?".
//
// A rescheduled lesson points at its replacement via `Rescheduled Lesson ID`,
// and that replacement can itself be rescheduled — so the link is a CHAIN, not
// a single hop. The schedule chip used to read one hop and colour green only
// when that hop was 'Completed', which was wrong in both directions: a lesson
// moved twice then taught still showed as pending (20 live cases, 2026-07-17),
// and a makeup the student ALSO missed showed the same calm "upcoming" blue as
// a genuinely scheduled one (6 live cases) — so a never-delivered lesson looked
// settled. This module walks to the end of the chain and reports what actually
// happened, so the UI can colour by outcome instead of by first hop.
//
// Pure + unit-tested: no Airtable, no Date.now(). Callers pass todayISO.

/** What ultimately became of a moved lesson. */
export type ChainOutcome =
  | 'delivered'  // chain ends Completed — the student got the lesson
  | 'missed'     // chain ends Absent — never delivered, needs a new makeup
  | 'cancelled'  // chain ends Cancelled — written off, not owed
  | 'upcoming'   // chain ends Scheduled on a future date — genuinely pending
  | 'unmarked'   // chain ends Scheduled but the date has passed — attendance never marked
  | 'broken';    // dangling link, missing record, or a cycle — data problem

/** The minimum a lesson must expose to be walked. */
export interface ChainLesson {
  id: string;
  date: string;              // YYYY-MM-DD
  status: string;
  slotId?: string | null;
  rescheduledToId?: string | null;
}

export interface ChainResult {
  /** Terminal lesson of the chain (null when the very first link dangles). */
  finalId: string | null;
  finalDate: string;
  finalStatus: string;
  finalSlotId: string | null;
  /** Links followed. 1 = a plain single reschedule; >1 = it moved again. */
  hops: number;
  outcome: ChainOutcome;
}

/** Guards against a malformed self-referential loop in Airtable. */
const MAX_HOPS = 20;

function outcomeOf(status: string, date: string, todayISO: string): ChainOutcome {
  if (status === 'Completed') return 'delivered';
  if (status === 'Absent') return 'missed';
  // 'Cancelled - Prorated' is the live option name alongside 'Cancelled'.
  if (status.startsWith('Cancelled')) return 'cancelled';
  // Dates are YYYY-MM-DD, so lexical compare is chronological and TZ-free.
  if (status === 'Scheduled') return date >= todayISO ? 'upcoming' : 'unmarked';
  return 'broken';
}

/**
 * Follow `startId` through every reschedule hop to the lesson that actually
 * terminates the chain, and classify it.
 *
 * `byId` need only contain the lessons on the chain; a link to an id that is
 * absent yields `broken` (the caller fetched too shallow, or the record was
 * deleted) rather than throwing.
 */
export function resolveRescheduleChain(
  startId: string | null | undefined,
  byId: Record<string, ChainLesson>,
  todayISO: string,
): ChainResult {
  const none: ChainResult = {
    finalId: null, finalDate: '', finalStatus: '', finalSlotId: null,
    hops: 0, outcome: 'broken',
  };
  if (!startId) return none;

  const seen = new Set<string>();
  let cur = byId[startId];
  if (!cur) return none;

  let hops = 1;
  seen.add(startId);

  while (hops <= MAX_HOPS) {
    // Terminal unless this lesson was itself moved on to another one.
    if (cur.status !== 'Rescheduled') break;
    const next = cur.rescheduledToId;
    // Rescheduled with no forward link, or pointing at a record we don't have.
    if (!next || !byId[next]) {
      return {
        finalId: cur.id, finalDate: cur.date, finalStatus: cur.status,
        finalSlotId: cur.slotId ?? null, hops, outcome: 'broken',
      };
    }
    // A cycle would otherwise spin forever.
    if (seen.has(next)) {
      return {
        finalId: cur.id, finalDate: cur.date, finalStatus: cur.status,
        finalSlotId: cur.slotId ?? null, hops, outcome: 'broken',
      };
    }
    seen.add(next);
    cur = byId[next];
    hops++;
  }

  return {
    finalId: cur.id,
    finalDate: cur.date,
    finalStatus: cur.status,
    finalSlotId: cur.slotId ?? null,
    hops,
    outcome: outcomeOf(cur.status, cur.date, todayISO),
  };
}

/** Every id reachable from `startId`, for fetching a chain hop-by-hop. */
export function chainIdsFrom(
  startId: string,
  byId: Record<string, ChainLesson>,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>([startId]);
  let cur = byId[startId];
  while (cur && cur.status === 'Rescheduled' && cur.rescheduledToId) {
    const next: string = cur.rescheduledToId;
    if (seen.has(next)) break;
    seen.add(next);
    out.push(next);
    cur = byId[next];
  }
  return out;
}
