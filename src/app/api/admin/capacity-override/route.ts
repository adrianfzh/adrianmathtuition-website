// GET/POST the Sec-capacity override toggle (Settings row, same pattern as
// exam-season). POST {secCap: 5} turns it on, {secCap: null} turns it off.
// Existing enrollments/lessons are never touched — enforcement lives in the
// booking routes, which consult this setting on each NEW-booking check.
import { NextRequest, NextResponse } from 'next/server';
import { airtableRequest } from '@/lib/airtable';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { SEC_CAP_SETTING, parseSecCapOverride } from '@/lib/capacity-override';

export const runtime = 'nodejs';

async function fetchRecord(): Promise<{ id: string; secCap: number | null } | null> {
  const data = await airtableRequest(
    'Settings',
    `?filterByFormula=${encodeURIComponent(`{Setting Name}='${SEC_CAP_SETTING}'`)}&maxRecords=1`
  );
  const rec = data.records?.[0];
  if (!rec) return null;
  return { id: rec.id, secCap: parseSecCapOverride(rec.fields['Value'] ?? null) };
}

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const rec = await fetchRecord();
    return NextResponse.json({ secCap: rec?.secCap ?? null });
  } catch (err: any) {
    console.error('[capacity-override GET]', err?.message);
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    const secCap: number | null = body.secCap ?? null;
    if (secCap !== null && !(Number.isInteger(secCap) && secCap >= 1 && secCap <= 8)) {
      return NextResponse.json({ error: 'secCap must be an integer 1–8 or null' }, { status: 400 });
    }
    const rec = await fetchRecord();
    const valueJson = JSON.stringify({ secCap });
    if (rec) {
      await airtableRequest('Settings', `/${rec.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ fields: { Value: valueJson } }),
      });
    } else {
      await airtableRequest('Settings', '', {
        method: 'POST',
        body: JSON.stringify({ fields: {
          'Setting Name': SEC_CAP_SETTING,
          Value: valueJson,
          Notes: 'Sec class-size toggle: {"secCap":5} caps NEW bookings on Secondary slots; {"secCap":null} = off (stored capacities apply). Managed from /admin/schedule.',
        } }),
      });
    }
    return NextResponse.json({ secCap });
  } catch (err: any) {
    console.error('[capacity-override POST]', err?.message);
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
  }
}
