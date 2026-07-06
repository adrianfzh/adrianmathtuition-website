import { NextRequest, NextResponse } from 'next/server';
import { airtableRequestAll } from '@/lib/airtable';
import { verifyAdminAuth } from '@/lib/schedule-helpers';

export const runtime = 'nodejs';

// GET /api/admin/progress/students
export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const data = await airtableRequestAll(
    'Students',
    `?filterByFormula=${encodeURIComponent(`{Status}='Active'`)}&fields[]=Student Name&fields[]=Level&fields[]=Subjects&fields[]=Subject Level&fields[]=Parent Email&fields[]=Parent Name&sort[0][field]=Student Name&sort[0][direction]=asc`
  );

  const students = data.records.map((r: any) => ({
    id: r.id,
    name: r.fields['Student Name'] ?? '',
    level: r.fields['Level'] ?? '',
    subjects: r.fields['Subjects'] ?? [],
    subjectLevel: r.fields['Subject Level'] ?? '',
    parentEmail: r.fields['Parent Email'] ?? '',
    parentName: r.fields['Parent Name'] ?? '',
  }));

  return NextResponse.json({ students });
}
