import { NextRequest, NextResponse } from 'next/server';
import { airtableRequest } from '@/lib/airtable';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { resolveActiveExamType, ExamType } from '@/lib/exam-season';

export const runtime = 'nodejs';

const SETTING_NAME = 'exam_season_override';

const VALID_TYPES = ['WA1', 'WA2', 'WA3', 'EOY'];

async function fetchOverrideRecord(): Promise<{ id: string; forceOn: ExamType | null } | null> {
  const data = await airtableRequest(
    'Settings',
    `?filterByFormula=${encodeURIComponent(`{Setting Name}='${SETTING_NAME}'`)}&maxRecords=1`
  );
  const rec = data.records?.[0];
  if (!rec) return null;
  let parsed: any = { forceOn: null };
  try { parsed = JSON.parse(rec.fields['Value'] || '{}'); } catch {}
  const forceOn = VALID_TYPES.includes(parsed.forceOn) ? parsed.forceOn as ExamType : null;
  return { id: rec.id, forceOn };
}

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const settings = await fetchOverrideRecord();
    const override = settings?.forceOn ?? null;
    const active = resolveActiveExamType(override);
    return NextResponse.json({
      override,
      active,
      source: override ? 'manual' : (active ? 'auto' : 'none'),
    });
  } catch (err: any) {
    console.error('[exam-season GET]', err?.message);
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    const forceOn: ExamType | null = body.forceOn ?? null;
    if (forceOn !== null && !VALID_TYPES.includes(forceOn)) {
      return NextResponse.json({ error: 'Invalid forceOn value' }, { status: 400 });
    }
    const settings = await fetchOverrideRecord();
    const valueJson = JSON.stringify({ forceOn });
    if (settings) {
      await airtableRequest('Settings', `/${settings.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ fields: { Value: valueJson } }),
      });
    } else {
      await airtableRequest('Settings', '', {
        method: 'POST',
        body: JSON.stringify({ fields: { 'Setting Name': SETTING_NAME, Value: valueJson } }),
      });
    }
    const active = resolveActiveExamType(forceOn);
    return NextResponse.json({
      override: forceOn,
      active,
      source: forceOn ? 'manual' : (active ? 'auto' : 'none'),
    });
  } catch (err: any) {
    console.error('[exam-season POST]', err?.message);
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
  }
}
