// Portal account activation (public, token-gated).
//
// GET  ?token=xxx        → { valid, studentName?, reason? } — for rendering the page
// POST { token, email, password, consent } → creates the Auth user + portal_accounts
//        row with the parental consent_record, consumes the token.
//
// PDPA: consent must be explicitly true; the consent_record stores the parent
// email the invite was sent to, the policy version, and the timestamp. No
// account (and no stored student data) can exist without it. See PRIVACY.md.
import { NextRequest, NextResponse } from 'next/server';
import { airtableRequest } from '@/lib/airtable';
import { createServiceClient } from '@/lib/supabase-server';
import { POLICY_VERSION } from '@/lib/portal-consent';

async function loadToken(token: string) {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('portal_invite_tokens')
    .select('*')
    .eq('token', token)
    .maybeSingle();
  if (!data) return { error: 'This link is not valid.' };
  if (data.consumed_at) return { error: 'This link has already been used.' };
  if (new Date(data.expires_at) < new Date()) return { error: 'This link has expired — ask Adrian for a new one.' };
  return { row: data };
}

export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get('token') || '';
  if (!token) return NextResponse.json({ valid: false, reason: 'Missing token' }, { status: 400 });
  const t = await loadToken(token);
  if ('error' in t) return NextResponse.json({ valid: false, reason: t.error });

  let studentName = 'your child';
  let level: string | null = null;
  try {
    const student = await airtableRequest('Students', `/${t.row.airtable_student_id}`);
    studentName = student.fields?.['Student Name'] || studentName;
    level = student.fields?.['Level'] || null;
  } catch { /* name is cosmetic — token validity is what matters */ }

  return NextResponse.json({ valid: true, studentName, level, policyVersion: POLICY_VERSION });
}

export async function POST(req: NextRequest) {
  const { token, email, password, consent } = await req.json().catch(() => ({}));
  if (!token || !email || !password) {
    return NextResponse.json({ error: 'token, email and password are required' }, { status: 400 });
  }
  if (consent !== true) {
    return NextResponse.json({ error: 'Parental consent is required to create the account' }, { status: 400 });
  }
  if (typeof password !== 'string' || password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 });
  }

  const t = await loadToken(token);
  if ('error' in t) return NextResponse.json({ error: t.error }, { status: 400 });

  // Student display fields from Airtable (best effort)
  let displayName: string | null = null;
  let level: string | null = null;
  let subjects: string[] | null = null;
  try {
    const student = await airtableRequest('Students', `/${t.row.airtable_student_id}`);
    displayName = student.fields?.['Student Name'] || null;
    level = student.fields?.['Level'] || null;
    // Subjects is a multipleSelects field → array of strings; scopes practice.
    const rawSubjects = student.fields?.['Subjects'];
    subjects = Array.isArray(rawSubjects) && rawSubjects.length ? rawSubjects : null;
  } catch { /* non-fatal */ }

  const supabase = createServiceClient();

  // Create the Auth user. email_confirm: the invite link went to the parent's
  // inbox and is single-use — that's our verification anchor (deviation from
  // "verify student email first" noted in PLAN-PORTAL-SOLO.md; keeps the flow
  // one-step for families).
  const { data: created, error: userErr } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (userErr || !created?.user) {
    const msg = userErr?.message || 'Could not create the account';
    const status = /already|registered|exists/i.test(msg) ? 409 : 500;
    return NextResponse.json(
      { error: status === 409 ? 'An account with this email already exists. Try logging in instead.' : msg },
      { status }
    );
  }

  const { error: acctErr } = await supabase.from('portal_accounts').insert({
    id: created.user.id,
    airtable_student_id: t.row.airtable_student_id,
    email,
    display_name: displayName,
    level,
    subjects,
    consent_record: {
      parent_email: t.row.email,
      policy_version: POLICY_VERSION,
      consented_at: new Date().toISOString(),
    },
  });
  if (acctErr) {
    // Roll back the orphan Auth user so the token can be retried cleanly.
    await supabase.auth.admin.deleteUser(created.user.id).catch(() => {});
    return NextResponse.json({ error: `Could not create the account: ${acctErr.message}` }, { status: 500 });
  }

  await supabase
    .from('portal_invite_tokens')
    .update({ consumed_at: new Date().toISOString(), consumed_by_user_id: created.user.id })
    .eq('token', token);

  return NextResponse.json({ ok: true });
}
