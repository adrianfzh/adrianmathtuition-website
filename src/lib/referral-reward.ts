// Referral rewards on a referred student's paid pass (Adrian, 2026-08-29:
// "strangers → S$10 pass credit (automated)"; 2026-09-02: "tuition students →
// −S$10 off the next invoice, applied AUTOMATICALLY as a deferred adjustment,
// Telegram demoted to a receipt" — supersedes the 08-29 voucher-ping wording).
//
// Why payment-triggered, never signup-triggered: signup rewards get farmed,
// and — Adrian's explicit rule — a current student forwarding to a current
// student must earn nothing. That rule holds structurally here: tuition
// accounts never buy passes, so a current-student invitee can never be the
// payer that trips this. The one theoretical dodge (a current student minting
// a burner stranger account and PAYING S$29 to earn their friend S$10) costs
// the farmer 3× the reward.
//
// Called by BOTH payment webhooks after a non-duplicate paid grant, always
// fail-soft: a reward hiccup must never disturb the payer's pass.
import type { SupabaseClient } from '@supabase/supabase-js';
import { grantPass } from './portal-passes';
import { sendTelegram } from './telegram';
// Every notification from this file belongs in the students topic (6 Sept 2026; falls back to the DM when unbound).
const notify_students = (text: string) => sendTelegram(text, 'students');
import {
  applyReferralInvoiceCredit,
  creditManualFallbackMessage,
  creditReceiptMessage,
} from './referral-invoice-credit';

/** S$10 of pass time at S$29 / 30 days ≈ 10.3 → 10 days. */
export const REFERRAL_REWARD_DAYS = 10;

export type RewardKind = 'pass_days' | 'invoice_credit';

/** Which reward an inviter earns. Tuition students (linked Airtable record —
 *  deactivated ex-students included, Adrian decides those by hand) get the
 *  automatic −S$10 deferred invoice credit; self-serve inviters get automated
 *  pass days. */
export function rewardKindFor(inviter: { airtable_student_id?: string | null }): RewardKind {
  const rec = inviter.airtable_student_id;
  return rec && rec.trim() !== '' ? 'invoice_credit' : 'pass_days';
}

/**
 * Reward the payer's inviter, if any. Idempotent per payment, keyed on the
 * payment reference both ways: the pass-days grant dedupes on (source
 * 'referral', reference 'referral:<payment ref>') in portal_passes, and the
 * invoice credit dedupes on the same reference in referral_invoice_credits —
 * so even though callers only invoke on a NON-duplicate paid grant, a racing
 * webhook retry can never write either reward twice.
 */
export async function rewardInviterForPaidPass(
  svc: SupabaseClient,
  args: { payerAccountId: string; paymentReference: string },
): Promise<void> {
  try {
    const { data: payer } = await svc
      .from('portal_accounts')
      .select('id, display_name, invited_by')
      .eq('id', args.payerAccountId)
      .maybeSingle();
    const inviterId = payer?.invited_by;
    if (!inviterId) return;
    const { data: inviter } = await svc
      .from('portal_accounts')
      .select('id, display_name, airtable_student_id')
      .eq('id', inviterId)
      .maybeSingle();
    if (!inviter) return;

    const payerName = payer?.display_name || 'a new student';
    const inviterName = inviter.display_name || 'a student';
    if (rewardKindFor(inviter) === 'invoice_credit') {
      // Tuition inviter: −S$10 deferred adjustment onto their next invoice
      // (docs/INVOICES.md mechanism; Adrian reviews the draft 14th–15th).
      // applyReferralInvoiceCredit never throws — on any failure the reward
      // falls back to the ORIGINAL manual-action Telegram so it can degrade
      // to manual but never be silently lost.
      const credit = await applyReferralInvoiceCredit(svc, {
        inviterAccountId: inviter.id,
        inviterStudentRecId: (inviter.airtable_student_id || '').trim(),
        payerAccountId: args.payerAccountId,
        payerDisplayName: payer?.display_name,
        paymentReference: args.paymentReference,
      });
      if (credit.status === 'applied') {
        await notify_students(
          creditReceiptMessage({ payerName, inviterName, targetMonth: credit.targetMonth }),
        );
      } else if (credit.status === 'failed') {
        console.error(`[referral-reward] invoice credit failed: ${credit.reason}`);
        await notify_students(
          creditManualFallbackMessage({ payerName, inviterName, reason: credit.reason }),
        );
      }
      // 'duplicate' → a retry of an already-rewarded payment: stay silent,
      // mirroring the pass-days branch below.
    } else {
      const r = await grantPass({
        accountId: inviter.id,
        days: REFERRAL_REWARD_DAYS,
        source: 'referral',
        reference: `referral:${args.paymentReference}`,
      });
      if (!r.duplicate) {
        await notify_students(
          `🎁 Referral converted: ${payerName} paid — ${inviterName} auto-earned +${REFERRAL_REWARD_DAYS} days ` +
            `(S$10 of pass time; now expires ${r.expiresAt}).`,
        );
      }
    }
  } catch (e) {
    console.error('[referral-reward] failed (payer grant unaffected):', (e as Error).message);
  }
}
