import { NextRequest, NextResponse } from 'next/server';
import { airtableRequest } from '@/lib/airtable';
import { verifyAdminAuth } from '@/lib/schedule-helpers';

export const runtime = 'nodejs';

// GET /api/admin/rate?level=Sec 4  → { rate: number | null }
// Current per-lesson rate for a level (JC vs Secondary), used to prefill the
// Ad-hoc lesson charge. Mirrors signup's Rates lookup; the charge stays editable.
export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const level = new URL(req.url).searchParams.get('level') || '';
  const rateLevel = level.startsWith('JC') ? 'JC' : 'Secondary';
  try {
    let data = await airtableRequest('Rates', `?filterByFormula=${encodeURIComponent(`AND({Level}='${rateLevel}',{Is Current}=TRUE())`)}&maxRecords=1`);
    if (!data.records?.length) {
      data = await airtableRequest('Rates', `?filterByFormula=${encodeURIComponent(`{Level}='${rateLevel}'`)}&sort[0][field]=Created+Time&sort[0][direction]=desc&maxRecords=1`);
    }
    const f = data.records?.[0]?.fields || {};
    const rate = f['Amount'] ?? f['Rate'] ?? f['Monthly Rate'] ?? null;
    return NextResponse.json({ rate: rate != null ? Number(rate) : null });
  } catch {
    return NextResponse.json({ rate: null });
  }
}
