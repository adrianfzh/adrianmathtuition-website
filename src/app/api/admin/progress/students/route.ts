import { NextRequest, NextResponse } from 'next/server';
import { airtableRequestAll } from '@/lib/airtable';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';
import { unseenByStudent, type HandinRow } from '@/lib/unseen-handins';

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

  // Hand-ins from the app in the last 45 days that Adrian has not opened on
  // the desk (lib/unseen-handins.ts). Fail-soft: a Supabase blip costs the
  // badges, never the directory.
  let unseen: Record<string, ReturnType<typeof unseenByStudent> extends Map<string, infer V> ? V : never> = {};
  try {
    const since = new Date(Date.now() - 45 * 86400_000).toISOString();
    const { data } = await getSupabaseAdmin().from('paper_marking_runs')
      .select('id, student_id, paper_name, created_at, admin_viewed_at, portal_submission:result_json->portal_submission')
      .is('admin_viewed_at', null).not('student_id', 'is', null).gte('created_at', since).limit(1000);
    unseen = Object.fromEntries(unseenByStudent((data ?? []) as HandinRow[]));
  } catch (e) { console.warn('[progress/students] unseen skipped:', (e as Error).message); }

  return NextResponse.json({ students: students.map((s: { id: string }) => ({ ...s, unseen: unseen[s.id] ?? null })) });
}
