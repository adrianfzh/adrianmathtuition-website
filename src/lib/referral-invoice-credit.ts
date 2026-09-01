// Automatic −S$10 referral credit for TUITION inviters (Adrian, 2026-09-02:
// "make the credit apply itself; the Telegram becomes a receipt").
//
// When an invited friend's first S$29 pass payment clears, the tuition
// inviter's reward used to be a Telegram asking Adrian to apply −S$10 to
// their next invoice by hand. This module writes that credit ITSELF, as a
// **deferred invoice adjustment** — the exact mechanism docs/INVOICES.md
// prescribes ("Deferred Adjustments (carry a credit/charge to a FUTURE
// month's invoice)"): the 4 fields `Deferred Amount` (signed currency,
// negative = credit) / `Deferred Note` / `Deferred To Month` (`Month YYYY`) /
// `Deferred Applied` are set on one of the student's CURRENT invoices, and
// `generate-invoices` applies them to the target month's new invoice exactly
// once (Line Items Extra line + Final Amount bump + Auto Notes + tick).
// Nothing here touches the generator — we only write one carrier record the
// existing flow already consumes, and the /admin/invoices "⏰ Pending
// adjustments" banner (deferred-pending) shows it until it applies.
//
// HUMAN CHECKPOINT (building doctrine step 3): the credit lands on a DRAFT.
// Invoices generate on the 14th and send on the 15th — Adrian eyeballs every
// draft in that window, so an automated credit is always reviewed (and
// cancellable via the banner's ✕) before a parent sees it.
//
// IDEMPOTENCY: keyed on the payment reference (the Stripe checkout session
// id / HitPay payment id) exactly like the pass grant — one row per reference
// in Supabase `referral_invoice_credits` (payment_reference UNIQUE, service-
// role only). The claim row is inserted BEFORE the Airtable write; a webhook
// retry's insert hits the unique constraint and returns 'duplicate' without
// touching Airtable. If the Airtable write then fails, the claim is released
// so the reward isn't wedged, and the caller falls back to the original
// manual-action Telegram — a reward may degrade to manual, never vanish.
//
// Money rules (CLAUDE.md testing policy): all decisions here are pure
// functions with vitest coverage in referral-invoice-credit.test.ts; the
// service wrapper only fetches, claims, and patches.
import type { SupabaseClient } from '@supabase/supabase-js';
import { airtableRequest, airtableRequestAll } from './airtable';
import { MONTH_NAMES, sgtTodayISO } from './invoice-month';

/** The credit, SIGNED the way `Deferred Amount` stores it: negative = credit
 *  (docs/INVOICES.md field table). S$10 off the inviter's next invoice. */
export const REFERRAL_INVOICE_CREDIT_SGD = -10;

/** Supabase idempotency ledger (payment_reference UNIQUE). */
export const REFERRAL_CREDITS_TABLE = 'referral_invoice_credits';

/** Day of month the invoice generator fires (14th, 7am SGT cron). */
const GENERATION_DAY_OF_MONTH = 14;

// ── Pure logic ───────────────────────────────────────────────────────────────

/** `Deferred Note` = the line-item description parents see on the future
 *  invoice (the generator copies it verbatim), so it carries the friend's
 *  FIRST name only — never a payment id or full name. */
export function referralCreditNote(payerDisplayName: string | null | undefined): string {
  const first = (payerDisplayName || '').trim().split(/\s+/)[0];
  return `Referral reward — ${first || 'a friend'} joined the portal`;
}

/**
 * The `Deferred To Month` label (`Month YYYY`, matching getInvoiceMonth's
 * format exactly) for "the inviter's NEXT invoice" as of `now`:
 *   - SGT day 1–13  → next generator run is THIS month's 14th, which
 *     generates next month's invoices → next calendar month.
 *   - SGT day 14–31 → this month's run has (or may have — the cron fires 7am
 *     and can run late, so the whole 14th counts) already generated next
 *     month's invoices; a label the generator has already passed would sit in
 *     limbo forever, so target the month AFTER next. The credit lands one
 *     month later at worst; it can never be skipped.
 * Calendar arithmetic on SGT date parts only — server timezone irrelevant.
 */
export function deferredTargetMonthLabel(now: Date = new Date()): string {
  const [y, m, d] = sgtTodayISO(now.getTime()).split('-').map(Number);
  const monthsAhead = d >= GENERATION_DAY_OF_MONTH ? 2 : 1;
  const t = new Date(y, m - 1 + monthsAhead, 1); // local Date used for calendar math only
  return `${MONTH_NAMES[t.getMonth()]} ${t.getFullYear()}`;
}

/** Month labels to search for a carrier invoice: two months back through one
 *  month ahead of SGT-now — where any active student's "current" invoice
 *  lives (the next-month invoice exists once the 14th has passed). */
export function carrierMonthLabels(now: Date = new Date()): string[] {
  const [y, m] = sgtTodayISO(now.getTime()).split('-').map(Number);
  return [-2, -1, 0, 1].map((k) => {
    const t = new Date(y, m - 1 + k, 1);
    return `${MONTH_NAMES[t.getMonth()]} ${t.getFullYear()}`;
  });
}

/** The slice of an Invoices record the carrier pick reads. */
export interface CarrierCandidate {
  id: string;
  /** `Month` field, e.g. "September 2026". */
  month: string;
  status?: string;
  deferredAmount?: number | null;
  deferredApplied?: boolean;
}

/**
 * Choose which of the student's invoices carries the deferral. The 4 Deferred
 * fields are scalar — ONE unapplied deferral per record — so:
 *   - a record whose deferral is PENDING (amount set, not applied) is never
 *     touched (clobbering it would erase someone else's credit);
 *   - prefer a record with no deferral history at all, then one whose old
 *     deferral already applied (its fields are reset, `Deferred Applied`
 *     back to false, so the new credit applies fresh);
 *   - Voided invoices are a last resort (they still work as carriers — the
 *     generator only reads Student + the Deferred fields — but a live record
 *     is clearer in the banner);
 *   - within a tier, newest Month first; id breaks ties so concurrent racers
 *     deterministically pick the SAME record (double-write converges).
 * Null = no usable carrier (caller falls back to the manual Telegram).
 */
export function pickCarrierInvoice(rows: CarrierCandidate[]): CarrierCandidate | null {
  const usable = rows.filter((r) => !(r.deferredAmount && !r.deferredApplied));
  if (usable.length === 0) return null;
  const tier = (r: CarrierCandidate): number =>
    (r.deferredAmount ? 1 : 0) + (r.status === 'Voided' ? 2 : 0);
  const monthTime = (r: CarrierCandidate): number => {
    const t = Date.parse(`1 ${r.month || ''}`);
    return Number.isFinite(t) ? t : -Infinity;
  };
  return [...usable].sort(
    (a, b) => tier(a) - tier(b) || monthTime(b) - monthTime(a) || a.id.localeCompare(b.id),
  )[0];
}

/** The exact 4-field PATCH docs/INVOICES.md prescribes. `Deferred Applied`
 *  is written false explicitly so reusing an applied-history carrier re-arms
 *  it. Sign convention: negative = credit. */
export function buildDeferredAdjustmentFields(
  note: string,
  targetMonthLabel: string,
): Record<string, unknown> {
  return {
    'Deferred Amount': REFERRAL_INVOICE_CREDIT_SGD,
    'Deferred Note': note,
    'Deferred To Month': targetMonthLabel,
    'Deferred Applied': false,
  };
}

/** Receipt Telegram once the credit is written (the reward is DONE — this
 *  only tells Adrian where to see it in the 14th–15th draft review). */
export function creditReceiptMessage(opts: {
  payerName: string;
  inviterName: string;
  targetMonth: string;
}): string {
  return (
    `🎁 Referral: ${opts.payerName} paid — S$10 credit auto-applied to ${opts.inviterName}'s next invoice. ` +
    `It lands as a −S$10 line on the ${opts.targetMonth} draft (your 14th–15th review window; cancel anytime via the ⏰ banner on /admin/invoices).`
  );
}

/** The ORIGINAL manual-action Telegram, sent whenever the automatic write
 *  fails for any reason — the reward degrades to manual, never disappears. */
export function creditManualFallbackMessage(opts: {
  payerName: string;
  inviterName: string;
  reason: string;
}): string {
  return (
    `🎁 Referral converted: ${opts.payerName} paid for their first pass — invited by ${opts.inviterName} (tuition student). ` +
    `Auto-credit failed (${opts.reason}) — apply the −S$10 to ${opts.inviterName}'s next invoice manually (deferred adjustment or Invoice Assistant).`
  );
}

// ── Service ──────────────────────────────────────────────────────────────────

export type ReferralCreditOutcome =
  | { status: 'applied'; invoiceRecordId: string; targetMonth: string; note: string }
  /** This payment reference already earned its credit — retries stay silent. */
  | { status: 'duplicate' }
  /** Nothing was written; `reason` goes into the manual fallback Telegram. */
  | { status: 'failed'; reason: string };

export interface ReferralCreditArgs {
  /** portal_accounts.id of the tuition inviter earning the credit. */
  inviterAccountId: string;
  /** The inviter's Airtable Students recXXX (their invoices link to it). */
  inviterStudentRecId: string;
  payerAccountId: string;
  payerDisplayName: string | null | undefined;
  /** Stripe checkout session id / HitPay payment id — the idempotency key. */
  paymentReference: string;
  now?: Date;
}

/** Airtable calls injectable for tests. */
export interface AirtableDeps {
  requestAll: typeof airtableRequestAll;
  request: typeof airtableRequest;
}

type CreditsClient = Pick<SupabaseClient, 'from'>;

const isUniqueViolation = (err: { code?: string; message?: string }): boolean =>
  err.code === '23505' || /duplicate key/i.test(err.message || '');

/**
 * Write the −S$10 deferred adjustment for one paid referral. Never throws —
 * every failure returns `{ status: 'failed' }` so the caller can send the
 * manual fallback Telegram (and the payer's already-granted pass is never
 * disturbed). Order matters: claim the payment reference FIRST (unique
 * insert), write Airtable second, release the claim if the write fails.
 */
export async function applyReferralInvoiceCredit(
  svc: CreditsClient,
  args: ReferralCreditArgs,
  deps: AirtableDeps = { requestAll: airtableRequestAll, request: airtableRequest },
): Promise<ReferralCreditOutcome> {
  const reference = (args.paymentReference || '').trim();
  // A blank reference would make every unkeyed payment "the same payment" —
  // refuse to guess and let Adrian apply this one by hand.
  if (!reference) return { status: 'failed', reason: 'payment has no reference to key on' };

  const now = args.now ?? new Date();
  const targetMonth = deferredTargetMonthLabel(now);
  const note = referralCreditNote(args.payerDisplayName);

  let claimed = false;
  try {
    // Carrier hunt. Month labels never contain quotes (built from MONTH_NAMES),
    // so embedding them in the formula is safe. Student is a linked-record
    // field — filterByFormula can NOT match it by record id (the ARRAYJOIN
    // display-name trap, CLAUDE.md), so filter by Month and match the student
    // in JS, exactly like lib/additional-lessons.ts.
    const formula = `OR(${carrierMonthLabels(now)
      .map((l) => `{Month}='${l}'`)
      .join(',')})`;
    const fieldsQS = ['Student', 'Month', 'Status', 'Deferred Amount', 'Deferred Applied']
      .map((f) => `fields[]=${encodeURIComponent(f)}`)
      .join('&');
    const { records } = await deps.requestAll(
      'Invoices',
      `?filterByFormula=${encodeURIComponent(formula)}&${fieldsQS}`,
    );
    type InvoiceRow = { id: string; fields?: Record<string, unknown> };
    const candidates: CarrierCandidate[] = ((records || []) as InvoiceRow[])
      .filter((r) => (r.fields?.['Student'] as string[] | undefined)?.[0] === args.inviterStudentRecId)
      .map((r) => ({
        id: r.id,
        month: (r.fields?.['Month'] as string) || '',
        status: r.fields?.['Status'] as string | undefined,
        deferredAmount: r.fields?.['Deferred Amount'] as number | undefined,
        deferredApplied: Boolean(r.fields?.['Deferred Applied']),
      }));
    const carrier = pickCarrierInvoice(candidates);
    if (!carrier) {
      return {
        status: 'failed',
        reason: `no invoice free to carry it (checked ${carrierMonthLabels(now).join(', ')})`,
      };
    }

    // Claim the reference BEFORE writing — the unique constraint is the
    // retry gate, exactly like grantPass's (source, reference) dedupe.
    const { error: claimErr } = await svc.from(REFERRAL_CREDITS_TABLE).insert({
      payment_reference: reference,
      inviter_account_id: args.inviterAccountId,
      payer_account_id: args.payerAccountId,
      inviter_student_rec: args.inviterStudentRecId,
      amount_sgd: REFERRAL_INVOICE_CREDIT_SGD,
      target_month: targetMonth,
      invoice_record_id: carrier.id,
    });
    if (claimErr) {
      if (isUniqueViolation(claimErr)) return { status: 'duplicate' };
      return { status: 'failed', reason: `claim insert failed: ${claimErr.message}` };
    }
    claimed = true;

    await deps.request('Invoices', `/${carrier.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ fields: buildDeferredAdjustmentFields(note, targetMonth) }),
    });
    return { status: 'applied', invoiceRecordId: carrier.id, targetMonth, note };
  } catch (e) {
    if (claimed) {
      // Airtable write failed after the claim — release it so a later retry
      // (or manual re-fire) isn't wedged behind a claim with no adjustment.
      try {
        await svc.from(REFERRAL_CREDITS_TABLE).delete().eq('payment_reference', reference);
      } catch {
        // Claim release failed too: the manual fallback Telegram is already on
        // its way, so the human path covers it either way.
      }
    }
    return { status: 'failed', reason: (e as Error).message };
  }
}
