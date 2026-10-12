// Trial lessons a new parent books and pays for on WhatsApp (12 Oct 2026). SPEC-TRIAL-BOOKING.md.
// Pure money + state rules; the routes only fetch and write. The bot keeps the same fee table
// in lib/trial-booking.js — change both together.

/** Fee in cents: about one lesson at the monthly price (Adrian, 12 Oct 2026: "yes" to $80 / $90). */
export function trialFeeCents(level: string): number {
  return /^JC/i.test(String(level || '').trim()) ? 9000 : 8000;
}

/** A payment link is good for 48 hours after the booking was made (same as the sign-up link). */
export const TRIAL_PAY_WINDOW_MS = 48 * 60 * 60 * 1000;

export type TrialRow = {
  id: string;
  status: string;
  amount_cents: number;
  created_at: string;
  payment_intent?: string | null;
  refunded_at?: string | null;
  invoice_id?: string | null;
};

/** What the pay page should do with a booking. Pure. */
export function payPageAction(row: TrialRow | null, nowMs: number): 'checkout' | 'paid' | 'expired' | 'missing' {
  if (!row) return 'missing';
  if (row.status !== 'awaiting_payment') return row.payment_intent ? 'paid' : 'expired';
  if (nowMs - Date.parse(row.created_at) > TRIAL_PAY_WINDOW_MS) return 'expired';
  return 'checkout';
}

/** States in which the paid fee is still held and may be taken off the first bill. */
const CREDITABLE = new Set(['booked', 'asked', 'continuing', 'no_reply']);

/** The first-bill line for a paid trial, or null when nothing should be taken off. Pure. */
export function trialCreditLine(row: TrialRow | null): { description: string; amount: number } | null {
  if (!row || !CREDITABLE.has(row.status) || !row.payment_intent || row.refunded_at || row.invoice_id) return null;
  return { description: 'Trial lesson fee (already paid)', amount: -(row.amount_cents / 100) };
}

/** States from which Adrian's Refund button may send money back. */
const REFUNDABLE = new Set(['declined', 'no_show', 'cancelled', 'no_reply', 'slot_full', 'booked', 'asked']);

/** Whether a refund may go out for this booking, and why not. Pure. */
export function refundCheck(row: TrialRow | null): { ok: true } | { ok: false; reason: string } {
  if (!row) return { ok: false, reason: 'no such booking' };
  if (row.refunded_at || row.status === 'refunded') return { ok: false, reason: 'already refunded' };
  if (!row.payment_intent) return { ok: false, reason: 'never paid' };
  if (row.invoice_id || row.status === 'signed_up') return { ok: false, reason: 'already taken off the first bill' };
  if (!REFUNDABLE.has(row.status)) return { ok: false, reason: `status is ${row.status}` };
  return { ok: true };
}
