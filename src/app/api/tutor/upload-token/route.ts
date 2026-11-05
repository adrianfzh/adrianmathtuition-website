// GET /api/tutor/upload-token?student=<id>&filename=… — a signed upload into the private
// student-files bucket, under handins/tutor:<student id>/ (lib/student-files handinKey).
// The prefix is the ownership proof /api/tutor/submit checks, as for portal hand-ins.
import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { currentTutor } from '@/lib/tutor-auth';
import { createUploadUrl, handinKey, safeExt } from '@/lib/student-files';
import { tutorRunStudentId } from '@/lib/tutor-portal';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const tutor = await currentTutor();
  if (!tutor) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const url = new URL(req.url);
  const studentId = url.searchParams.get('student') || '';
  if (!/^[0-9a-f-]{36}$/i.test(studentId)) return NextResponse.json({ error: 'student is required' }, { status: 400 });
  const { data: s } = await getSupabaseAdmin().from('tutor_students').select('id').eq('id', studentId).eq('tutor_id', tutor.id).maybeSingle();
  if (!s) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const ext = safeExt(url.searchParams.get('filename') || '', ['jpg', 'jpeg', 'png', 'webp'], 'jpg');
  try {
    const u = await createUploadUrl(handinKey(tutorRunStudentId(studentId), ext));
    return NextResponse.json({ uploadUrl: u.uploadUrl, key: u.key, url: u.url });
  } catch (e) {
    console.error('[tutor upload-token]', (e as Error).message);
    return NextResponse.json({ error: 'could not start the upload' }, { status: 503 });
  }
}
