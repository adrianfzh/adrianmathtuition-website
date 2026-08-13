// Write-side: decide how much unallocated ledger credit to apply to a fresh invoice.
//
// Pairs with lib/payment-ledger.js (bot repo), which records every received payment
// in the Airtable `Payments` table and each settlement in `Payment Allocations`.
// A payment's still-unallocated amount = Amount − Allocated (Allocated is the rollup
// of its allocation rows). When a payment arrives with no open invoice, the bot holds
// it as an unallocated credit. THIS helper re-attributes that credit to a new invoice.
//
// SAFETY — the guard against silently mis-attributing a credit:
//   Only HIGH-confidence credits auto-apply. The bot stamps each Payments row with the
//   payer→student match confidence ('high' when the payer name matched the student's
//   Payment Alias/name exactly, 'medium'/'' when it was fuzzy). Fuzzy credits are NEVER
//   auto-applied here — they are returned in `skipped` for manual admin apply. So a
//   mismatched payer name can never silently zero a parent's invoice.
//
// Pure function — no Airtable calls. The route feeds it the student's Payments rows and
// applies the returned allocations (patch invoice Amount Paid + create allocation rows).

export interface CreditPayment {
  id: string;
  amount: number;       // Payments.Amount
  allocated: number;    // Payments.Allocated (rollup of allocation rows)
  date: string;         // Payments.Date — oldest credit is spent first
  confidence: string;   // Payments.Match Confidence — only 'high' auto-applies
  payerName: string;    // Payments.Payer Name — for the audit line
}

export interface CreditApplication {
  applied: number;                                      // total credit applied to this invoice
  allocations: { paymentId: string; amount: number; payerName: string; date: string }[];
  skipped: { paymentId: string; pending: number; payerName: string; reason: string }[];
}

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Decide the credit to apply to one invoice.
 * @param payments  the student's Payments rows (all of them; this filters/sorts).
 * @param invoiceOwed  amount still owed on the invoice (finalAmount − alreadyPaid).
 */
export function computeCreditApplication(payments: CreditPayment[], invoiceOwed: number): CreditApplication {
  let remaining = Math.max(round2(invoiceOwed), 0);
  const allocations: CreditApplication['allocations'] = [];
  const skipped: CreditApplication['skipped'] = [];

  // Oldest credit first (stable): sort by date, then id to break ties deterministically.
  const sorted = [...payments].sort(
    (a, b) => String(a.date).localeCompare(String(b.date)) || String(a.id).localeCompare(String(b.id)),
  );

  for (const p of sorted) {
    const pending = round2((p.amount || 0) - (p.allocated || 0));
    if (pending <= 0.005) continue;                       // nothing left on this payment
    if (p.confidence !== 'high') {                        // GUARD: fuzzy credit → manual apply only
      skipped.push({ paymentId: p.id, pending, payerName: p.payerName || '', reason: `match confidence '${p.confidence || 'unknown'}' — needs manual apply` });
      continue;
    }
    if (remaining <= 0.005) continue;                     // invoice already covered; leave credit intact
    const take = round2(Math.min(pending, remaining));
    allocations.push({ paymentId: p.id, amount: take, payerName: p.payerName || '', date: p.date });
    remaining = round2(remaining - take);
  }

  return { applied: round2(allocations.reduce((s, a) => s + a.amount, 0)), allocations, skipped };
}
