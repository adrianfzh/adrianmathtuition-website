import { NextRequest, NextResponse } from 'next/server';
import { airtableRequestAll } from '@/lib/airtable';

export const runtime = 'nodejs';

function checkAuth(req: NextRequest): boolean {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) return true;
  return req.headers.get('authorization') === `Bearer ${pw}`;
}

// SGT = UTC+8
function sgtDateStr(): string {
  const sgt = new Date(Date.now() + 8 * 60 * 60 * 1000);
  return `${sgt.getUTCFullYear()}-${String(sgt.getUTCMonth() + 1).padStart(2, '0')}-${String(sgt.getUTCDate()).padStart(2, '0')}`;
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function getMondayStr(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function buildWeekLabel(mondayStr: string): string {
  const monday = new Date(mondayStr + 'T00:00:00Z');
  const sunday = new Date(mondayStr + 'T00:00:00Z');
  sunday.setUTCDate(sunday.getUTCDate() + 6);
  const monDay = monday.getUTCDate();
  const sunDay = sunday.getUTCDate();
  const month = sunday.toLocaleDateString('en-SG', { month: 'short', timeZone: 'UTC' });
  return `${monDay}–${sunDay} ${month}`;
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const today = sgtDateStr();
  const monday = getMondayStr(today);
  const nextMonday = addDays(monday, 7); // exclusive upper bound for week range
  const sunday = addDays(monday, 6);

  const todayFilter = encodeURIComponent(
    `AND(IS_SAME({Date},'${today}','day'),{Status}='Scheduled')`
  );
  // Exclusive upper bound: {Date}<nextMonday avoids Airtable midnight coercion dropping Sunday
  const weekFilter = encodeURIComponent(
    `AND({Date}>='${monday}',{Date}<'${nextMonday}',{Status}='Scheduled')`
  );
  const invoiceFilter = encodeURIComponent(
    `AND({Is Paid}=FALSE(),{Status}='Sent')`
  );
  const absentFilter = encodeURIComponent(`{Status}='Absent'`);

  const [todayLessons, weekLessons, invoices, absentLessons] = await Promise.all([
    airtableRequestAll('Lessons', `?filterByFormula=${todayFilter}&fields[]=Topics+Covered`),
    airtableRequestAll('Lessons', `?filterByFormula=${weekFilter}&fields[]=Date`),
    airtableRequestAll('Invoices', `?filterByFormula=${invoiceFilter}&fields[]=Final+Amount`),
    airtableRequestAll('Lessons', `?filterByFormula=${absentFilter}&fields[]=Rescheduled+Lesson+ID`),
  ]);

  const todayTotal = todayLessons.records.length;
  const todayLogged = todayLessons.records.filter(
    r => (r.fields['Topics Covered'] ?? '').trim().length > 0
  ).length;

  const invoiceCount = invoices.records.length;
  const totalOwed = invoices.records.reduce(
    (sum, r) => sum + (r.fields['Final Amount'] ?? 0), 0
  );

  // Makeups owed: absent lessons with no linked rescheduled/makeup lesson
  const makeupCount = absentLessons.records.filter(r => {
    const linked = r.fields['Rescheduled Lesson ID'];
    return !linked || linked.length === 0;
  }).length;

  return NextResponse.json(
    {
      today: { total: todayTotal, logged: todayLogged },
      invoices: { count: invoiceCount, totalOwed },
      makeups: { count: makeupCount },
      thisWeek: { count: weekLessons.records.length, weekLabel: buildWeekLabel(monday) },
    },
    {
      headers: {
        'Cache-Control': 's-maxage=60, stale-while-revalidate=120',
      },
    }
  );
}
