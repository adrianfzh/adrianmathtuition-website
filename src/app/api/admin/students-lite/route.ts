import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { airtableRequestAll } from '@/lib/airtable';

export const runtime = 'nodejs';

// THE student list for every admin "pick a student" UI (components/StudentPicker.tsx).
// One endpoint instead of each page borrowing whatever route happened to return
// students — mark-paper and the batch page both leaned on /api/mark-batch/init's GET.
// Name + level + status ONLY: contact info stays lazy-loaded per the privacy rule
// (student-contact route), and must never be added here.

export type LiteStudent = { id: string; name: string; level: string; status: string };

// Per-instance 60s cache — the list changes when a student enrols, not per click,
// and three pickers on one page otherwise cost three Airtable scans.
let cache: { at: number; students: LiteStudent[] } | null = null;

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    if (cache && Date.now() - cache.at < 60_000) {
      return NextResponse.json({ students: cache.students, cached: true });
    }
    const data = await airtableRequestAll(
      'Students',
      `?fields[]=Student+Name&fields[]=Level&fields[]=Status&sort[0][field]=Student+Name&sort[0][direction]=asc`
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const students: LiteStudent[] = data.records.map((r: any) => ({
      id: r.id,
      name: (r.fields['Student Name'] as string) || '',
      level: (r.fields['Level'] as string) || '',
      status: (r.fields['Status'] as string) || '',
    }));
    cache = { at: Date.now(), students };
    return NextResponse.json({ students });
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
