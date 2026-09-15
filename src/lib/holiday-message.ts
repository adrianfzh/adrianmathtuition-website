// The October–December holiday note that rides on a non-exam-year invoice —
// and the one bullet in it that changes with the student's level.
//
// Adrian, 15 Sep 2026: "are you able to do the send code picking up by level?"
// and then, narrowing it: "don't have to send 'Next year is a step up' to Sec 1
// students, and only send to Sec 3 students if they are taking A Math together
// with E Math (don't have to send to students just taking E Math)."
//
// So the ⬇ bullet is NOT a per-level lookup with an entry for everyone — it is
// a bullet that is often ABSENT:
//
//   Sec 2            → the A-Math-next-year version   (incl. IP)
//   Sec 3 A+E Math   → the O-Level-year version
//   JC1              → the JC2-pace version
//   Sec 1            → nothing
//   Sec 3 E Math only→ nothing
//   anything else    → nothing (exam years get their own note entirely)
//
// A student with no version simply gets a three-bullet email. Silence is the
// safe default here: an absent bullet is invisible, a wrong one tells a parent
// their child is about to start a subject they are not taking.
//
// Everything is a pure function over the Airtable fields so the copy can be
// reviewed and tested without sending anything — see holiday-message.test.ts.

/** The Airtable fields this module reads, named as they are stored. */
export interface StudentForHoliday {
  level?: string | null;            // Students.Level — 'Sec 1' … 'JC2'
  subjects?: readonly string[] | null; // Students.Subjects — e.g. ['E Math','A Math']
}

/** Months the holiday note applies to (1-indexed), matching ARREARS_MONTHS. */
export const HOLIDAY_MONTHS = [10, 11, 12] as const;

/** Levels that hear about the holidays at all. Exam years get their own note. */
const HOLIDAY_LEVELS = new Set(['Sec 1', 'Sec 2', 'Sec 3', 'JC1']);

/**
 * Does this student take A Math alongside E Math?
 * Deliberately literal: 'A Math' must be listed. A Sec 3 filed as plain 'Math'
 * or 'E Math' is NOT assumed to be taking A Math — Bhanu Naga Shreyas is filed
 * as 'Math' (G2) and must not be told the workload is about to double.
 */
export function takesAMath(s: StudentForHoliday): boolean {
  return (s.subjects ?? []).some((x) => (x || '').trim() === 'A Math');
}

/** Whether the holiday note goes to this student at all, for this invoice month. */
export function wantsHolidayNote(s: StudentForHoliday, month: number): boolean {
  return HOLIDAY_LEVELS.has((s.level || '').trim()) && (HOLIDAY_MONTHS as readonly number[]).includes(month);
}

/**
 * The ⬇ "Next year is a step up" bullet for this student, or null when they
 * get none. Returned WITHOUT markup so the caller decides how to render it.
 */
export function stepUpParagraph(s: StudentForHoliday): string | null {
  const level = (s.level || '').trim();
  if (level === 'Sec 2') {
    return 'If [Student] takes A Math next year, it becomes two maths subjects instead of one — '
      + 'twice the work, and harder material in both. For students heading that way, keeping '
      + 'lessons going over the holidays can make a real difference.';
  }
  if (level === 'Sec 3') {
    // Adrian's rule: only the A Math + E Math students. E-Math-only Sec 3s get
    // a three-bullet email.
    if (!takesAMath(s)) return null;
    return 'Sec 4 is the O-Level year, with both A Math and E Math to get through. The holidays '
      + 'are a good time to catch up on anything still shaky, or to learn ahead, so that next '
      + 'year is a good deal easier.';
  }
  if (level === 'JC1') {
    return 'The pace in JC2 is considerably faster and the work is harder. The holidays are a '
      + 'good time to get ahead, so that [Student] is not short of time later in the year.';
  }
  // Sec 1 and everyone else: no bullet.
  return null;
}

const MONTH_NAMES = ['january','february','march','april','may','june','july','august','september','october','november','december'];

/**
 * Month number (1-12) from an invoice's STORED `Month` field ("October 2026").
 * Never pass the DISPLAY month — a combined invoice renders as "July–August
 * 2026" and would resolve to July, which is not the month being billed.
 * Unparseable → 0, which no rule matches, so the note is simply omitted.
 */
export function invoiceMonthNumber(storedMonth: string | null | undefined): number {
  const first = (storedMonth || '').trim().toLowerCase().split(/[\s\u2013\u2014-]+/)[0];
  const i = MONTH_NAMES.indexOf(first);
  return i === -1 ? 0 : i + 1;
}

/** Substitute the student's first name into the copy's [Student] placeholders. */
export function withName(text: string, studentName: string): string {
  const first = (studentName || '').trim().split(/\s+/)[0] || 'your child';
  return text.replace(/\[Student\]/g, first);
}

// Everything here is interpolated into email HTML, and since the opt-out button
// landed, one of them goes into an href="" ATTRIBUTE. Escaping only <, > and &
// was enough while every escaped string was element text; it is not enough now —
// a URL carrying a double quote would close the attribute and whatever followed
// would be read as markup. Caught by holiday-message.test.ts, 15 Sep 2026.
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * The whole holiday block as email HTML, or '' when this student/month gets none.
 * The bullets are fixed copy; only the ⬇ one varies, and it is dropped entirely
 * when `stepUpParagraph` returns null.
 */
export function holidayNoteHtml(
  s: StudentForHoliday,
  month: number,
  studentName: string,
  // The parent's signed "Choose which months to skip" link, when one could be
  // minted (lib/holiday-optout-token). Omitted → the button is left out and
  // replying to the email is the only route offered, which still works.
  optOutUrl?: string | null,
): string {
  if (!wantsHolidayNote(s, month)) return '';
  const name = withName('[Student]', studentName);
  const step = stepUpParagraph(s);

  // Adrian, 15 Sep 2026: "make sure it's not pushy - just word of advice" — and
  // then, on my draft of it: keep "that said...", remove "either way is
  // completely fine..". His own line ("That said, I would encourage students to
  // keep attending regular lessons if they can.") is the heading; it is a
  // recommendation in his voice, not a hedge. The reasons are offered once, with
  // no superlatives and no promises about results, and the opt-out is stated
  // first and last so it never reads as something to be talked out of.
  const bullets: [string, string][] = [
    ['Consistency is most of the work.',
      'Maths rewards steady practice more than intensity. Students who stop for six or eight weeks '
      + 'often come back to a cold start, and the first few lessons back are spent recovering ground '
      + 'rather than covering new work.'],
    ['Holidays are a good time to learn ahead, or to catch up.',
      'With no school and no deadlines, students can focus on new topics or shore up weak areas without '
      + 'anything else competing for their attention. In my experience students who keep up regular '
      + 'lessons over the holidays tend to come back ahead, and find the start of the school year easier.'],
    ...(step ? ([['Next year is a step up.', withName(step, studentName)]] as [string, string][]) : []),
    ['Smaller classes.',
      'Fewer students come in over the holidays, so lessons are closer to one-to-one than they are during term time.'],
  ];

  const li = bullets
    .map(([head, body]) => `<li style="margin-bottom:8px;"><strong>${esc(head)}</strong> ${esc(body)}</li>`)
    .join('\n      ');

  const button = optOutUrl
    ? `
      <p style="margin:14px 0 6px;text-align:center;">
        <a href="${esc(optOutUrl)}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:11px 22px;border-radius:8px;font-weight:600;font-size:15px;">Choose which months to skip</a>
      </p>
      <p style="margin:0 0 10px;font-size:13px;color:#6b7280;text-align:center;">Nothing changes until you press Confirm on that page. You can change it again later from the same link.</p>`
    : '';

  return `
    <div style="background:#f8fafc;border-left:3px solid #cbd5e1;padding:12px 16px;margin:16px 0;">
      <p style="margin:0 0 10px;"><strong>Lessons carry on as usual through October, November and December, but they are optional over these three months.</strong> If ${esc(name)} is travelling, resting, or you would simply rather pause, you can opt out of any of October, November or December — those months come off the schedule and off the invoice. Students who opt out can still come in for one-off lessons during the break, booked ad hoc and billed per lesson.</p>
      <p style="margin:0 0 10px;"><strong>If you are away for only part of a month, you don't need to opt out.</strong> Move those lessons with the WhatsApp assistant (details at the foot of this email) or just tell me the dates, and ${esc(name)} will get make-up lessons for whatever is missed.</p>
      <p style="margin:0 0 6px;"><strong>That said, I would encourage students to keep attending regular lessons if they can.</strong></p>
      <ul style="margin:0 0 10px;padding-left:20px;">
      ${li}
      </ul>
      <p style="margin:0 0 10px;"><strong>Two periods when I will be away:</strong> Wed 28 October – Sun 1 November, and Sat 5 December – Sat 12 December. If ${esc(name)} is attending regular lessons as usual, I will provide make-up lessons for every lesson that falls in those two windows — the WhatsApp assistant can book them, or I will arrange them with you.</p>
      <p style="margin:0 0 4px;">To opt out of any month, tap the button below and pick the months there, or just reply to this email. Anything you do not tell me about stays as it is.</p>${button}
    </div>`;
}
