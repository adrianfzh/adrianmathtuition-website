// Ad-hoc lesson billing — the two money rules behind the schedule's Ad-hoc
// booking and the student profile's "Ad-hoc lessons to bill" card.
// Pure; tested in adhoc-billing.test.ts.
//
// 22 Sep 2026 (Adrian, on Kevin Seng's lessons: "The rate is $320 per 4 lessons,
// hence its $80 per lesson"). Two things had gone wrong:
//   1. The booking form prefilled the charge with the Rates table's Amount, which
//      is the price of FOUR lessons ($320 Secondary, $360 JC), so every one of
//      Kevin's eleven ad-hoc lessons was booked at $320.
//   2. A moved ad-hoc lesson became a plain 'Rescheduled' row with no charge,
//      and the bill route only looked at Type='Ad-hoc' — his 26 → 27 Jul lesson
//      happened and could never be billed.

/** The Rates table's Amount is the price of this many lessons. */
export const LESSONS_PER_PACKAGE = 4;

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The per-lesson charge to prefill for an ad-hoc lesson.
 * The student's own rate wins (an Active enrollment first, then any), because
 * that is what their regular lessons are billed at — a grandfathered $70
 * student pays $70 for an extra one too. With no enrollment, the level's
 * current package price ÷ 4.
 */
export function adhocChargeDefault(opts: {
  enrollments?: { rate?: number | null; status?: string | null }[];
  packageAmount?: number | null;
}): number | null {
  const rated = (opts.enrollments || []).filter(e => Number(e.rate) > 0);
  const own = rated.find(e => e.status === 'Active') || rated[0];
  if (own) return round2(Number(own.rate));
  const pkg = Number(opts.packageAmount);
  return pkg > 0 ? round2(pkg / LESSONS_PER_PACKAGE) : null;
}

export interface LessonRow {
  id: string;
  fields: Record<string, any>;
}

export interface BillableAdhoc {
  id: string;
  date: string;
  /** 0 when no row in the chain carries a charge — the bill route refuses these. */
  charge: number;
  /** The ad-hoc row this lesson was moved from, when it is a moved one. */
  movedFrom?: string;
  /** That row's date — the invoice line says "(moved from 26 Jul)". */
  movedFromDate?: string;
}

/** Walk a moved lesson back to the row it replaced, at most a few hops. */
function originOf(row: LessonRow, byId: Map<string, LessonRow>): LessonRow[] {
  const chain: LessonRow[] = [row];
  let cur = row;
  for (let i = 0; i < 5; i++) {
    const up = cur.fields['Makeup For']?.[0];
    const prev = up ? byId.get(up) : undefined;
    if (!prev || chain.includes(prev)) break;
    chain.push(prev);
    if (prev.fields['Type'] !== 'Rescheduled') break;
    cur = prev;
  }
  return chain;
}

/**
 * A student's Completed ad-hoc lessons not yet on an invoice, oldest first.
 * `rows` = Lessons of Type 'Ad-hoc' and 'Rescheduled' (any student — the
 * student is matched here from the link array, never in the Airtable formula).
 * A moved ad-hoc lesson is billed ONCE, on the row that happened, at its own
 * charge or else the charge of the ad-hoc row it replaced.
 */
export function billableAdhocLessons(rows: LessonRow[], studentId: string): BillableAdhoc[] {
  const byId = new Map(rows.map(r => [r.id, r]));
  const out: BillableAdhoc[] = [];
  for (const r of rows) {
    const f = r.fields;
    if (f['Student']?.[0] !== studentId || f['Status'] !== 'Completed') continue;
    if (f['Source Invoice']?.length) continue;
    if (f['Type'] === 'Ad-hoc') {
      out.push({ id: r.id, date: f['Date'], charge: Number(f['Charge Override']) || 0 });
      continue;
    }
    if (f['Type'] !== 'Rescheduled') continue;
    const chain = originOf(r, byId);
    const origin = chain[chain.length - 1];
    if (chain.length < 2 || origin.fields['Type'] !== 'Ad-hoc') continue;
    if (chain.some(x => x.fields['Source Invoice']?.length)) continue;
    const charged = chain.find(x => Number(x.fields['Charge Override']) > 0);
    out.push({
      id: r.id, date: f['Date'],
      charge: charged ? Number(charged.fields['Charge Override']) : 0,
      movedFrom: origin.id,
      movedFromDate: origin.fields['Date'],
    });
  }
  return out.sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SHORT = MONTHS.map(m => m.slice(0, 3));

function joinAnd(xs: string[]): string {
  return xs.length <= 1 ? (xs[0] || '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
}

/** One invoice line's description: "Ad-hoc lesson — 27 Jul 2026 (moved from 26 Jul)". */
export function adhocLineDescription(l: Pick<BillableAdhoc, 'date' | 'movedFromDate'>): string {
  const [y, m, d] = String(l.date).split('-').map(Number);
  const base = y && m && d ? `Ad-hoc lesson — ${d} ${SHORT[m - 1]} ${y}` : `Ad-hoc lesson — ${l.date}`;
  const [, fm, fd] = String(l.movedFromDate || '').split('-').map(Number);
  return fm && fd && l.movedFromDate !== l.date ? `${base} (moved from ${fd} ${SHORT[fm - 1]})` : base;
}

/**
 * The lesson dates as a parent reads them, grouped by month:
 * "13, 27 and 31 July; 3, 10, 18, 19, 21 and 23 August 2026". The year is
 * said once at the end when every date shares it, else after each month.
 */
export function adhocDatesText(dates: string[]): string {
  const parsed = [...dates].sort().map(d => d.split('-').map(Number)).filter(([y, m, d]) => y && m && d);
  const groups: { y: number; m: number; days: number[] }[] = [];
  for (const [y, m, d] of parsed) {
    const g = groups[groups.length - 1];
    if (g && g.y === y && g.m === m) g.days.push(d);
    else groups.push({ y, m, days: [d] });
  }
  const oneYear = new Set(groups.map(g => g.y)).size === 1;
  return groups.map((g, i) => {
    const year = !oneYear || i === groups.length - 1 ? ` ${g.y}` : '';
    return `${joinAnd(g.days.map(String))} ${MONTHS[g.m - 1]}${year}`;
  }).join('; ');
}

/** The invoice's note (it prints on the PDF): "9 ad-hoc lessons at $80.00 each." */
export function adhocInvoiceNote(charges: number[]): string {
  const n = charges.length;
  const lessons = `${n} ad-hoc lesson${n === 1 ? '' : 's'}`;
  const same = n > 0 && charges.every(c => c === charges[0]);
  return same ? `${lessons} at $${charges[0].toFixed(2)} each.` : `${lessons}.`;
}
