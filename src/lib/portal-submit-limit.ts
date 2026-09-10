// One EXAM-PAPER hand-in per student per Singapore calendar day (Adrian, 21 Aug
// 2026, Phase G hardening — every hand-in is auto-queued into Opus marking and
// Telegrams a finished PDF, so the cap is a cost brake as much as a UX one).
// Since 7 Sep 2026 only a FREE hand-in spends the day: a Practice Again / From
// Adrian sheet (result_json.assignment_id) and a printed bank paper
// (result_json.generated_paper_id) are exempt at submit time AND in the count —
// before this they were exempt only at submit time, so a sheet handed in at
// breakfast blocked the exam paper at dinner (Adrian: "can only put the quota of
// 1 only for exam papers submission … printed papers don't count").
// SGT is UTC+8 with no DST, so the day boundary needs no timezone library.
import { sgtDayStartISO } from './sgt';

export const DAILY_SUBMIT_CAP = 1;

// 🧪 Science has ITS OWN slot (SPEC-SCIENCE-MARKING.md, 10 Sep 2026): one science
// paper a day, counted apart from the maths paper, so a physics hand-in never
// blocks the evening's E Math paper. `family` picks which runs count:
// 'math' = runs whose marking lane is math, 'science' = every other lane.
export const DAILY_SCIENCE_SUBMIT_CAP = 1;
export type HandinFamily = 'math' | 'science';

/** UTC ISO timestamp of the most recent midnight in Singapore (UTC+8). */
export function sgtStartOfDayIso(now: Date = new Date()): string {
  return sgtDayStartISO(now);
}

/**
 * Papers this student has handed in since SGT midnight, across BOTH surfaces.
 *
 * Adrian, 24 Aug 2026: "one paper per student per day." A student can reach the
 * marking queue two ways — here, and the Telegram bot's /handin — and until now
 * each side counted only its own, so one student could spend two slots in a day
 * (three, if a parent's Telegram was linked to the same record too). Both sides
 * now count the same thing, keyed on the STUDENT rather than on the browser
 * session or the Telegram chat. Papers Adrian uploads himself through
 * /admin/mark-paper carry neither marker and never spend a student's day.
 *
 * Two head-counts rather than one `.or()` over JSON paths: each filter shape is
 * already proven in this codebase, and a head count transfers no rows.
 */
type CountResult = { count: number | null; error: unknown };

interface CountQuery extends PromiseLike<CountResult> {
  gte(column: string, value: string): CountQuery;
  eq(column: string, value: string): CountQuery;
  is(column: string, value: null): CountQuery;
  not(column: string, operator: string, value: string | null): CountQuery;
}

export interface HandinCountingClient {
  from(table: string): {
    select(columns: string, options: { count: 'exact'; head: true }): CountQuery;
  };
}

export async function countHandinsToday(
  client: HandinCountingClient,
  studentId: string,
  now: Date = new Date(),
  family: HandinFamily = 'math',
): Promise<number> {
  const since = sgtStartOfDayIso(now);
  // The marking lane (paper_marking_runs.subject, default 'math') splits the two
  // families: the maths slot counts only maths runs, the science slot only the
  // rest. Runs from before the column existed carry the default and count as maths.
  const forStudent = () => {
    const q = client
      .from('paper_marking_runs')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', since)
      .eq('student_id', studentId);
    return family === 'science' ? q.not('subject', 'eq', 'math') : q.eq('subject', 'math');
  };

  // A missing JSON key reads as SQL NULL through `->`, so `.is(…, null)` keeps
  // exactly the free hand-ins: no assignment behind it, no printed paper behind it.
  const [telegram, portal] = await Promise.all([
    forStudent().not('result_json->telegram_handin', 'is', null),
    forStudent().eq('result_json->>portal_submission', 'true')
      .is('result_json->assignment_id', null)
      .is('result_json->generated_paper_id', null),
  ]);
  return (telegram.count ?? 0) + (portal.count ?? 0);
}
