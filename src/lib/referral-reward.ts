// Referral rewards on a referred student's FIRST PAID pass (Adrian,
// 2026-08-29: "strangers → S$10 pass credit (automated); tuition students →
// S$5–10 voucher to the student (manual, ping-driven)").
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

/** S$10 of pass time at S$29 / 30 days ≈ 10.3 → 10 days. */
export const REFERRAL_REWARD_DAYS = 10;

export type RewardKind = 'pass_days' | 'voucher_ping';

/** Which reward an inviter earns. Tuition students (linked Airtable record —
 *  deactivated ex-students included, Adrian decides those by hand) get the
 *  voucher ping; self-serve inviters get automated pass days. */
export function rewardKindFor(inviter: { airtable_student_id?: string | null }): RewardKind {
  const rec = inviter.airtable_student_id;
  return rec && rec.trim() !== '' ? 'voucher_ping' : 'pass_days';
}

/**
 * Reward the payer's inviter, if any. Idempotent per payment: the pass-days
 * grant dedupes on (source 'referral', reference 'referral:<payment ref>'),
 * and callers only invoke on a NON-duplicate paid grant so webhook retries
 * never re-ping the voucher branch either.
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
    if (rewardKindFor(inviter) === 'voucher_ping') {
      await sendTelegram(
        `🎁 Referral converted: ${payerName} just paid for their first pass — invited by ${inviterName} (tuition student). ` +
          `Send ${inviterName} a S$5–10 voucher (Giftano / bubble tea) as the thank-you.`,
      );
    } else {
      const r = await grantPass({
        accountId: inviter.id,
        days: REFERRAL_REWARD_DAYS,
        source: 'referral',
        reference: `referral:${args.paymentReference}`,
      });
      if (!r.duplicate) {
        await sendTelegram(
          `🎁 Referral converted: ${payerName} paid — ${inviterName} auto-earned +${REFERRAL_REWARD_DAYS} days ` +
            `(S$10 of pass time; now expires ${r.expiresAt}).`,
        );
      }
    }
  } catch (e) {
    console.error('[referral-reward] failed (payer grant unaffected):', (e as Error).message);
  }
}
