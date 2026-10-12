// A trial fee has been paid (Stripe webhook, metadata.kind = 'trial') → record it and hand the
// booking to the bot, which books the lesson in Airtable and confirms on WhatsApp
// (12 Oct 2026, SPEC-TRIAL-BOOKING.md). Idempotent: Stripe retries, and completed +
// async_payment_succeeded can both arrive for one session.
import { getSupabaseAdmin } from '@/lib/supabase';
import { botInternalSecret } from '@/lib/bot-secret';

export type TrialPaidResult = { ok: boolean; trialId: string; outcome: string };

/** Ask the bot to book the paid trial. True when the bot answered 2xx. */
async function forwardToBot(trialId: string): Promise<boolean> {
  const base = (process.env.BOT_BASE_URL || '').trim().replace(/\/$/, '');
  const secret = botInternalSecret() || '';
  if (!base || !secret) return false;
  try {
    const r = await fetch(`${base}/api/internal/trial-paid`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ trialId }),
      signal: AbortSignal.timeout(20000),
    });
    return r.ok;
  } catch {
    return false;
  }
}

export async function handleTrialPaid(session: {
  id?: string; amount_total?: number | null; currency?: string | null;
  payment_intent?: string | null; metadata?: Record<string, string> | null;
}, notify: (text: string) => Promise<unknown>): Promise<TrialPaidResult> {
  const trialId = String(session.metadata?.trial_id || '');
  const db = getSupabaseAdmin();
  const { data: row, error } = await db.from('trial_bookings')
    .select('id, status, amount_cents, student_name, phone').eq('id', trialId).maybeSingle();
  if (error) throw new Error(error.message);   // 500 → Stripe retries
  if (!row) {
    await notify(`💰 Trial fee paid on Stripe but no booking matched (session ${session.id}). Check Stripe and book by hand.`);
    return { ok: true, trialId, outcome: 'no-booking' };
  }
  const paidCents = Number(session.amount_total || 0);
  if (String(session.currency || '').toLowerCase() !== 'sgd' || paidCents !== row.amount_cents) {
    await notify(`💰 Trial fee for ${row.student_name}: paid ${paidCents / 100} ${session.currency}, expected $${row.amount_cents / 100}. Not booked — check by hand.`);
    return { ok: true, trialId, outcome: 'amount-mismatch' };
  }
  if (row.status === 'awaiting_payment' || row.status === 'expired') {
    const { error: upErr } = await db.from('trial_bookings').update({
      status: 'paid', payment_intent: session.payment_intent || null, stripe_session_id: session.id || null,
      paid_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq('id', trialId).in('status', ['awaiting_payment', 'expired']);
    if (upErr) throw new Error(upErr.message);
  } else if (row.status !== 'paid') {
    return { ok: true, trialId, outcome: `already ${row.status}` };   // a retry after the bot booked it
  }
  // status is 'paid': booked by the bot next. A failed hand-over answers 500 so Stripe retries.
  if (!(await forwardToBot(trialId))) {
    await notify(`⚠️ ${row.student_name}'s trial fee is paid, but the bot could not book the lesson yet. It will try again by itself; if this repeats, book it by hand.`);
    return { ok: false, trialId, outcome: 'bot-unreachable' };
  }
  return { ok: true, trialId, outcome: 'forwarded' };
}
