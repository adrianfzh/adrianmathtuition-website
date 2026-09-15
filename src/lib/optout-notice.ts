// The two Telegram messages the holiday opt-out produces, as pure text.
//
// Adrian, 16 Sep 2026: "give me a telegram message instead for opt outs", and
// then — on the draft — yes to both halves:
//   1. the line he already got on every press, rewritten in plain English
//      ("4 blocked ahead" told him nothing), and
//   2. a standing roll-up on the 1st of November, December and January,
//      first thing, so he sees who is skipping before those invoices are made.
//
// Both live here, pure and tested, so the wording can be reviewed without
// sending anything — the same reason lib/holiday-message.ts exists for the
// parent-facing copy. The Airtable reading is lib/optout-rollup.ts.
//
// House rules that shaped the wording:
//   • No pronouns for a student. Nothing here knows anybody's pronouns, and a
//     guess from a name is exactly the wrong way to find out — so the copy is
//     written to not need one ("December's invoice", never "her invoice").
//   • Money is stated only when the rate is known; a missing rate drops the
//     clause rather than printing "$0".
//   • Adrian's own per-date skips land in the same Airtable rows, so a month he
//     part-skipped by hand is called out as partial and never claimed as $0.

import { sgtTodayISO } from './sgt';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** The months whose invoices the roll-up wants to arrive in front of. */
export const ROLLUP_MONTHS = [11, 12, 1] as const;

/**
 * Does today deserve a roll-up? Adrian, 16 Sep 2026: "once on the 1st of
 * November, December and January, first thing in the morning, just before
 * those invoices get made".
 *
 * The cron itself fires EVERY morning and asks this — one vercel.json entry
 * that answers a question, rather than three date-keyed entries whose
 * month-length arithmetic is a standing invitation to be wrong. Singapore
 * dates only: the job runs at 23:30 UTC, which is already tomorrow in SGT.
 */
export function shouldSendRollup(now: Date | number = Date.now()): boolean {
  const iso = sgtTodayISO(now instanceof Date ? now.getTime() : now);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return false;
  return Number(m[3]) === 1 && (ROLLUP_MONTHS as readonly number[]).includes(Number(m[2]));
}

/** Telegram sends with parse_mode HTML; a student's name is not our text. */
export function escapeHtml(s: string): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** "November 2026" → "Nov". Anything else comes back trimmed, unchanged. */
export function shortMonth(label: string): string {
  const m = /^([A-Z][a-z]+)\s+\d{4}$/.exec(String(label || '').trim());
  if (!m) return String(label || '').trim();
  const i = MONTHS.indexOf(m[1]);
  return i < 0 ? m[1] : MONTHS[i].slice(0, 3);
}

/** "$630", or null when we don't know the rate — never a made-up figure. */
export function money(lessons: number, rate?: number | null): string | null {
  if (!rate || !Number.isFinite(rate) || lessons <= 0) return null;
  const total = Math.round(lessons * rate * 100) / 100;
  return `$${total % 1 === 0 ? total.toFixed(0) : total.toFixed(2)}`;
}

/** "November and December"; "November, December and January". */
export function joinList(items: readonly string[]): string {
  const l = items.filter(Boolean);
  if (l.length <= 1) return l[0] || '';
  return `${l.slice(0, -1).join(', ')} and ${l[l.length - 1]}`;
}

/** "Sec 2", "Sec 4 IP" — the bracket after the name, or ''. */
export function levelTag(level?: string | null, ip?: boolean): string {
  const l = String(level || '').trim();
  if (!l) return '';
  return ip && /^Sec [45]$/.test(l) ? `${l} IP` : l;
}

export type SkipMonth = { label: string; lessons: number };
export type RosterEntry = { name: string; months: string[] };

/** One month as it stands after a press — the shape lib/holiday-optout's
 *  monthChoices already returns, narrowed to what the wording needs. */
export type MonthAfter = { label: string; lessonCount: number; skipped: boolean; partial: boolean };

export interface PressNoticeInput {
  name: string;
  level?: string | null;
  ip?: boolean;
  /** Months the parent just switched OFF, as stored labels ("December 2026"). */
  nowSkipping?: readonly string[];
  /** Months the parent just switched back ON. */
  nowKeeping?: readonly string[];
  /** Every optional month, as it stands after the write, in calendar order. */
  after: readonly MonthAfter[];
  ratePerLesson?: number | null;
  /** Dates applyOptoutChanges refused to touch: "2026-11-08 (Completed)". */
  leftAlone?: readonly string[];
  /** Everyone skipping at least one month right now, this student included. */
  roster?: readonly RosterEntry[];
}

/**
 * The line Adrian gets the moment a parent confirms. Replaces
 *
 *     🗓 Jeanette Tan — holiday months changed by parent
 *     • Skipping: December 2026
 *     (0 cancelled, 4 blocked ahead, 0 restored)
 *
 * The counts are gone on purpose: they describe what the WRITE did, which is
 * our business, not his. What he needs to know is which months are off, how
 * many lessons and dollars that is, and that nothing is waiting on him.
 */
export function pressNotice(i: PressNoticeInput): string {
  const tag = levelTag(i.level, i.ip);
  const who = `<b>${escapeHtml(i.name || 'A student')}</b>${tag ? ` (${escapeHtml(tag)})` : ''}`;

  const justOff = (i.nowSkipping || []).map(shortMonthFull);
  const justOn = (i.nowKeeping || []).map(shortMonthFull);
  const headBits: string[] = [];
  if (justOff.length) headBits.push(`skipping ${joinList(justOff)}`);
  if (justOn.length) headBits.push(`${joinList(justOn)} back on`);
  const head = `🗓 ${who} — ${headBits.join(', ') || 'holiday months changed'}`;

  const lines: string[] = [head, 'Pressed the button in the invoice email.', ''];

  const off = i.after.filter((m) => m.skipped);
  const partial = i.after.filter((m) => m.partial);
  const on = i.after.filter((m) => !m.skipped && !m.partial && m.lessonCount > 0);

  if (off.length) {
    const lessons = off.reduce((n, m) => n + m.lessonCount, 0);
    const amount = money(lessons, i.ratePerLesson);
    lines.push(`Off: ${off.map((m) => `${shortMonthFull(m.label)} (${lessonWord(m.lessonCount)})`).join(' · ')}${amount ? ` — ${amount} not billed` : ''}`);
  }
  for (const m of partial) {
    lines.push(`Part-skipped: ${shortMonthFull(m.label)} — some dates off, some still on`);
  }
  if (on.length) {
    lines.push(`Still on: ${on.map((m) => `${shortMonthFull(m.label)} (${lessonWord(m.lessonCount)})`).join(' · ')}`);
  }

  lines.push('');
  if (off.length) {
    lines.push(`${joinList(off.map((m) => shortMonthFull(m.label)))}${off.length === 1 ? "'s invoice" : ' invoices'} will come out at $0. The calendar is already updated — nothing to do.`);
  } else {
    lines.push('No months are being skipped now — billing carries on as usual.');
  }

  if (i.leftAlone && i.leftAlone.length) {
    lines.push(`⚠ Left alone: ${i.leftAlone.join(', ')} — these were already taught or cancelled, so they weren't touched.`);
  }

  const roster = (i.roster || []).filter((r) => r.months.length);
  if (roster.length) {
    lines.push('');
    lines.push(`Skipping so far: ${roster.map((r) => `${escapeHtml(r.name)} (${r.months.join(', ')})`).join(' · ')}`);
  }

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** "December 2026" → "December" (the year is never in doubt in a live notice). */
function shortMonthFull(label: string): string {
  const m = /^([A-Z][a-z]+)\s+\d{4}$/.exec(String(label || '').trim());
  return m ? m[1] : String(label || '').trim();
}

function lessonWord(n: number): string {
  return `${n} lesson${n === 1 ? '' : 's'}`;
}

export interface RollupStudent {
  name: string;
  level?: string | null;
  ip?: boolean;
  /** Months with at least one skipped lesson, calendar order. */
  months: readonly SkipMonth[];
  ratePerLesson?: number | null;
}

export interface RollupOptions {
  /** How many families were offered the button at all — the denominator. */
  offered?: number | null;
  /** The optional months still ahead, stored labels, for the per-month tally. */
  window?: readonly string[];
  /** For the date in the heading. */
  now?: Date;
}

/**
 * The standing picture, sent on the 1st of November, December and January at
 * 7:30am SGT — half an hour before the arrears generator builds those invoices.
 *
 * Returns '' when nobody has opted out: an empty roll-up every quiet month is
 * how a message trains itself to be ignored. The job_runs stamp is what proves
 * the job ran (docs/OPS.md) — absence of the message is never absence of the job.
 */
export function rollupMessage(students: readonly RollupStudent[], opts: RollupOptions = {}): string {
  const live = students.filter((s) => s.months.some((m) => m.lessons > 0));
  if (!live.length) return '';

  const iso = sgtTodayISO((opts.now || new Date()).getTime());
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  const heading = d ? `🗓 <b>Holiday opt-outs</b> — ${Number(d[3])} ${MONTHS[Number(d[2]) - 1]}` : '🗓 <b>Holiday opt-outs</b>';

  const offered = opts.offered && opts.offered > 0 ? opts.offered : null;
  const lines: string[] = [heading];
  lines.push(offered
    ? `${live.length} of the ${offered} families with the button ${live.length === 1 ? 'has' : 'have'} chosen months off.`
    : `${live.length} ${live.length === 1 ? 'family has' : 'families have'} chosen months off.`);
  lines.push('');

  for (const s of live) {
    const tag = levelTag(s.level, s.ip);
    const lessons = s.months.reduce((n, m) => n + m.lessons, 0);
    const amount = money(lessons, s.ratePerLesson);
    lines.push(`• <b>${escapeHtml(s.name)}</b>${tag ? ` (${escapeHtml(tag)})` : ''} — ${s.months.map((m) => shortMonth(m.label)).join(', ')} · ${lessonWord(lessons)}${amount ? ` · ${amount}` : ''}`);
  }

  const window = (opts.window || []).filter(Boolean);
  if (window.length) {
    lines.push('');
    for (const label of window) {
      const skipping = live.filter((s) => s.months.some((m) => m.label === label && m.lessons > 0)).length;
      const rest = offered ? `, ${offered - skipping} on as usual` : '';
      lines.push(`${shortMonthFull(label)}: ${skipping} skipping${rest}`);
    }
  }

  return lines.join('\n').trim();
}
