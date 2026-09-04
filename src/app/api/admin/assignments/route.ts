// /api/admin/assignments — "From Adrian" assigned work (SPEC-ASSIGN.md).
//   GET  ?studentId=recXXX            → { assignments: AssignmentRow[] } (newest first, incl. revoked)
//   POST { studentId, kind, questionId | pdfUrl, title, topic, level, tier, note, dueOn, pdfSource }
//        → { assignment }  — a Dropbox-sourced pdfUrl is copied to Blob first
//   PATCH { id, action:'revoke' }     → { assignment }
// All writes are service-role; the student only ever SELECTs their own rows (RLS).
import { NextRequest, NextResponse } from 'next/server';
import { putStudentFile, assignmentKey } from '@/lib/student-files';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';
import { validateAssignment, canTransition, dueLabel, type AssignmentRow } from '@/lib/assignments';
import { sendTelegramTo } from '@/lib/telegram';
import { sendPushToStudent } from '@/lib/portal-push';
import { dropboxConfigured, getTemporaryLink } from '@/lib/dropbox';

export const runtime = 'nodejs';
export const maxDuration = 60;

const SITE = 'https://www.adrianmathtuition.com';

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const studentId = new URL(req.url).searchParams.get('studentId') || '';
  if (!/^rec[A-Za-z0-9]{14}$/.test(studentId)) return NextResponse.json({ error: 'studentId required' }, { status: 400 });
  const { data, error } = await getSupabaseAdmin()
    .from('portal_assignments').select('*')
    .eq('airtable_student_id', studentId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ assignments: (data || []) as AssignmentRow[] });
}

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));

  // A Dropbox-sourced worksheet (`pdfSource: 'dropbox:<path>'`, no https pdfUrl)
  // is copied to Blob BEFORE validation. Until 3 Sep 2026 the copy sat after
  // validateAssignment, whose worksheet rule demands an https pdfUrl — so the
  // desk's one-tap Approve & release (release-with-sheet sends exactly this
  // shape) died on production with "pdfUrl (https) is required for a worksheet"
  // for every paper, and four releases had to be done by hand. The temp link
  // dies in ~4h, so the bytes go to Blob under a stable public URL the student
  // can keep.
  const srcRaw = typeof body?.pdfSource === 'string' ? body.pdfSource.trim() : '';
  const hasHttps = typeof body?.pdfUrl === 'string' && /^https:\/\//.test(body.pdfUrl.trim());
  if (body?.kind === 'worksheet' && srcRaw.startsWith('dropbox:') && !hasHttps) {
    if (!dropboxConfigured()) return NextResponse.json({ error: 'Dropbox not configured' }, { status: 503 });
    const path = srcRaw.slice('dropbox:'.length);
    try {
      const tmp = await getTemporaryLink(path);
      const res = await fetch(tmp);
      if (!res.ok) throw new Error(`Dropbox fetch ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > 50 * 1024 * 1024) throw new Error('PDF over 50MB');
      const sid = typeof body?.studentId === 'string' ? body.studentId.trim() : '';
      if (!/^rec[A-Za-z0-9]{14}$/.test(sid)) throw new Error('studentId is required before the PDF can be filed');
      // Under the student's own prefix so /api/files lets exactly them open it.
      const blob = await putStudentFile({ key: assignmentKey(sid), body: buf, contentType: 'application/pdf' });
      body.pdfUrl = blob.url;
    } catch (e) {
      return NextResponse.json({ error: `Could not copy the Dropbox PDF: ${(e as Error).message}` }, { status: 502 });
    }
  }

  const v = validateAssignment(body);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  const row = v.row;
  const supabase = getSupabaseAdmin();

  if (row.kind === 'question') {
    // The bank question must exist and be live; also snapshot its topic/level
    // for the card label when the caller didn't pass them.
    const { data: q } = await supabase
      .from('questions').select('id, deleted_at').eq('id', row.question_id!).maybeSingle();
    if (!q || q.deleted_at) return NextResponse.json({ error: 'Question not found' }, { status: 404 });
  }
  // (A worksheet's Dropbox source was already copied to Blob above, before validation.)

  const { data, error } = await supabase
    .from('portal_assignments').insert(row).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const a = data as AssignmentRow;

  // D4: nudge the student on Telegram only if they linked it; otherwise silent.
  let notified = false;
  try {
    const { data: acct } = await supabase
      .from('portal_accounts').select('telegram_chat_id')
      .eq('airtable_student_id', a.airtable_student_id).not('telegram_chat_id', 'is', null).limit(1).maybeSingle();
    if (acct?.telegram_chat_id) {
      const due = dueLabel(a.due_on);
      const what = a.kind === 'question' ? 'a question' : 'a worksheet';
      const text = `📬 Adrian sent you ${what}: <b>${escapeHtml(a.title)}</b>${due ? ` (${due})` : ''}`
        + (a.note ? `\n\n“${escapeHtml(a.note)}”` : '')
        + `\n\nOpen it: ${SITE}/app`;
      notified = await sendTelegramTo(acct.telegram_chat_id, text);
    }
  } catch { /* never fail the send over a notification */ }

  // Web push too (2026-08-28) — every device this student turned notifications
  // on for (/app/settings), keyed on the same identity string the subscription
  // rows carry (rec… or acct:…). Fire-and-forget: sendPushToStudent never
  // throws, and the extra .catch belts the promise — a push failure must never
  // fail (or delay) the assignment create.
  sendPushToStudent(a.airtable_student_id, {
    title: '📬 New work from Adrian',
    body: a.title,
    url: '/app/assignments',
  }).catch(() => {});

  return NextResponse.json({ assignment: a, notified });
}

export async function PATCH(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const { id, action } = body as { id?: string; action?: string };
  if (!id || action !== 'revoke') return NextResponse.json({ error: 'id and action:revoke required' }, { status: 400 });
  const supabase = getSupabaseAdmin();
  const { data: cur } = await supabase.from('portal_assignments').select('status').eq('id', id).maybeSingle();
  if (!cur) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!canTransition(cur.status, 'revoked')) {
    return NextResponse.json({ error: `Cannot withdraw a ${cur.status} assignment` }, { status: 409 });
  }
  const { data, error } = await supabase
    .from('portal_assignments')
    .update({ status: 'revoked', revoked_at: new Date().toISOString() })
    .eq('id', id).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ assignment: data });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
