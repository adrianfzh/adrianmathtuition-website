// POST /api/payments/hitpay-webhook — HitPay v1 payment-confirmation receiver
// for the $29 / 30-day portal pass (money plumbing only; no UI paywall yet).
//
// ENV-GATED: until HITPAY_WEBHOOK_SALT is set in Vercel this answers 503 and
// does nothing — pasting HITPAY_API_KEY + HITPAY_WEBHOOK_SALT later lights the
// whole flow up with zero code changes.
//
// SETUP (when keys exist): create payment requests with
//   webhook = https://www.adrianmathtuition.com/api/payments/hitpay-webhook
// and put the dashboard's Salt (API Keys section) in HITPAY_WEBHOOK_SALT.
//
// CONTRACT (v1, form-encoded POST): payment_id, payment_request_id, phone,
// amount, currency, status, reference_number, hmac — hmac is HMAC-SHA256 over
// the sorted `${key}${value}` concatenation of all non-hmac fields, keyed with
// the Salt (see lib/hitpay.ts for the verified canonicalisation).
//
// REFERENCE CONVENTION (v1): checkouts WE create put the portal account id
// (uuid) in reference_number. A verified completed payment whose reference is
// a uuid matching portal_accounts gets an automatic 30-day pass, keyed on
// payment_id for idempotency (HitPay retries webhooks; a retry must never
// stack a second 30 days). Anything else (e.g. a dashboard payment link with
// an arbitrary reference) is NOT guessed at: we answer 200, record nothing,
// and Telegram Adrian to grant manually in admin.
//
// STATUS CODES: 503 = not configured yet; 403 = bad/missing signature (the
// only rejection); 200 = verified and handled (granted, duplicate, ignored
// non-completed, or unmatched-but-alerted). A failed grant INSERT throws to a
// 500 on purpose — HitPay retries, and the payment_id dedupe makes the retry
// safe, so a transient DB blip cannot silently swallow a payment.
import { NextRequest, NextResponse } from 'next/server';
import { verifyHitPayHmac, parseHitPayWebhook } from '@/lib/hitpay';
import { grantPass, findPassByReference, DEFAULT_PASS_DAYS } from '@/lib/portal-passes';
import { getSupabaseAdmin } from '@/lib/supabase';
import { sendTelegram } from '@/lib/telegram';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function money(amount: string, currency: string): string {
  const cur = (currency || '').toUpperCase();
  return cur === 'SGD' || cur === '' ? `S$${amount}` : `${cur} ${amount}`;
}

export async function POST(req: NextRequest) {
  // Env gate — no salt means we could not verify anything, so accept nothing.
  // (503, not 404: the health-check probe asserts the route EXISTS either way.)
  const salt = (process.env.HITPAY_WEBHOOK_SALT || '').trim();
  if (!salt) {
    return NextResponse.json({ error: 'hitpay not configured' }, { status: 503 });
  }

  // HitPay sends application/x-www-form-urlencoded; formData() also copes with
  // multipart. An unparseable/empty body cannot carry a valid signature → 403.
  let payload;
  try {
    payload = parseHitPayWebhook(await req.formData());
  } catch {
    return NextResponse.json({ error: 'invalid signature' }, { status: 403 });
  }

  // Signature check over EVERY posted field (payload.raw), not a fixed list.
  if (!verifyHitPayHmac(payload.raw, salt)) {
    console.error(
      `[hitpay-webhook] bad signature: payment_id=${payload.paymentId || '(none)'} ref=${payload.referenceNumber || '(none)'}`
    );
    return NextResponse.json({ error: 'invalid signature' }, { status: 403 });
  }

  // Verified from here on — everything below answers 200 (except a failed
  // grant insert, which throws so HitPay retries; see header).

  // Only completed payments grant anything; pending/failed are acknowledged.
  if (payload.status !== 'completed') {
    return NextResponse.json({ ok: true, ignored: payload.status || 'no status' });
  }

  // Idempotency: HitPay retries until it sees 200. One payment_id = one pass.
  const paymentId = payload.paymentId;
  if (paymentId) {
    const already = await findPassByReference('hitpay', paymentId);
    if (already) {
      return NextResponse.json({ ok: true, duplicate: true, expiresAt: already.expires_at });
    }
  }

  // v1 account resolution: our checkout links carry the portal account uuid in
  // reference_number. Anything else → manual-grant Telegram, never a guess.
  const ref = payload.referenceNumber.trim();
  let accountId: string | null = null;
  if (UUID_RE.test(ref)) {
    const { data } = await getSupabaseAdmin()
      .from('portal_accounts')
      .select('id')
      .eq('id', ref)
      .maybeSingle<{ id: string }>();
    accountId = data?.id ?? null;
  }

  if (!accountId) {
    await sendTelegram(
      `💰 HitPay payment ${money(payload.amount, payload.currency)} received ` +
      `(ref ${ref || '(empty)'}) — no account matched; grant manually in admin.`
    ).catch(() => {});
    console.warn(`[hitpay-webhook] completed payment ${paymentId} did not match an account (ref=${ref})`);
    return NextResponse.json({ ok: true, matched: false });
  }

  const { expiresAt } = await grantPass({
    accountId,
    days: DEFAULT_PASS_DAYS,
    source: 'hitpay',
    reference: paymentId || `payment_request:${payload.paymentRequestId}`,
  });
  console.log(`[hitpay-webhook] granted ${DEFAULT_PASS_DAYS}d pass to ${accountId} (payment ${paymentId}), expires ${expiresAt}`);
  return NextResponse.json({ ok: true, granted: true, accountId, expiresAt });
}
