import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { airtableRequestAll } from '@/lib/airtable';

export const runtime = 'nodejs';

// Maps URL slug → Airtable Level value
const SLUG_TO_LEVELS: Record<string, string[]> = {
  's1': ['S1'], 's2': ['S2'],
  'em': ['EM'], 'am': ['AM'], 'jc': ['JC'],
};

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const level = searchParams.get('level');

  if (!level || !SLUG_TO_LEVELS[level]) {
    return NextResponse.json({ error: 'Invalid level' }, { status: 400 });
  }

  const labels = SLUG_TO_LEVELS[level];
  const filterExpr = labels.length === 1
    ? `{Level}='${labels[0]}'`
    : `OR(${labels.map(l => `{Level}='${l}'`).join(',')})`;
  const query = `?filterByFormula=${encodeURIComponent(filterExpr)}&sort[0][field]=Title&sort[0][direction]=asc`;

  const data = await airtableRequestAll('PrintNotes', query);

  const notes = data.records.map((r: { id: string; fields: Record<string, string> }) => ({
    id: r.id,
    title: r.fields['Title'] ?? '',
    pdfUrl: r.fields['PDF URL'] ?? '',
    uploadedAt: r.fields['Uploaded At'] ?? '',
  }));

  return NextResponse.json({ notes });
}
