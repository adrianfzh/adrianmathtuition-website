// POST /api/payments/stripe-webhook — Stripe receiver for the $29 / 30-day
// portal pass. Stripe is the portal's payment rail (Adrian, 2026-08-28);
// the HitPay twin at ./../hitpay-webhook ships too but is parked.
//
// ENV-GATED: until STRIPE_WEBHOOK_SECRET is set in Vercel this answers 503 and
// does nothing — pasting the endpoint's whsec_… later lights it up with zero
// code changes. No stripe npm dependency: signature verification is hand-rolled
// in lib/stripe-verify.ts (HMAC-SHA256 over `${t}.${rawBody}`, any v1 match,
// ±300s replay window).
//
// SETUP (when ready): Stripe dashboard → Webhooks → add endpoint
//   https://www.adrianmathtuition.com/api/payments/stripe-webhook
// subscribed to checkout.session.completed (+ checkout.session.async_payment_
// succeeded for PayNow-style async methods); put its signing secret in
// STRIPE_WEBHOOK_SECRET.
//
// REFERENCE CONVENTION: Checkout Sessions WE create put the portal account id
// (uuid) in `client_reference_id` (optionally metadata.days to override the 30-
// day default). A verified PAID session whose client_reference_id matches a
// portal_accounts row — and whose amount clears the SGD auto-grant floor
// (PASS_MIN_AMOUNT_SGD, default S$25; non-SGD never auto-grants) — gets a pass,
// keyed on the session id for idempotency (Stripe retries webhooks; a retry
// must never stack a second 30 days). Anything else: 200, record nothing,
// Telegram Adrian to grant manually.
//
// STATUS CODES: 503 = not configured; 403 = bad/missing signature; 200 = every
// verified outcome (granted / duplicate / ignored event / unmatched-or-below-
// floor-but-alerted). A failed grant INSERT throws to a 500 on purpose —
// Stripe retries, and the session-id dedupe makes the retry safe.
import { NextRequest, NextResponse } from 'next/server';
import { verifyStripeSignature } from '@/lib/stripe-verify';
import {
  grantPass,
  findPassByReference,
  paymentQualifiesForPass,
  DEFAULT_PASS_DAYS,
} from '@/lib/portal-passes';
import { getSupabaseAdmin } from '@/lib/supabase';
import { sendTelegram } from '@/lib/telegram';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The slice of a Checkout Session this route reads. */
interface StripeSession {
  id?: string;
  client_reference_id?: string | null;
  payment_status?: string;
  amount_total?: number | null; // integer cents
  currency?: string | null; // lowercase, e.g. "sgd"
  metadata?: Record<string, string> | null;
}

function money(amountCents: number | null | undefined, currency: string): string {
  const cur = (currency || '').toUpperCase();
  const amt = typeof amountCents === 'number' ? (amountCents / 100).toFixed(2) : '?';
  return cur === 'SGD' || cur === '' ? `S$${amt}` : `${cur} ${amt}`;
}

export async function POST(req: NextRequest) {
  // Env gate — without the signing secret nothing can be verified, so accept
  // nothing. (503, not 404: the health-check probe asserts the route EXISTS.)
  const secret = (process.env.STRIPE_WEBHOOK_SECRET || '').trim();
  if (!secret) {
    return NextResponse.json({ error: 'stripe not configured' }, { status: 503 });
  }

  // Signature covers the RAW body — read text first, JSON.parse after.
  const rawBody = await req.text();
  if (!verifyStripeSignature(rawBody, req.headers.get('stripe-signature'), secret)) {
    console.error('[stripe-webhook] bad signature');
    return NextResponse.json({ error: 'invalid signature' }, { status: 403 });
  }

  // Verified from here on — everything below answers 200 (except a failed
  // grant insert, which throws so Stripe retries; see header).
  let event: { id?: string; type?: string; data?: { object?: StripeSession } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: true, ignored: 'unparseable body' });
  }

  // Only paid Checkout Sessions grant. `completed` can arrive with
  // payment_status 'unpaid' for async methods (PayNow) — the paid signal then
  // comes as async_payment_succeeded with the same session object.
  const type = event.type || '';
  if (type !== 'checkout.session.completed' && type !== 'checkout.session.async_payment_succeeded') {
    return NextResponse.json({ ok: true, ignored: type || 'no type' });
  }
  const session: StripeSession = event.data?.object ?? {};
  if (session.payment_status !== 'paid') {
    return NextResponse.json({ ok: true, ignored: `payment_status=${session.payment_status || 'none'}` });
  }

  // Idempotency: Stripe retries (and completed + async_payment_succeeded can
  // BOTH arrive for one session). One session id = one pass. grantPass also
  // enforces this internally; checking here answers retries fast.
  const reference = session.id || event.id || '';
  if (reference) {
    const already = await findPassByReference('stripe', reference);
    if (already) {
      return NextResponse.json({ ok: true, duplicate: true, expiresAt: already.expires_at });
    }
  }

  const ref = (session.client_reference_id || '').trim();
  const label = `${money(session.amount_total, session.currency || '')} (ref ${ref || '(empty)'})`;

  // Manual-note path: anything that shouldn't auto-grant answers 200 with
  // nothing recorded, and Adrian gets a Telegram to grant by hand in admin.
  const manual = async (reason: string) => {
    await sendTelegram(
      `💰 Stripe payment ${label} received — ${reason}; grant manually in admin.`
    ).catch(() => {});
    console.warn(`[stripe-webhook] paid session ${reference} not auto-granted: ${reason} (ref=${ref})`);
    return NextResponse.json({ ok: true, matched: false, reason });
  };

  // Amount floor + SGD-only gate (PASS_MIN_AMOUNT_SGD, default S$25): a S$1
  // link typo — or a malicious tiny payment aimed at a guessed uuid — must
  // never buy 30 days.
  const qual = paymentQualifiesForPass({
    amountCents: typeof session.amount_total === 'number' ? session.amount_total : null,
    currency: session.currency || '',
  });
  if (!qual.ok) return manual(qual.reason || 'payment did not qualify');

  let accountId: string | null = null;
  if (UUID_RE.test(ref)) {
    const { data } = await getSupabaseAdmin()
      .from('portal_accounts')
      .select('id')
      .eq('id', ref)
      .maybeSingle<{ id: string }>();
    accountId = data?.id ?? null;
  }
  if (!accountId) return manual('no account matched');

  // metadata.days may override the default (a future "90-day pass" price);
  // only a sane positive integer is honoured — anything else means 30.
  const parsedDays = parseInt(session.metadata?.days ?? '', 10);
  const days = Number.isInteger(parsedDays) && parsedDays > 0 && parsedDays <= 3650 ? parsedDays : DEFAULT_PASS_DAYS;

  const { expiresAt, duplicate } = await grantPass({
    accountId,
    days,
    source: 'stripe',
    reference: reference || null,
  });
  console.log(`[stripe-webhook] granted ${days}d pass to ${accountId} (session ${reference}), expires ${expiresAt}`);

  // Referral reward (Adrian, 2026-08-28): when the payer was invited, the
  // inviter earns — a PAYING inviter gets +7 days automatically (idempotent:
  // referral:<session id>); a TUITION inviter earns a S$10 invoice credit,
  // which stays a human step (his invoice adjustments), so Telegram him.
  // Fail-soft and only on the first grant — a webhook retry re-enters as
  // duplicate above and never re-rewards.
  if (!duplicate) {
    try {
      const svc = getSupabaseAdmin();
      const { data: payer } = await svc.from('portal_accounts')
        .select('id, display_name, invited_by').eq('id', accountId).maybeSingle();
      const inviterId = payer?.invited_by;
      if (inviterId) {
        const { data: inviter } = await svc.from('portal_accounts')
          .select('id, display_name, airtable_student_id').eq('id', inviterId).maybeSingle();
        if (inviter) {
          const payerName = payer?.display_name || 'a new student';
          if (inviter.airtable_student_id) {
            await sendTelegram(`🎁 Referral: ${payerName} paid — invited by ${inviter.display_name || 'a tuition student'} (tuition). S$10 off their next invoice is due.`);
          } else {
            const r = await grantPass({ accountId: inviter.id, days: 7, source: 'referral', reference: `referral:${reference}` });
            if (!r.duplicate) {
              await sendTelegram(`🎁 Referral: ${payerName} paid — inviter ${inviter.display_name || inviterId} auto-earned +7 days (now expires ${r.expiresAt}).`);
            }
          }
        }
      }
    } catch (e) {
      console.error('[stripe-webhook] referral reward failed (grant unaffected):', (e as Error).message);
    }
  }
  return NextResponse.json({ ok: true, granted: true, duplicate: duplicate ?? false, accountId, expiresAt });
}
