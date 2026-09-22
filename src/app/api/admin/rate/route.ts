import { NextRequest, NextResponse } from 'next/server';
import { airtableRequest, airtableRequestAll } from '@/lib/airtable';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { adhocChargeDefault } from '@/lib/adhoc-billing';

export const runtime = 'nodejs';

// GET /api/admin/rate?level=Sec 4[&studentId=recXXX]  → { rate: number | null, packageAmount, source }
// The PER-LESSON charge to prefill for an Ad-hoc lesson: the student's own
// enrollment rate when they have one, else the level's current package price ÷ 4
// (the Rates Amount is the price of four lessons — lib/adhoc-billing.ts; it was
// prefilled whole until 22 Sep 2026, which booked Kevin Seng at $320 a lesson).
// The charge stays editable in the form.
export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const sp = new URL(req.url).searchParams;
  const level = sp.get('level') || '';
  const studentId = sp.get('studentId') || '';
  const rateLevel = level.startsWith('JC') ? 'JC' : 'Secondary';
  try {
    const [rates, enrollments] = await Promise.all([
      (async () => {
        let data = await airtableRequest('Rates', `?filterByFormula=${encodeURIComponent(`AND({Level}='${rateLevel}',{Is Current}=TRUE())`)}&maxRecords=1`);
        if (!data.records?.length) {
          data = await airtableRequest('Rates', `?filterByFormula=${encodeURIComponent(`{Level}='${rateLevel}'`)}&sort[0][field]=Created+Time&sort[0][direction]=desc&maxRecords=1`);
        }
        return data;
      })(),
      // Linked-record filter caveat: match the student in JS, never in the formula.
      studentId && /^rec[A-Za-z0-9]{14}$/.test(studentId)
        ? airtableRequestAll('Enrollments', `?filterByFormula=${encodeURIComponent('{Rate Per Lesson}>0')}&fields[]=Student&fields[]=Rate Per Lesson&fields[]=Status`)
            .then(d => (d.records || []).filter((r: any) => r.fields['Student']?.[0] === studentId))
            .catch(() => [])
        : Promise.resolve([]),
    ]);
    const f = rates.records?.[0]?.fields || {};
    const pkg = f['Amount'] ?? f['Rate'] ?? f['Monthly Rate'] ?? null;
    const own = (enrollments as any[]).map(r => ({ rate: Number(r.fields['Rate Per Lesson']), status: r.fields['Status'] }));
    const rate = adhocChargeDefault({ enrollments: own, packageAmount: pkg != null ? Number(pkg) : null });
    return NextResponse.json({
      rate,
      packageAmount: pkg != null ? Number(pkg) : null,
      source: own.some(e => e.rate > 0) ? 'enrollment' : 'package',
    });
  } catch {
    return NextResponse.json({ rate: null });
  }
}
