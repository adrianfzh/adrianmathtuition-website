import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { airtableRequestAll } from '@/lib/airtable';

export const runtime = 'nodejs';

const SLUG_TO_LABEL: Record<string, string> = {
  's1': 'S1',
  's2': 'S2',
  's3-em': 'S3 EM',
  's3-am': 'S3 AM',
  's4-em': 'S4 EM',
  's4-am': 'S4 AM',
  'jc1': 'JC1',
  'jc2': 'JC2',
};

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const level = searchParams.get('level');

  if (!level || !SLUG_TO_LABEL[level]) {
    return NextResponse.json({ error: 'Invalid level' }, { status: 400 });
  }

  const levelLabel = SLUG_TO_LABEL[level];
  const formula = encodeURIComponent(`{Level}='${levelLabel}'`);
  const query = `?filterByFormula=${formula}&sort[0][field]=Title&sort[0][direction]=asc`;

  const data = await airtableRequestAll('PrintNotes', query);

  const notes = data.records.map((r: { id: string; fields: Record<string, string> }) => ({
    id: r.id,
    title: r.fields['Title'] ?? '',
    pdfUrl: r.fields['PDF URL'] ?? '',
    uploadedAt: r.fields['Uploaded At'] ?? '',
  }));

  return NextResponse.json({ notes });
}
