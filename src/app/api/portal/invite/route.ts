// TODO PORTAL: POST /api/portal/invite — admin "Send portal invite" handler.
//
// Body:
//   { airtableStudentId: 'recXXX' }
//
// Auth: ADMIN_PASSWORD via Authorization header (existing pattern).
//
// Steps:
// 1. Look up the Airtable Students record. Read Parent Email, Student Name,
//    Level, Subject Level. If no email → 400.
// 2. Generate a 32-char URL-safe token (crypto.randomBytes).
// 3. INSERT into portal_invite_tokens with expires_at = now() + 7 days.
//    Use the service-role Supabase client.
// 4. Send email via Resend:
//      Subject: "Welcome to AdrianMath Portal — {firstName}"
//      Body:
//        Hi {firstName},
//        I've set up a personal practice space for you.
//        Click below to set your password and get started:
//        [Set up your account] → https://www.adrianmathtuition.com/signup?token={token}&portal=1
//        — Adrian
// 5. Return 200 with { ok: true, expiresAt }.
//
// The /signup page (existing) needs a small extension to handle ?portal=1:
// - When portal=1 and token is valid + unconsumed:
//   - Show password fields (no slot picking)
//   - On submit: create Supabase Auth user via service-role,
//     INSERT portal_account row, mark token consumed,
//     send email-verification email, redirect to /verify-email
// - When portal=1 and token is invalid: show "This link has expired" + /login link

import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  // TODO PORTAL: implement
  return NextResponse.json(
    { error: 'Not implemented yet — see PORTAL.md' },
    { status: 501 }
  );
}
