import { NextRequest, NextResponse } from 'next/server';
import { airtableRequest } from '@/lib/airtable';
import { verifyAdminAuth } from '@/lib/schedule-helpers';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const studentId = searchParams.get('id');
  if (!studentId || !studentId.startsWith('rec')) {
    return NextResponse.json({ error: 'Invalid student ID' }, { status: 400 });
  }

  try {
    // NB: Airtable's single-record GET does NOT accept `fields[]` (that's list-only);
    // passing it returns "parameter validation failed". Fetch the whole record instead.
    const data = await airtableRequest('Students', `/${studentId}`);
    return NextResponse.json({
      name: data.fields?.['Student Name'] || '',
      parentName: data.fields?.['Parent Name'] || '',
      parentEmail: data.fields?.['Parent Email'] || '',
      parentContact: data.fields?.['Parent Contact'] || '',
      studentContact: data.fields?.['Student Contact'] || '',
    });
  } catch (err: any) {
    console.error('[student-contact] error:', err?.message);
    return NextResponse.json({ error: 'Failed to fetch student' }, { status: 500 });
  }
}
