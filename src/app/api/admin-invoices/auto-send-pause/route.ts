// GET  → returns { paused: boolean }
// POST → toggles pause flag, returns { paused: boolean }
import { NextRequest, NextResponse } from 'next/server';
import { airtableRequest, airtableRequestAll } from '@/lib/airtable';
import { verifyAdminAuth } from '@/lib/schedule-helpers';

export const runtime = 'nodejs';

async function getPauseRecord() {
  const data = await airtableRequest('Settings',
    `?filterByFormula=${encodeURIComponent(`{Setting Name}='pause_auto_send'`)}&maxRecords=1`
  ).catch(() => ({ records: [] }));
  return data.records?.[0] ?? null;
}

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const record = await getPauseRecord();
  return NextResponse.json({ paused: record?.fields?.['Value'] === 'true' });
}

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { paused: boolean };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const record = await getPauseRecord();
  const newValue = body.paused ? 'true' : '';

  if (record) {
    await airtableRequest('Settings', `/${record.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ fields: { Value: newValue } }),
    });
  } else {
    // Create the Settings row if it doesn't exist yet
    await airtableRequest('Settings', '', {
      method: 'POST',
      body: JSON.stringify({ fields: { 'Setting Name': 'pause_auto_send', Value: newValue } }),
    });
  }

  return NextResponse.json({ paused: body.paused });
}
