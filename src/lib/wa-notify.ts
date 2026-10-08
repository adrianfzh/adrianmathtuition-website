// Ask the bot to send one WhatsApp message the business starts (8 Oct 2026).
//
// The website knows WHEN (an invoice just went out); the bot holds the one door
// (its lib/twilio.js sendTemplate): the message's switch, test mode, the parent's
// opt-in, the log. So this only ASKS — while the switch is off, or the parent has
// not sent START, the bot answers "not sent" and nothing happens.
//
// Never throws and never holds up what called it: an invoice e-mail that went
// out stays sent whatever WhatsApp does.
import { signViewToken } from './view-token';

export type WaResult = { sent: boolean; reason?: string };

/** "2026-11-07" → "7 Nov". Anything else is passed through as it came. Pure. */
export function shortDue(dueDate: unknown): string {
  const s = String(dueDate ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return new Date(`${s}T00:00:00Z`).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

export type InvoiceForWa = {
  id: string; studentName: string; month: string; finalAmount: number; dueDate: unknown; paymentRef: string;
};

/**
 * The six values of the bot's `invoice_ready` template, in its order: month, student,
 * amount, due date, payment reference, the private link's code. Null when the invoice
 * should not be announced — nothing to pay, or a value the message cannot do without.
 * Pure (the clock is passed in).
 */
export function invoiceReadyValues(inv: InvoiceForWa, secret: string, nowMs: number = Date.now()): string[] | null {
  const amount = Number(inv.finalAmount);
  const due = shortDue(inv.dueDate);
  if (!(amount > 0) || !inv.studentName || !inv.month || !due || !inv.paymentRef || !secret) return null;
  let code: string;
  try { code = signViewToken('invoice', inv.id, secret, nowMs); } catch { return null; }
  return [inv.month, inv.studentName, amount.toFixed(2), due, inv.paymentRef, code];
}

export async function sendWhatsAppTemplate(
  template: 'invoice_ready' | 'payment_received' | 'paper_marked' | 'progress_note',
  msg: { to: string; values: string[]; studentId?: string; ref?: string },
): Promise<WaResult> {
  const base = (process.env.BOT_BASE_URL || '').trim().replace(/\/$/, '');
  const secret = process.env.BOT_INTERNAL_SECRET || '';
  if (!base || !secret || !msg.to) return { sent: false, reason: 'not-configured' };
  try {
    const r = await fetch(`${base}/api/internal/wa-send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ template, ...msg }),
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return { sent: false, reason: `bot ${r.status}` };
    const j = (await r.json().catch(() => ({}))) as Partial<WaResult>;
    return { sent: j.sent === true, reason: j.reason };
  } catch (e) {
    return { sent: false, reason: e instanceof Error ? e.message : 'error' };
  }
}
