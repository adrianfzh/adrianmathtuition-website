// GET  → returns { enabled: boolean }
// POST → sets the june_revision_mode flag, returns { enabled: boolean }
// When ON, generate-invoices skips a regular June invoice for students whose
// "June Revision <year>" field = 'Signed Up' (they're billed via their revision invoice).
import { NextRequest, NextResponse } from 'next/server';
import { airtableRequest } from '@/lib/airtable';
import { verifyAdminAuth } from '@/lib/schedule-helpers';

export const runtime = 'nodejs';

async function getRecord() {
  const data = await airtableRequest('Settings',
    `?filterByFormula=${encodeURIComponent(`{Setting Name}='june_revision_mode'`)}&maxRecords=1`
  ).catch(() => ({ records: [] }));
  return data.records?.[0] ?? null;
}

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const record = await getRecord();
  return NextResponse.json({ enabled: record?.fields?.['Value'] === 'true' });
}

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { enabled: boolean };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const record = await getRecord();
  const newValue = body.enabled ? 'true' : '';

  if (record) {
    await airtableRequest('Settings', `/${record.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ fields: { Value: newValue } }),
    });
  } else {
    await airtableRequest('Settings', '', {
      method: 'POST',
      body: JSON.stringify({ fields: { 'Setting Name': 'june_revision_mode', Value: newValue } }),
    });
  }

  return NextResponse.json({ enabled: body.enabled });
}
