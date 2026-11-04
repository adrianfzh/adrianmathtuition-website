// POST /api/parent/join — the parent's "Confirm" on /parent/join/<code>
// (SPEC-PARENT-REPORT.md). Plain form post: email + the agree box + the code.
// The link goes pending → active only if the code is still pending and unexpired
// (one conditional update, so a code works once). Consent is appended to
// consent_records. The parent's phone gets a 180-day cookie for /parent.
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import {
  PARENT_COOKIE, PARENT_COOKIE_DAYS, PARENT_NOTICE_HASH, PARENT_NOTICE_VERSION,
  isEmail, normalizeInviteCode, signParentCookie,
} from '@/lib/parent-report';

export const runtime = 'nodejs';

const back = (req: NextRequest, path: string) => NextResponse.redirect(new URL(path, req.nextUrl.origin), 303);

export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const code = normalizeInviteCode(form?.get('code'));
  if (!code) return back(req, '/parent/join/expired');
  const email = String(form?.get('email') ?? '').trim().toLowerCase();
  if (!isEmail(email)) return back(req, `/parent/join/${code}?e=email`);
  if (form?.get('agree') !== 'yes') return back(req, `/parent/join/${code}?e=agree`);
  const secret = process.env.SIGNUP_SECRET || '';
  if (!secret) return back(req, `/parent/join/${code}?e=agree`);

  const sb = createServiceClient();
  const { data: link } = await sb.from('parent_links').select('id, student_identity, status, invite_expires_at').eq('invite_code', code).maybeSingle();
  if (!link || link.status !== 'pending' || !link.invite_expires_at || new Date(link.invite_expires_at as string) <= new Date()) {
    return back(req, `/parent/join/${code}`);
  }

  // The parent: one row per email (a parent of three children is one row).
  let parentId: string | null = null;
  {
    const { data: found } = await sb.from('parent_contacts').select('id').eq('email', email).maybeSingle();
    if (found) parentId = found.id as string;
    else {
      const { data: made, error } = await sb.from('parent_contacts').insert({ email }).select('id').single();
      if (error) { console.error('[parent/join] contact:', error.message); return back(req, `/parent/join/${code}?e=email`); }
      parentId = made.id as string;
    }
  }

  // Already linked to this child? Close the spare invite and go to the parent page.
  const { data: dup } = await sb.from('parent_links').select('id').eq('student_identity', link.student_identity).eq('parent_id', parentId).eq('status', 'active').limit(1);
  const now = new Date().toISOString();
  if (dup?.length) {
    await sb.from('parent_links').update({ status: 'ended', ended_at: now, ended_by: 'parent', invite_code: null }).eq('id', link.id).eq('status', 'pending');
  } else {
    const { data: done, error } = await sb.from('parent_links')
      .update({ status: 'active', parent_id: parentId, linked_at: now, invite_code: null, invite_expires_at: null })
      .eq('id', link.id).eq('status', 'pending').select('id');
    if (error || !done?.length) return back(req, `/parent/join/${code}`);
    const { error: cErr } = await sb.from('consent_records').insert({
      subject_identity: link.student_identity, given_by: 'parent', parent_contact_id: parentId,
      purpose: 'parent_weekly_report', action: 'given',
      notice_version: PARENT_NOTICE_VERSION, notice_hash: PARENT_NOTICE_HASH, channel: 'web',
    });
    if (cErr) console.error('[parent/join] consent record:', cErr.message);
  }

  const res = back(req, '/parent?linked=1');
  res.cookies.set(PARENT_COOKIE, signParentCookie(parentId!, secret), {
    httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: PARENT_COOKIE_DAYS * 86400,
  });
  return res;
}
