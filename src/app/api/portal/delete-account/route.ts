// POST /api/portal/delete-account — PDPA right to erasure. Permanently removes
// the caller's practice attempts, weakness tags, push subscriptions, invite
// tokens, portal account (incl. consent record), and the Auth user. Airtable
// (lessons/billing) is untouched — that's Adrian's tutoring bookkeeping,
// outside the portal's scope.
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer, createServiceClient } from '@/lib/supabase-server';
import { portalIdentity } from '@/lib/portal-auth';

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { confirm } = await req.json().catch(() => ({}));
  if (confirm !== 'DELETE') {
    return NextResponse.json({ error: 'Confirmation phrase missing' }, { status: 400 });
  }

  const admin = createServiceClient();

  // Look up the account first (need airtable_student_id to purge invite tokens
  // and the portal identity to purge push subscriptions).
  const { data: account } = await admin
    .from('portal_accounts')
    .select('id, airtable_student_id')
    .eq('id', user.id)
    .maybeSingle();

  // Order matters: children first, auth user last. Each step is idempotent so a
  // partial failure can be retried by the user.
  const { error: e1 } = await admin.from('student_attempts').delete().eq('user_id', user.id);
  if (e1) return NextResponse.json({ error: `Could not delete attempts: ${e1.message}` }, { status: 500 });

  // Weakness tags are derived from the attempts — erasure covers them too
  // (gap found in the 2026-08-21 Phase G pass: they were left behind).
  const { error: eTags } = await admin.from('weakness_tags').delete().eq('user_id', user.id);
  if (eTags) return NextResponse.json({ error: `Could not delete weakness tags: ${eTags.message}` }, { status: 500 });

  if (account?.airtable_student_id) {
    await admin.from('portal_invite_tokens').delete().eq('airtable_student_id', account.airtable_student_id);
  }

  // Push subscriptions are keyed on the portal identity (rec… / acct:<uuid>) —
  // without this, a deleted account's devices would keep receiving pushes.
  // Best-effort like the invite-token purge: never blocks the erasure.
  if (account) {
    await admin.from('portal_push_subscriptions').delete()
      .eq('airtable_student_id', portalIdentity(account));
  }

  const { error: e2 } = await admin.from('portal_accounts').delete().eq('id', user.id);
  if (e2) return NextResponse.json({ error: `Could not delete account row: ${e2.message}` }, { status: 500 });

  const { error: e3 } = await admin.auth.admin.deleteUser(user.id);
  if (e3) return NextResponse.json({ error: `Could not delete login: ${e3.message}` }, { status: 500 });

  return NextResponse.json({ ok: true });
}
