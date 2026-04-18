import { NextRequest, NextResponse } from 'next/server';
import { airtableRequestAll } from '@/lib/airtable';

export const runtime = 'nodejs';

function checkAuth(req: NextRequest): boolean {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) return true;
  return req.headers.get('authorization') === `Bearer ${pw}`;
}

// GET /api/admin/progress/students
export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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
