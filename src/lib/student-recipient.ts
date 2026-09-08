// Where does a message to ONE student go? (extracted from mark-triage, 8 Sep 2026)
//
// Portal first (the destination), Telegram as the doorbell, Airtable as the
// fallback for students with no portal account yet. Shared by the release
// notifications (mark-triage) and the Practice Again reminder cron so the
// two can never disagree about a student's channel.
import { getSupabaseAdmin } from './supabase';
import { airtableRequest } from './airtable';

export type Recipient = { chatId: number | string; via: 'portal' | 'telegram' } | null;

export async function resolveRecipient(studentId: string | null): Promise<Recipient> {
  if (!studentId) return null;

  // Stranger runs carry the acct:<uuid> portal identity
  // (lib/portal-auth.portalIdentity): their portal_accounts row is keyed by
  // that uuid — and there is no Airtable record to fall back to, so don't
  // fire a guaranteed-404 lookup at the Students table for them.
  const isStranger = studentId.startsWith('acct:');
  const { data } = await getSupabaseAdmin()
    .from('portal_accounts')
    .select('telegram_chat_id')
    .eq(isStranger ? 'id' : 'airtable_student_id', isStranger ? studentId.slice('acct:'.length) : studentId)
    .maybeSingle();
  if (data?.telegram_chat_id) return { chatId: data.telegram_chat_id, via: 'portal' };
  if (isStranger) return null; // web push (run.student_id) is their doorbell

  try {
    // Single-record GET ignores fields[] — fetch all and pick in JS.
    const student = await airtableRequest('Students', `/${studentId}`);
    const chatId = student?.fields?.['Student Telegram ID'];
    if (chatId) return { chatId: String(chatId), via: 'telegram' };
  } catch (err) {
    console.warn('[student-recipient] Airtable student lookup failed:', (err as Error).message);
  }
  return null;
}
