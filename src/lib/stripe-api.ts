// The two Stripe calls the trial booking needs (12 Oct 2026, SPEC-TRIAL-BOOKING.md): open a
// Checkout page for one trial fee, and refund it. Plain REST, no SDK — the rest of the site only
// verifies webhooks (lib/stripe-verify.ts). Key: STRIPE_SECRET_KEY (restricted key; it has
// Checkout Sessions + Refunds write). Every money-moving call carries an Idempotency-Key, so a
// retry or a double tap can never charge or refund twice.

const API = 'https://api.stripe.com/v1';

function key(): string {
  const k = (process.env.STRIPE_SECRET_KEY || '').trim();
  if (!k) throw new Error('STRIPE_SECRET_KEY is not set');
  return k;
}

async function post(path: string, form: Record<string, string>, idempotencyKey: string) {
  const r = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key()}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Idempotency-Key': idempotencyKey,
    },
    body: new URLSearchParams(form).toString(),
    signal: AbortSignal.timeout(15000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`stripe ${path} ${r.status}: ${j?.error?.message || 'error'}`);
  return j;
}

/** A Checkout page for one trial fee. metadata.kind = 'trial' routes the webhook. */
export async function createTrialCheckout(opts: {
  trialId: string; amountCents: number; studentName: string; level: string; whenLabel: string; baseUrl: string;
}): Promise<{ id: string; url: string }> {
  const s = await post('/checkout/sessions', {
    mode: 'payment',
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': 'sgd',
    'line_items[0][price_data][unit_amount]': String(opts.amountCents),
    'line_items[0][price_data][product_data][name]': `Trial lesson — ${opts.studentName} (${opts.level})`,
    'line_items[0][price_data][product_data][description]': `${opts.whenLabel}. Taken off the first bill if you continue, refunded if you do not.`,
    client_reference_id: `trial:${opts.trialId}`,
    'metadata[kind]': 'trial',
    'metadata[trial_id]': opts.trialId,
    'payment_intent_data[metadata][kind]': 'trial',
    'payment_intent_data[metadata][trial_id]': opts.trialId,
    success_url: `${opts.baseUrl}/trial/done`,
    cancel_url: `${opts.baseUrl}/trial/pay/${opts.trialId}?cancelled=1`,
    // Checkout pages last 24 h by default; ours lasts as long as the WhatsApp link does not.
    expires_at: String(Math.floor(Date.now() / 1000) + 23 * 3600),
  }, `trial-checkout-${opts.trialId}-${Math.floor(Date.now() / 3600_000)}`);
  if (!s?.id || !s?.url) throw new Error('stripe: no checkout url');
  return { id: s.id, url: s.url };
}

/** Refund a payment in full. Same trial → same refund, however many times it is asked. */
export async function refundPayment(paymentIntent: string, trialId: string): Promise<{ id: string; status: string }> {
  const r = await post('/refunds', { payment_intent: paymentIntent, 'metadata[trial_id]': trialId }, `trial-refund-${trialId}`);
  return { id: r.id, status: r.status };
}
