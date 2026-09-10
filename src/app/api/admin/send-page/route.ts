// /api/admin/send-page — push ONE page to MANY students at once (11 Sep 2026,
// SPEC-NOTEBOOK-V2 §12, Adrian: "build push a page to every student").
//
//   GET  → the roster the picker needs: every active tuition account
//          { id, name, level, sid } + the distinct levels.
//   POST { title, note?, topic?, fileUrl, audience: { all?: true, levels?: string[], studentIds?: string[] } }
//        → one portal_assignments row per student (kind 'page', source 'adrian',
//          status 'assigned' — never "to do", see lib/assignments isPage), a
//          Telegram line where linked and a web push everywhere, then
//          { sent, students: [{sid, name}] }.
//
// The file was uploaded first through ./upload-token into the private
// student-files bucket under pages/<uuid>.<ext> — ONE copy for everyone; the
// /api/files gate lets any logged-in student read a pages/ key (they are
// Adrian's material, not a student's data). Both handlers sit behind
// verifyAdminAuth (the admin cookie or the Bearer password); the health check
// probes the GET's 401.
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';
import { validateAssignment, type AssignmentRow } from '@/lib/assignments';
import { keyFromUrl } from '@/lib/student-files-url';
import { sendTelegramTo } from '@/lib/telegram';
import { sendPushToStudent } from '@/lib/portal-push';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SITE = 'https://www.adrianmathtuition.com';
const MAX_AUDIENCE = 300;

type Account = { id: string; display_name: string | null; level: string | null; airtable_student_id: string; deactivated_at: string | null };

async function roster(): Promise<{ sid: string; name: string; level: string | null; id: string }[]> {
  const { data, error } = await getSupabaseAdmin()
    .from('portal_accounts')
    .select('id, display_name, level, airtable_student_id, deactivated_at')
    .is('deactivated_at', null)
    .like('airtable_student_id', 'rec%')
    .order('display_name');
  if (error) throw new Error(error.message);
  return ((data ?? []) as Account[]).map(a => ({
    id: a.id, sid: a.airtable_student_id, name: a.display_name || a.airtable_student_id, level: a.level ? a.level.trim() : null,
  }));
}

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const students = await roster();
    const levels = [...new Set(students.map(s => s.level).filter((l): l is string => !!l))].sort();
    return NextResponse.json({ students, levels });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({})) as {
    title?: unknown; note?: unknown; topic?: unknown; fileUrl?: unknown;
    audience?: { all?: unknown; levels?: unknown; studentIds?: unknown };
  };
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const fileUrl = typeof body.fileUrl === 'string' ? body.fileUrl.trim() : '';
  if (!title) return NextResponse.json({ error: 'title is required' }, { status: 400 });
  // Only a file in OUR store under pages/ — never a foreign URL pushed to every phone.
  const key = keyFromUrl(fileUrl);
  if (!key || !key.startsWith('pages/')) return NextResponse.json({ error: 'fileUrl must be a pages/ file uploaded through upload-token' }, { status: 400 });

  let students: Awaited<ReturnType<typeof roster>>;
  try { students = await roster(); } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
  const aud = body.audience ?? {};
  const levels = Array.isArray(aud.levels) ? aud.levels.map(l => String(l).trim()).filter(Boolean) : [];
  const ids = Array.isArray(aud.studentIds) ? aud.studentIds.map(x => String(x)) : [];
  const chosen = aud.all === true
    ? students
    : students.filter(s => (s.level && levels.includes(s.level)) || ids.includes(s.sid) || ids.includes(s.id));
  if (chosen.length === 0) return NextResponse.json({ error: 'no students match that audience' }, { status: 400 });
  if (chosen.length > MAX_AUDIENCE) return NextResponse.json({ error: `audience too large (${chosen.length})` }, { status: 400 });

  const rows = [];
  for (const s of chosen) {
    const v = validateAssignment({
      studentId: s.sid, kind: 'page', title,
      note: typeof body.note === 'string' ? body.note : null,
      topic: typeof body.topic === 'string' ? body.topic : null,
      pdfUrl: fileUrl, pdfSource: 'send-page',
    });
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
    rows.push(v.row);
  }
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from('portal_assignments').insert(rows).select('id, airtable_student_id');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const inserted = (data ?? []) as Pick<AssignmentRow, 'id' | 'airtable_student_id'>[];

  // Tell them — Telegram where it is linked, a web push on every device that
  // turned notifications on. Both fire-and-forget: a notification failure never
  // fails the send. The deep link opens the page itself.
  const { data: linked } = await supabase
    .from('portal_accounts').select('airtable_student_id, telegram_chat_id')
    .in('airtable_student_id', inserted.map(r => r.airtable_student_id)).not('telegram_chat_id', 'is', null);
  const chatBySid = new Map<string, number>();
  for (const a of linked ?? []) if (a.telegram_chat_id) chatBySid.set(String(a.airtable_student_id), Number(a.telegram_chat_id));
  let telegram = 0;
  await Promise.all(inserted.map(async r => {
    const path = `/app/assignments/${r.id}`;
    const chat = chatBySid.get(r.airtable_student_id);
    if (chat) {
      try { if (await sendTelegramTo(chat, `📖 Adrian sent you a page: ${title}\n${SITE}${path}`)) telegram++; } catch { /* silent */ }
    }
    sendPushToStudent(r.airtable_student_id, { title: `📖 A page from Adrian`, body: title, url: path }).catch(() => {});
  }));

  return NextResponse.json({
    sent: inserted.length, telegram,
    students: chosen.map(s => ({ sid: s.sid, name: s.name })),
  });
}
