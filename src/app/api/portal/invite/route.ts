// POST /api/portal/invite — admin "Send portal invite".
// Body: { airtableStudentId: 'recXXX' }
// Auth: ADMIN_PASSWORD Bearer (admin-called; every other /api/portal/* route is session-based).
//
// PDPA note: the invite email goes to the PARENT (Parent Email), because the
// parent must be the one consenting — students are minors. See PRIVACY.md §4.
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
  const { airtableStudentId } = await req.json().catch(() => ({}));
  if (!airtableStudentId || !/^rec[a-zA-Z0-9]+$/.test(airtableStudentId)) {
    return NextResponse.json({ error: 'airtableStudentId required' }, { status: 400 });
  }

  // 1. Student record → parent email + names
  let student;
  try {
    student = await airtableRequest('Students', `/${airtableStudentId}`);
  } catch {
    return NextResponse.json({ error: 'Student not found in Airtable' }, { status: 404 });
  }
  const f = student.fields || {};
  const studentName = (f['Student Name'] as string) || 'your child';
  const parentEmail = (f['Parent Email'] as string || '').trim();
  const parentName = (f['Parent Name'] as string || '').trim();
  const level = (f['Level'] as string) || null;
  if (!parentEmail) {
    return NextResponse.json({ error: 'Student has no Parent Email in Airtable' }, { status: 400 });
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
    email: parentEmail,
    expires_at: expiresAt,
    created_by_admin: 'admin',
  });
  if (insErr) {
    return NextResponse.json({ error: `Could not create invite: ${insErr.message}` }, { status: 500 });
  }

  // 4. Email the parent via Resend
  const inviteUrl = `${SITE_URL}/signup?token=${token}&portal=1`;
  const firstName = parentName.split(' ')[0] || 'there';
  const html = `
    <div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:520px;margin:0 auto;color:#1a1a2e">
      <h2 style="color:#1F2A5C">AdrianMath Student Portal</h2>
      <p>Hi ${firstName},</p>
      <p>I've set up a personal practice space for <strong>${studentName}</strong> — a private portal with
      practice questions from real school papers, instant marking feedback, and revision notes.</p>
      <p>Because ${studentName} is under 18, I need your consent before the account is created.
      The link below explains what data is stored and how it's used, and lets you approve the
      account and help ${studentName} set a password:</p>
      <p style="margin:28px 0">
        <a href="${inviteUrl}" style="background:#1F2A5C;color:#FFF8E7;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:600">
          Review &amp; set up ${studentName}'s account
        </a>
      </p>
      <p style="font-size:13px;color:#666">This link is for your family only and expires in ${INVITE_TTL_DAYS} days.
      If you have any questions, just reply to this email.</p>
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
      to: parentEmail,
      reply_to: 'ablnon@hotmail.com',
      subject: `AdrianMath Portal — set up ${studentName}'s account`,
      html,
    }),
  });
  if (!sendRes.ok) {
    const detail = await sendRes.text();
    // Token exists but the email failed — surface it so admin can retry.
    return NextResponse.json({ error: `Invite created but email failed: ${detail}` }, { status: 502 });
  }

  return NextResponse.json({ ok: true, sentTo: parentEmail, expiresAt });
}
