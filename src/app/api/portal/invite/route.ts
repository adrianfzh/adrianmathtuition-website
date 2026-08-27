// POST /api/portal/invite — admin "Send portal invite".
// Body: { airtableStudentId: 'recXXX', delivery?: 'email' | 'link' }
// Auth: ADMIN_PASSWORD Bearer (admin-called; every other /api/portal/* route is session-based).
//
// Invites go DIRECTLY to the student (Student Email) — Adrian's call, 2026-08-14:
// "I want to only invite students (don't want to go through parents)." The
// activation page still shows what's stored and links the privacy policy, and
// parents can request export/deletion at any time. If a student has no
// Student Email in Airtable, email delivery 400s rather than silently falling
// back to the parent — add the email first.
//
// delivery:'link' (Adrian 2026-08-27: "give them the link") skips the email
// entirely and returns { inviteUrl } for Adrian to WhatsApp or show in person
// — students rarely check email, and this needs no Student Email in Airtable.
// The student still sets their own email + password on the activation page,
// so no password ever passes through Adrian's hands.
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { airtableRequest } from '@/lib/airtable';
import { createServiceClient } from '@/lib/supabase-server';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.adrianmathtuition.com';
const INVITE_TTL_DAYS = 7;

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { airtableStudentId, delivery } = await req.json().catch(() => ({}));
  if (!airtableStudentId || !/^rec[a-zA-Z0-9]+$/.test(airtableStudentId)) {
    return NextResponse.json({ error: 'airtableStudentId required' }, { status: 400 });
  }
  const linkOnly = delivery === 'link';

  // 1. Student record → the student's own email + name
  let student;
  try {
    student = await airtableRequest('Students', `/${airtableStudentId}`);
  } catch {
    return NextResponse.json({ error: 'Student not found in Airtable' }, { status: 404 });
  }
  const f = student.fields || {};
  const studentName = (f['Student Name'] as string) || 'there';
  const studentEmail = (f['Student Email'] as string || '').trim();
  if (!studentEmail && !linkOnly) {
    return NextResponse.json(
      { error: `${studentName} has no Student Email in Airtable — add it to the Students record first, or use Copy invite link` },
      { status: 400 }
    );
  }

  const supabase = createServiceClient();

  // 2. Refuse if the student already has an account
  const { data: existing } = await supabase
    .from('portal_accounts')
    .select('id')
    .eq('airtable_student_id', airtableStudentId)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: `${studentName} already has a portal account` }, { status: 409 });
  }

  // 3. Single-use token, 7-day expiry
  const token = crypto.randomBytes(24).toString('base64url');
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { error: insErr } = await supabase.from('portal_invite_tokens').insert({
    token,
    airtable_student_id: airtableStudentId,
    email: studentEmail,
    expires_at: expiresAt,
    created_by_admin: linkOnly ? 'admin (link)' : 'admin',
  });
  if (insErr) {
    return NextResponse.json({ error: `Could not create invite: ${insErr.message}` }, { status: 500 });
  }

  const inviteUrl = `${SITE_URL}/signup?token=${token}&portal=1`;

  // delivery:'link' — hand the URL back for WhatsApp / in-person delivery.
  if (linkOnly) {
    return NextResponse.json({ ok: true, inviteUrl, studentName, expiresAt });
  }

  // 4. Email the student via Resend
  const firstName = studentName.split(' ')[0] || 'there';
  const html = `
    <div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:520px;margin:0 auto;color:#1a1a2e">
      <h2 style="color:#1F2A5C">AdrianMath Student Portal</h2>
      <p>Hi ${firstName},</p>
      <p>I've set up your own space on the AdrianMath portal — your marked papers with my feedback
      and practice questions from real school papers with instant marking, all in one private
      account.</p>
      <p style="margin:28px 0">
        <a href="${inviteUrl}" style="background:#1F2A5C;color:#FFF8E7;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:600">
          Set up your account
        </a>
      </p>
      <p style="font-size:13px;color:#666">This link is just for you and expires in ${INVITE_TTL_DAYS} days.
      The setup page explains what's stored; your parents are welcome to read it with you.
      Any questions, just reply to this email or message me.</p>
      <p>— Adrian</p>
    </div>`;

  const sendRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: "Adrian's Math Tuition <portal@adrianmathtuition.com>",
      to: studentEmail,
      reply_to: 'ablnon@hotmail.com',
      subject: `Your AdrianMath portal account is ready, ${firstName}`,
      html,
    }),
  });
  if (!sendRes.ok) {
    const detail = await sendRes.text();
    // Token exists but the email failed — surface it so admin can retry.
    return NextResponse.json({ error: `Invite created but email failed: ${detail}` }, { status: 502 });
  }

  return NextResponse.json({ ok: true, sentTo: studentEmail, expiresAt });
}
