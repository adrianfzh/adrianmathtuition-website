// POST /api/parent/stop — "Stop these reports" (SPEC-PARENT-REPORT.md). From a
// report link (token) or from the parent's own page (link id + their cookie).
// Ends the link (kept, not deleted) and appends a withdrawal to consent_records.
// POST only: a link previewer's GET must never stop anything.
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { PARENT_COOKIE, PARENT_NOTICE_HASH, PARENT_NOTICE_VERSION, verifyParentCookie, verifyReportToken } from '@/lib/parent-report';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const secret = process.env.SIGNUP_SECRET || '';
  const sb = createServiceClient();
  let linkId: string | null = null;

  const reportId = verifyReportToken(form?.get('token'), secret);
  if (reportId) {
    const { data } = await sb.from('parent_reports').select('link_id').eq('id', reportId).maybeSingle();
    linkId = (data?.link_id as string) ?? null;
  } else {
    const parentId = verifyParentCookie(req.cookies.get(PARENT_COOKIE)?.value, secret);
    const want = String(form?.get('link') ?? '');
    if (parentId && want) {
      const { data } = await sb.from('parent_links').select('id').eq('id', want).eq('parent_id', parentId).maybeSingle();
      linkId = (data?.id as string) ?? null;
    }
  }
  if (linkId) {
    const { data: ended } = await sb.from('parent_links')
      .update({ status: 'ended', ended_at: new Date().toISOString(), ended_by: 'parent' })
      .eq('id', linkId).eq('status', 'active').select('student_identity, parent_id');
    const row = ended?.[0];
    if (row) {
      await sb.from('consent_records').insert({
        subject_identity: row.student_identity, given_by: 'parent', parent_contact_id: row.parent_id,
        purpose: 'parent_weekly_report', action: 'withdrawn',
        notice_version: PARENT_NOTICE_VERSION, notice_hash: PARENT_NOTICE_HASH, channel: 'web',
      });
    }
  }
  return NextResponse.redirect(new URL('/parent/stopped', req.nextUrl.origin), 303);
}
