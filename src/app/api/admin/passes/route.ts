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
// paid days). Returns the new expiry. No UI yet — that lands with the invite
// build; nothing enforces passes anywhere yet either, so a grant here is
// forward-provisioning, always safe.
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';
import { grantPass, hasActivePass, DEFAULT_PASS_DAYS } from '@/lib/portal-passes';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type AccountHit = { id: string; email: string | null; display_name: string | null };

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { accountId?: string; accountEmail?: string; days?: number; reference?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON body required' }, { status: 400 });
  }

  const days = body.days === undefined ? DEFAULT_PASS_DAYS : body.days;
  if (!Number.isInteger(days) || days < 1 || days > 3650) {
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
      .select('id, email, display_name')
      .eq('id', body.accountId)
      .maybeSingle<AccountHit>();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    account = data ?? null;
  } else if (typeof body.accountEmail === 'string' && body.accountEmail.trim()) {
    // ilike with LIKE-wildcards escaped = case-insensitive exact match.
    const pattern = body.accountEmail.trim().replace(/[\\%_]/g, (c) => `\\${c}`);
    const { data, error } = await supabase
      .from('portal_accounts')
      .select('id, email, display_name')
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
