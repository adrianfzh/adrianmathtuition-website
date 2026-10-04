// Single-use invite links, atomically (5 Oct 2026, Adrian: "fix the leaked invite link").
//
// Before: /api/portal/activate checked "not yet used", created the account, and
// only then marked the link used — two people pressing Create at the same moment
// both passed the check and got two accounts on one student. Now the link is
// CLAIMED first with one conditional UPDATE (… WHERE consumed_at IS NULL AND not
// expired). Postgres runs the two updates one after the other on the same row; the
// second finds consumed_at already set and changes nothing, so only the first
// caller gets the row back. A failed account creation hands the claim back.
import type { SupabaseClient } from '@supabase/supabase-js';

export interface InviteRow { token: string; airtable_student_id: string; email: string; expires_at: string; consumed_at: string | null }

/** Claim the link for this request. The row when this caller won; null when it was used, expired or unknown. */
export async function claimInvite(sb: SupabaseClient, token: string, nowIso = new Date().toISOString()): Promise<InviteRow | null> {
  const { data, error } = await sb.from('portal_invite_tokens')
    .update({ consumed_at: nowIso })
    .eq('token', token)
    .is('consumed_at', null)
    .gt('expires_at', nowIso)
    .select('*');
  if (error) throw new Error(error.message);
  const rows = (data || []) as InviteRow[];
  return rows.length === 1 ? rows[0] : null;
}

/** Hand a claim back after the account could not be made (only our own claim, never someone else's). */
export async function releaseInvite(sb: SupabaseClient, token: string, claimedAtIso: string): Promise<void> {
  await sb.from('portal_invite_tokens').update({ consumed_at: null })
    .eq('token', token).eq('consumed_at', claimedAtIso).is('consumed_by_user_id', null);
}

/** Record who the link made. */
export async function finishInvite(sb: SupabaseClient, token: string, userId: string): Promise<void> {
  await sb.from('portal_invite_tokens').update({ consumed_by_user_id: userId }).eq('token', token);
}
