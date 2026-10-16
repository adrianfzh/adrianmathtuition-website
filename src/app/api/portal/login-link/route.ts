// POST /api/portal/login-link — the "Log in" button on /login/link (16 Oct 2026,
// lib/login-link.ts). A plain form post: checks our signature + 15-minute expiry,
// then spends Supabase's one-time hash, which sets the session cookie, and sends
// the student to Settings so they can choose a new password. Any failure → the
// login page's "That link has expired or was already used" message.
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer, createServiceClient } from '@/lib/supabase-server';
import { botInternalSecret } from '@/lib/bot-secret';
import { portalIdentity } from '@/lib/portal-auth';
import { verifyLoginLink, LOGIN_LINK_USED_KIND } from '@/lib/login-link';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const origin = new URL(req.url).origin;
  const fail = NextResponse.redirect(new URL('/login?error=link', origin), 303);
  const secret = botInternalSecret();
  const form = await req.formData().catch(() => null);
  const v = secret ? verifyLoginLink(form?.get('t'), secret) : null;
  if (!v) return fail;
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.auth.verifyOtp({ type: 'magiclink', token_hash: v.hash });
  if (error || !data.user) return fail;
  try {
    const { data: acct } = await createServiceClient().from('portal_accounts')
      .select('id, airtable_student_id').eq('id', data.user.id).maybeSingle<{ id: string; airtable_student_id: string | null }>();
    if (acct) await createServiceClient().from('portal_event_log').insert({ identity: portalIdentity(acct), kind: LOGIN_LINK_USED_KIND, detail: null });
  } catch { /* the log never blocks the sign-in */ }
  return NextResponse.redirect(new URL('/app/settings?from=login-link', origin), 303);
}
