import { NextRequest, NextResponse } from 'next/server';
import { airtableRequestAll } from '@/lib/airtable';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';
import { unseenByStudent, type HandinRow } from '@/lib/unseen-handins';

export const runtime = 'nodejs';

// GET /api/admin/progress/students
export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Roster and hand-ins go out together (18 Sep 2026: they ran one after the
  // other; the directory is opened many times a day and every 300 ms shows).
  const since = new Date(Date.now() - 45 * 86400_000).toISOString();
  const [data, unseenRes] = await Promise.all([
    airtableRequestAll(
      'Students',
      `?filterByFormula=${encodeURIComponent(`{Status}='Active'`)}&fields[]=Student Name&fields[]=Level&fields[]=Subjects&fields[]=Subject Level&fields[]=Parent Email&fields[]=Parent Name&sort[0][field]=Student Name&sort[0][direction]=asc`
    ),
    getSupabaseAdmin().from('paper_marking_runs')
      .select('id, student_id, paper_name, created_at, admin_viewed_at, checked_at, released_at, superseded_by, released_via, portal_submission:result_json->portal_submission')
      .is('admin_viewed_at', null).is('checked_at', null).not('student_id', 'is', null).not('released_at', 'is', null).gte('created_at', since).limit(1000)
      .then(r => r, e => ({ data: null, error: { message: String((e as Error).message || e) } })),
  ]);

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
  let unseenNote: string | null = null;   // ?debug=1 shows why the badges are empty
  try {
    const { data, error } = unseenRes as { data: HandinRow[] | null; error: { message: string } | null };
    if (error) throw new Error(error.message);
    unseen = Object.fromEntries(unseenByStudent((data ?? []) as HandinRow[]));
    unseenNote = `${(data ?? []).length} rows, ${Object.keys(unseen).length} students`;
  } catch (e) { unseenNote = `skipped: ${(e as Error).message}`; console.warn('[progress/students] unseen skipped:', (e as Error).message); }

  const debug = req.nextUrl.searchParams.get('debug') === '1' ? { unseenNote } : {};
  return NextResponse.json({ students: students.map((s: { id: string }) => ({ ...s, unseen: unseen[s.id] ?? null })), ...debug });
}
