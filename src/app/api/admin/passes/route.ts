// POST /api/admin/passes — Adrian's manual pass grant, the human bridge while
// (and after) HitPay checkout is being wired: send the payment link on
// WhatsApp, see the money arrive, grant 30 days with one call.
//
//   curl -X POST https://www.adrianmathtuition.com/api/admin/passes \
//     -H "Authorization: Bearer $ADMIN_PASSWORD" -H "Content-Type: application/json" \
//     -d '{"accountEmail":"student@example.com","days":30,"reference":"paynow 28 Aug"}'
//
// Body: { accountId? (portal_accounts uuid) | accountEmail?, days? (default 30),
// reference? (free-text audit note) }. Grants source:'manual'; stacking rules
// live in lib/portal-passes.ts (extends from the current expiry, never wastes
// paid days). Returns the new expiry.
//
// Offboarding (2026-08-28) — the same route is Adrian's on/off switch:
//   { action:'deactivate', accountEmail|accountId } → sets deactivated_at; the
//     account stops being tuition-free (lib/portal-passes.isTuitionAccount)
//     and falls through to the S$29 pass gate like a stranger — a graduate
//     can pay to keep access, otherwise the paywall stops them. Their history
//     stays keyed on the rec id (portal-auth.portalIdentity ignores the flag).
//   { action:'reactivate', … } → clears deactivated_at (tuition-free again).
// Both are idempotent (deactivating twice keeps the ORIGINAL offboarding
// date) and return the account's new state.
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';
import { grantPass, hasActivePass, isTuitionAccount, DEFAULT_PASS_DAYS } from '@/lib/portal-passes';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type AccountHit = {
  id: string;
  email: string | null;
  display_name: string | null;
  airtable_student_id: string | null;
  deactivated_at: string | null;
};
const ACCOUNT_COLS = 'id, email, display_name, airtable_student_id, deactivated_at';

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: {
    accountId?: string;
    accountEmail?: string;
    days?: number;
    reference?: string;
    action?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON body required' }, { status: 400 });
  }

  const action = body.action === undefined ? 'grant' : body.action;
  if (action !== 'grant' && action !== 'deactivate' && action !== 'reactivate') {
    return NextResponse.json({ error: "action must be omitted (grant), 'deactivate' or 'reactivate'" }, { status: 400 });
  }

  const days = body.days === undefined ? DEFAULT_PASS_DAYS : body.days;
  if (action === 'grant' && (!Number.isInteger(days) || days < 1 || days > 3650)) {
    return NextResponse.json({ error: 'days must be an integer between 1 and 3650' }, { status: 400 });
  }

  // Resolve the portal account — by id, or by the email stored on
  // portal_accounts (written at activation; matched case-insensitively).
  const supabase = getSupabaseAdmin();
  let account: AccountHit | null = null;

  if (body.accountId) {
    if (!UUID_RE.test(body.accountId)) {
      return NextResponse.json({ error: 'accountId must be a portal_accounts uuid' }, { status: 400 });
    }
    const { data, error } = await supabase
      .from('portal_accounts')
      .select(ACCOUNT_COLS)
      .eq('id', body.accountId)
      .maybeSingle<AccountHit>();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    account = data ?? null;
  } else if (typeof body.accountEmail === 'string' && body.accountEmail.trim()) {
    // ilike with LIKE-wildcards escaped = case-insensitive exact match.
    const pattern = body.accountEmail.trim().replace(/[\\%_]/g, (c) => `\\${c}`);
    const { data, error } = await supabase
      .from('portal_accounts')
      .select(ACCOUNT_COLS)
      .ilike('email', pattern)
      .limit(2);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if ((data?.length ?? 0) > 1) {
      // Should be impossible (one Auth user per email) — refuse rather than guess.
      return NextResponse.json({ error: 'multiple accounts match that email — grant by accountId' }, { status: 409 });
    }
    account = (data?.[0] as AccountHit | undefined) ?? null;
  } else {
    return NextResponse.json({ error: 'provide accountId or accountEmail' }, { status: 400 });
  }

  if (!account) {
    return NextResponse.json({ error: 'no portal account matched' }, { status: 404 });
  }

  if (action === 'deactivate' || action === 'reactivate') {
    // Idempotent: deactivating twice keeps the ORIGINAL offboarding date;
    // reactivating an active account writes nothing.
    const wantDeactivated = action === 'deactivate';
    let updated = account;
    const needsWrite = wantDeactivated ? !account.deactivated_at : Boolean(account.deactivated_at);
    if (needsWrite) {
      const { data, error } = await supabase
        .from('portal_accounts')
        .update({ deactivated_at: wantDeactivated ? new Date().toISOString() : null })
        .eq('id', account.id)
        .select(ACCOUNT_COLS)
        .single<AccountHit>();
      if (error || !data) {
        return NextResponse.json({ error: error?.message ?? 'update returned no row' }, { status: 500 });
      }
      updated = data;
    }
    return NextResponse.json({
      ok: true,
      action,
      changed: needsWrite,
      accountId: updated.id,
      email: updated.email,
      displayName: updated.display_name,
      airtableStudentId: updated.airtable_student_id,
      deactivatedAt: updated.deactivated_at,
      // The state that matters: false after deactivation (they now need a
      // pass), true again after reactivating a linked account.
      tuitionFree: isTuitionAccount(updated),
      activePass: await hasActivePass(updated.id),
    });
  }

  try {
    const { id, expiresAt } = await grantPass({
      accountId: account.id,
      days,
      source: 'manual',
      reference: typeof body.reference === 'string' && body.reference.trim() ? body.reference.trim() : null,
    });
    return NextResponse.json({
      ok: true,
      passId: id,
      accountId: account.id,
      email: account.email,
      displayName: account.display_name,
      days,
      expiresAt,
      active: await hasActivePass(account.id),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
