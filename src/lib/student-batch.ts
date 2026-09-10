// The student's own tick: ONE Practice Again sheet for two or three of their
// papers (Adrian, 11 Sep 2026: "build the student door with three-paper, 5-day
// limit").
//
// Adrian's desk has had the tick since 10 Sep 2026 — he ticks several of a
// student's papers of the same maths and one merged sheet is written for all of
// them (docs/MARKING.md § Practice Again batches; lib/sheet-queue
// `sheetBatchGuard` / `queueSheetBatch`). This file is the STUDENT's version of
// that tick, and it is deliberately narrower than his:
//
//   • two or three papers, never more — a sheet that tries to teach four
//     papers teaches none of them;
//   • one maths — A Math with A Math, E Math with E Math, the same rule the
//     desk batch has;
//   • papers marked in the last 5 days — a merged sheet is for the run of
//     papers they have just sat, not for a term's worth;
//   • nothing in flight — a paper whose sheet is being written now is not
//     ticked into a second one;
//   • and the STRONG rule: a batch that lost fewer than 10 marks between all
//     its papers gets no sheet at all. Adrian: recommend new exam papers
//     instead. A Practice Again sheet built on three or four dropped marks
//     teaches slips, and slips earn no practice (docs/MARKING.md, 10 Sep 2026).
//
// Everything here is pure. The route (api/portal/practice-again/request) reads
// the runs and the live sheet jobs and asks `studentBatchGuard`; the Papers
// list's tick mode (app/marking/ChoosePapers.tsx) asks `pickStates` /
// `tickBar` so the screen and the server can never disagree about what may be
// ticked.
import { sheetQueueGuard, type SheetBatchRun, type SheetQueueRefusal } from './sheet-queue';

/** Two at least — a single paper has its own Request button. */
export const MIN_BATCH_PAPERS = 2;
/** Three at most (Adrian, 11 Sep 2026). The UI refuses the fourth tick. */
export const MAX_BATCH_PAPERS = 3;
/** How recently a paper must have been marked to join a batch. */
export const BATCH_WINDOW_DAYS = 5;
/**
 * Under this many marks lost across the whole batch there is nothing worth a
 * sheet. Ten is one question's worth on an O-Level paper: below it the losses
 * are slips, and slips earn no practice.
 */
export const STRONG_BATCH_MARKS = 10;

const DAY_MS = 24 * 60 * 60 * 1000;

// ── Marks lost ───────────────────────────────────────────────────────────────

/** A run as the marks arithmetic sees it: the stored columns first, `result_json.totals` behind them. */
export type MarksRun = {
  total_awarded?: number | null;
  total_max?: number | null;
  result_json?: unknown;
};

function finite(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * One paper's marks, or null when the run carries none. The stored columns win
 * because a triage override writes them (and `result_json.totals` alongside);
 * `totals.max` — not `counted_max` — is the paper's real total, so a paper only
 * half handed in reads as a big loss and gets its sheet, which is the safe way
 * round.
 */
export function paperMarks(run: MarksRun | null | undefined): { awarded: number; max: number } | null {
  if (!run) return null;
  const col = { awarded: finite(run.total_awarded), max: finite(run.total_max) };
  if (col.awarded !== null && col.max !== null) return { awarded: col.awarded, max: col.max };
  const rj = run.result_json && typeof run.result_json === 'object' ? (run.result_json as Record<string, unknown>) : null;
  const t = rj && typeof rj.totals === 'object' && rj.totals ? (rj.totals as Record<string, unknown>) : null;
  const awarded = finite(t?.awarded), max = finite(t?.max);
  return awarded !== null && max !== null ? { awarded, max } : null;
}

/**
 * Marks lost across the batch, and how many of its papers could be counted.
 * `known === 0` means no paper carried totals — then the strong rule cannot be
 * judged and is skipped rather than guessed.
 */
export function marksLostAcross(runs: readonly (MarksRun | null | undefined)[]): { lost: number; known: number } {
  let lost = 0, known = 0;
  for (const r of runs) {
    const m = paperMarks(r);
    if (!m) continue;
    known++;
    lost += Math.max(0, m.max - m.awarded);
  }
  return { lost, known };
}

// ── The guard ────────────────────────────────────────────────────────────────

export type StudentBatchRun = SheetBatchRun & { total_awarded?: number | null; total_max?: number | null };

/** A live sheet job as the guard sees it — `run_ids` carries a batch job's whole list. */
export type StudentBatchJob = { id: string; status: string; run_id?: string | null; run_ids?: string[] | null };

export type StudentBatchStatus =
  | SheetQueueRefusal['status']
  | 'count'
  | 'mixed-subjects'
  | 'stale'
  | 'in-flight'
  | 'strong';

export type StudentBatchRefusal = {
  ok: false;
  status: StudentBatchStatus;
  /** 200 for `strong` — it is an answer, not an error. */
  http: 200 | 400 | 404 | 409;
  /** Student-facing copy, ready to render. */
  message: string;
  /** Where the copy sends them instead (the strong batch → print a new paper). */
  href?: string;
  runId?: string;
};

export type StudentBatchOk = {
  ok: true;
  /** Newest paper first — the same order queueSheetBatch picks its primary from. */
  runIds: string[];
  subject: string;
  marksLost: number;
};

const IN_FLIGHT = new Set(['queued', 'claimed']);

const subjectOf = (r: { paper_subject?: string | null }) => String(r.paper_subject ?? '').trim();
const nameOf = (r: { paper_name?: string | null }) => String(r.paper_name || 'that paper').trim();

/** Every run a job covers, as ids. */
function jobCovers(job: StudentBatchJob): string[] {
  const out = [job.run_id, ...(Array.isArray(job.run_ids) ? job.run_ids : [])];
  return out.filter((x): x is string => !!x);
}

/**
 * May ONE sheet be written for the papers this student ticked? Pure.
 *
 * `runs` are the rows in the order asked for, with a null wherever the paper is
 * not the student's own released run (the route's ownership query drops those,
 * so a null IS "not yours, or not out yet"). `jobs` are every sheet job that
 * covers any of them.
 *
 * `wave: 2` is a CONTINUATION of a sheet the student already has — the papers
 * are the same ones and the gaps were chosen when the first sheet was written,
 * so the 5-day window and the strong rule (both of which ask "is this batch
 * worth starting") no longer apply. Ownership, one maths, and nothing in
 * flight still do.
 */
export function studentBatchGuard(
  runs: readonly (StudentBatchRun | null | undefined)[],
  jobs: readonly StudentBatchJob[],
  opts: { now?: number; wave?: number } = {},
): StudentBatchRefusal | StudentBatchOk {
  const now = opts.now ?? Date.now();
  const wave = Number(opts.wave || 1);
  const continuation = wave >= 2;

  const live = runs.filter((r): r is StudentBatchRun => !!r && !!r.id);
  if (live.length < runs.length) {
    return { ok: false, status: 'not-found', http: 404, message: 'One of those papers is not yours, or is not out yet.' };
  }
  const distinct = Array.from(new Map(live.map(r => [r.id, r])).values());
  if (distinct.length < MIN_BATCH_PAPERS) {
    return { ok: false, status: 'count', http: 400, message: 'Choose two or three papers for one sheet.' };
  }
  if (distinct.length > MAX_BATCH_PAPERS) {
    return { ok: false, status: 'count', http: 400, message: 'Three papers at most for one sheet.' };
  }

  // The same per-paper rules both doors have had since 8 Sep 2026 — tagged,
  // marked, out, maths, and never a returned Practice Again sheet. Passing no
  // jobs here is deliberate: the batch's own in-flight rule is below, and a
  // FINISHED sheet is not a refusal (the worker reuses its examples).
  for (const r of distinct) {
    const g = sheetQueueGuard(r, [], { requestedBy: 'student' });
    if (!g.ok) return { ...g, runId: r.id };
  }

  if (new Set(distinct.map(subjectOf)).size > 1) {
    return {
      ok: false, status: 'mixed-subjects', http: 400,
      message: 'One sheet is for one maths — choose A Math papers or E Math papers, not both.',
    };
  }

  if (!continuation) {
    const stale = distinct.find(r => {
      const t = Date.parse(String(r.created_at ?? ''));
      return Number.isFinite(t) && now - t > BATCH_WINDOW_DAYS * DAY_MS;
    });
    if (stale) {
      return {
        ok: false, status: 'stale', http: 400,
        message: `One sheet covers papers marked in the last ${BATCH_WINDOW_DAYS} days — ${nameOf(stale)} is older than that. Ask for its own sheet instead.`,
        runId: stale.id,
      };
    }
  }

  const ids = new Set(distinct.map(r => r.id));
  const busy = jobs.find(j => IN_FLIGHT.has(j.status) && jobCovers(j).some(id => ids.has(id)));
  if (busy) {
    const on = distinct.find(r => jobCovers(busy).includes(r.id));
    return {
      ok: false, status: 'in-flight', http: 409,
      message: `A sheet is already being written for ${on ? nameOf(on) : 'one of those papers'} — wait for it, then ask again.`,
      runId: on?.id,
    };
  }

  const { lost, known } = marksLostAcross(distinct);
  if (!continuation && known > 0 && lost < STRONG_BATCH_MARKS) {
    return {
      ok: false, status: 'strong', http: 200,
      message: `These papers are strong — under ${STRONG_BATCH_MARKS} marks lost between them. A Practice Again sheet would have little to teach. Try a new paper instead.`,
      href: '/app/print',
    };
  }

  // Newest first, so queueSheetBatch's primary is the paper they just sat.
  const sorted = [...distinct].sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')));
  return { ok: true, runIds: sorted.map(r => r.id), subject: subjectOf(sorted[0]) || 'maths', marksLost: lost };
}

// ── Wave two ─────────────────────────────────────────────────────────────────

/**
 * The gaps a finished sheet kept back, as stored on the job. Two shapes, both
 * live: `result.gaps.shelved` — the richer report the worker writes since 11 Sep
 * 2026, one entry per gap with its paper, questions, marks and the reason it was
 * held — and the older flat `result.shelved` list of names. Empty when the job
 * wrote no sheet, or shelved nothing.
 */
export function shelvedGaps(result: unknown): string[] {
  const r = result && typeof result === 'object' ? (result as Record<string, unknown>) : null;
  if (!r || r.noSheet) return [];
  const gaps = r.gaps && typeof r.gaps === 'object' ? (r.gaps as Record<string, unknown>) : null;
  const rich = Array.isArray(gaps?.shelved) ? gaps.shelved : null;
  const raw = rich ?? (Array.isArray(r.shelved) ? r.shelved : []);
  return raw
    .map(x => (x && typeof x === 'object' ? String((x as { skill?: unknown }).skill ?? '') : String(x ?? '')).trim())
    .filter(Boolean)
    .slice(0, 20);
}

// The wave-two `focus` line itself lives beside the job insert it feeds
// (lib/sheet-queue `waveTwoFocus` / `focusText`); re-exported here so the wave
// belongs to one file as far as its readers are concerned.
export { waveTwoFocus } from './sheet-queue';

// ── What Adrian's Telegram says ──────────────────────────────────────────────

/**
 * The paper as it reads in a list where the maths is already named — the
 * display name with its leading level dropped ("A Math · GCE 2025 · Paper 1" →
 * "GCE 2025 · Paper 1"). Pure.
 */
export function shortPaperName(displayName: string): string {
  return String(displayName || '').replace(/^\s*(?:A|E|H1|H2)\s*Math\s*·\s*/i, '').trim() || String(displayName || '').trim();
}

/**
 * The ONE line to the marking topic when a student asks for a sheet. Takes
 * Telegram-escaped text and returns HTML (lib/telegram-html escapes at the call
 * site). Pure, so the wording is pinned by a test rather than by reading a
 * Telegram message afterwards.
 */
export function practiceAgainRequestLine(o: {
  who: string;
  /** Short paper names, newest first. One = the single-paper door. */
  papers: readonly string[];
  /** 'A Math' | 'E Math' | … — named only on a batch. */
  subject?: string;
  wave?: number;
}): string {
  const wave = Number(o.wave || 1);
  const tail = wave >= 2
    ? 'It teaches what the last sheet shelved and goes out on its own once written and checked.'
    : 'It goes out on its own once written and checked; a gate failure holds it on the desk for you.';
  const asked = wave >= 2 ? 'asked for the next wave of their Practice Again sheet' : 'asked for Practice Again';
  if (o.papers.length <= 1) {
    return `📘 <b>${o.who}</b> ${asked} on ${o.papers[0] || 'a marked paper'} from the app — queued for the Mac. ${tail}`;
  }
  const what = wave >= 2 ? 'the next wave of their Practice Again sheet' : 'ONE Practice Again sheet';
  const inside = [o.subject, o.papers.join(', ')].filter(Boolean).join(' · ');
  return `📘 <b>${o.who}</b> asked for ${what} for ${o.papers.length} papers (${inside}) from the app — queued for the Mac. ${tail}`;
}

// ── Tick mode on the Papers list ─────────────────────────────────────────────

/** One paper as the tick list sees it. Everything absolute is decided server-side. */
export type PickPaper = {
  id: string;
  name: string;
  /** 'A Math' | 'E Math' | 'H2 Math' | 'Other' | '' — the grouping key AND the pill. */
  subject: string;
  /** YYYY-MM-DD, for the row. */
  date: string;
  awarded: number;
  max: number;
  /**
   * Why this paper can never be ticked, whatever else is: "marked more than 5
   * days ago" · "a sheet is being written" · "a Practice Again sheet". Null =
   * tickable.
   */
  blocked: string | null;
};

export type PickState = { disabled: boolean; note: string | null };

/** The note a paper wears when it is outside the window. */
export const NOTE_STALE = `marked more than ${BATCH_WINDOW_DAYS} days ago`;
/** The note a paper wears while its own sheet is being written. */
export const NOTE_IN_FLIGHT = 'a sheet is being written';
/** A returned Practice Again sheet is not a paper you practise again. */
export const NOTE_PRACTICE_AGAIN = 'a Practice Again sheet';

/**
 * Is this paper outside the window? Pure — the server stamps `blocked` with it
 * so the screen and the guard agree on the same 5 days.
 */
export function outsideWindow(markedAt: string | null | undefined, now = Date.now()): boolean {
  const t = Date.parse(String(markedAt ?? ''));
  return Number.isFinite(t) && now - t > BATCH_WINDOW_DAYS * DAY_MS;
}

/**
 * Per-paper tick state given what is ticked already. Pure.
 *
 * A ticked paper is never disabled (it must always be untickable again). The
 * first tick decides the maths: everything else greys out with "different
 * maths". The third tick closes the list — the fourth is refused on screen, so
 * the student never sends a request the server would only bounce.
 */
export function pickStates(
  papers: readonly PickPaper[],
  ticked: readonly string[],
): Map<string, PickState> {
  const on = new Set(ticked);
  const first = papers.find(p => on.has(p.id));
  const full = on.size >= MAX_BATCH_PAPERS;
  const out = new Map<string, PickState>();
  for (const p of papers) {
    if (on.has(p.id)) { out.set(p.id, { disabled: false, note: null }); continue; }
    if (p.blocked) { out.set(p.id, { disabled: true, note: p.blocked }); continue; }
    if (first && p.subject !== first.subject) { out.set(p.id, { disabled: true, note: 'different maths' }); continue; }
    if (full) { out.set(p.id, { disabled: true, note: 'three papers at most' }); continue; }
    out.set(p.id, { disabled: false, note: null });
  }
  return out;
}

export type TickBar = { line: string; canRequest: boolean };

/** How the maths reads in a sentence — an untagged paper has no name for it. */
function subjectWord(subject: string): string {
  return subject && subject !== 'Other' ? subject : 'maths';
}

/**
 * The sticky bar's one line, and whether Request is live. Pure — the same
 * shape as the desk's `tickPlanLine`, in the student's words.
 */
export function tickBar(picked: readonly PickPaper[]): TickBar {
  if (picked.length === 0) return { line: '', canRequest: false };
  if (picked.length < MIN_BATCH_PAPERS) {
    return { line: `Tick another ${subjectWord(picked[0].subject)} paper to make one sheet`, canRequest: false };
  }
  if (picked.length > MAX_BATCH_PAPERS) {
    return { line: 'Three papers at most — untick one.', canRequest: false };
  }
  return {
    line: `One Practice Again sheet for ${picked.length} papers · ${subjectWord(picked[0].subject)} · the same gap in two papers becomes one section`,
    canRequest: true,
  };
}
