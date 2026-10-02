// A student leaving at the end of their exam year — the pure rules.
//
// Adrian, 29 Sep 2026, on Kayla (IP Sec 4, last exam 29 Sep) and Beryl: "how can
// we go about disenrolling graduating students?" … "yes change to 'Graduated'" …
// "the 25 sep [additional lesson] for kayla should automatically be generated
// and send out during the scheduled send outs right?"
//
// Two gaps this closes:
//   1. A leaver's LAST extra lessons were billed by nobody. Additional lessons
//      ride the NEXT month's advance invoice (generate-invoices), and a student
//      whose enrollment has ended gets no next invoice — Kayla's 25 Sep lesson
//      would have gone unbilled for ever. So when the last enrollment closes
//      (cron/end-enrollments, or Discontinue), one Draft 'Adjustment' invoice is
//      drafted for the Completed, un-billed Additional lessons up to the end
//      date, and the 15th's send cron sends it like a clean regular invoice.
//   2. A student who finished their exam year was filed as 'Inactive', the same
//      as one who quit mid-year. They are now 'Graduated' — a clean list for
//      the "coming back for JC?" message in January.

export const GRADUATED = 'Graduated';
export const INACTIVE = 'Inactive';

/** Levels whose year ends in a national (or, for IP, a school) exam. */
const FINAL_YEAR = /^(sec\s*4|sec\s*5|jc\s*2)$/i;

export function isFinalYearLevel(level: string | null | undefined): boolean {
  return FINAL_YEAR.test((level || '').trim());
}

/**
 * The Students.Status for someone whose last enrollment just ended: 'Graduated'
 * when they are in a final-year level and it ended in September or later (the
 * exam season), otherwise 'Inactive' — a Sec 4 who stops in March has left,
 * not graduated.
 */
export function leavingStatus(level: string | null | undefined, endISO: string | null | undefined): typeof GRADUATED | typeof INACTIVE {
  const m = /^\d{4}-(\d{2})-\d{2}$/.exec((endISO || '').trim());
  if (!m || !isFinalYearLevel(level)) return INACTIVE;
  return Number(m[1]) >= 9 ? GRADUATED : INACTIVE;
}

export interface ExtraLessonRow {
  id: string;
  date: string;
  studentId: string | null;
  status: string | null;
  billed: boolean;
  isRevisionMakeup: boolean;
  notes: string;
}

export function mapExtraLesson(r: { id: string; fields: Record<string, unknown> }): ExtraLessonRow {
  return {
    id: r.id,
    date: (r.fields['Date'] as string) || '',
    studentId: (r.fields['Student'] as string[] | undefined)?.[0] ?? null,
    status: (r.fields['Status'] as string | undefined) ?? null,
    billed: r.fields['Billed'] === true,
    isRevisionMakeup: r.fields['Is Revision Makeup'] === true,
    notes: (r.fields['Notes'] as string) || '',
  };
}

/** Every lesson date already on one of the student's invoices (Line Items and
 *  Line Items Extra), from non-voided invoices. The second guard after the
 *  Billed checkbox: extras billed before the checkbox existed carry no mark. */
export function invoicedDates(invoices: readonly { fields: Record<string, unknown> }[]): Set<string> {
  const out = new Set<string>();
  for (const inv of invoices) {
    if ((inv.fields['Status'] as string) === 'Voided') continue;
    for (const key of ['Line Items', 'Line Items Extra']) {
      try {
        for (const it of JSON.parse((inv.fields[key] as string) || '[]')) {
          if (it && typeof it.date === 'string') out.add(it.date);
        }
      } catch { /* malformed JSON — ignore this field */ }
    }
  }
  return out;
}

/**
 * The leaver's un-billed Additional lessons on or before their end date.
 * `bill` = Completed ones (what the final invoice carries); `unmarked` = ones
 * still 'Scheduled' although their date has passed — never billed blind, listed
 * so Adrian can mark attendance (Kayla's 25 Sep lesson sat at 'Scheduled').
 */
export function finalExtras(
  pool: readonly ExtraLessonRow[],
  studentId: string,
  endISO: string,
  alreadyInvoiced: ReadonlySet<string>,
): { bill: ExtraLessonRow[]; unmarked: ExtraLessonRow[] } {
  const mine = pool
    .filter((l) => l.studentId === studentId && l.date && l.date <= endISO)
    .filter((l) => !l.billed && !l.isRevisionMakeup && !/revision makeup/i.test(l.notes))
    .filter((l) => !alreadyInvoiced.has(l.date))
    .sort((a, b) => a.date.localeCompare(b.date));
  return {
    bill: mine.filter((l) => l.status === 'Completed'),
    unmarked: mine.filter((l) => l.status === 'Scheduled'),
  };
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function joinAnd(xs: string[]): string {
  return xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
}

/** "Additional lesson on 25 September 2026." — prints on the PDF, and its
 *  opening words are how the send cron recognises the final bill. */
export function finalExtrasNote(dates: readonly string[]): string {
  const parsed = [...dates].sort().map((d) => d.split('-').map(Number)).filter(([y, m, d]) => y && m && d);
  if (!parsed.length) return '';
  const groups: { y: number; m: number; days: number[] }[] = [];
  for (const [y, m, d] of parsed) {
    const g = groups[groups.length - 1];
    if (g && g.y === y && g.m === m) g.days.push(d);
    else groups.push({ y, m, days: [d] });
  }
  const text = groups.map((g, i) => {
    const year = i === groups.length - 1 || g.y !== groups[groups.length - 1].y ? ` ${g.y}` : '';
    return `${joinAnd(g.days.map(String))} ${MONTHS[g.m - 1]}${year}`;
  }).join('; ');
  return `Additional lesson${parsed.length === 1 ? '' : 's'} on ${text}.`;
}

export const FINAL_EXTRAS_NOTE_RE = /^Additional lessons? on /;
/** The same test, as an Airtable formula clause for the send cron's fetch. */
export const FINAL_EXTRAS_FORMULA = `AND({Invoice Type}='Adjustment',REGEX_MATCH({Auto Notes},'^Additional lessons? on '))`;

/** A final-extras invoice drafted by this module, and nothing unusual on it —
 *  the send cron may send it unattended, like a clean regular invoice. */
export function isFinalExtrasInvoice(f: Record<string, unknown>): boolean {
  if ((f['Invoice Type'] as string) !== 'Adjustment') return false;
  if (!FINAL_EXTRAS_NOTE_RE.test(((f['Auto Notes'] as string) || '').trim())) return false;
  if (!(Number(f['Final Amount']) > 0)) return false;
  if (Number(f['Adjustment Amount'] || 0) !== 0) return false;
  const extra = ((f['Line Items Extra'] as string) || '').trim();
  if (extra && extra !== '[]') return false;
  if (((f['Custom Email Message'] as string) || '').trim()) return false;
  return true;
}

/** The invoice's month: the month of the last lesson it bills ("September 2026"). */
export function finalExtrasMonth(dates: readonly string[]): string {
  const last = [...dates].sort().pop() || '';
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(last);
  return m ? `${MONTHS[Number(m[2]) - 1]} ${m[1]}` : '';
}
