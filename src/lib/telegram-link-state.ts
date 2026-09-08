// Is this account reachable on Telegram? Server-only; feeds the Home nudge and
// the Settings card (in-app Telegram linking, 8 Sep 2026).
//
// Two stores can hold the link: portal_accounts.telegram_chat_id (what the app
// sets) and Airtable `Student Telegram ID` (what the bot's /register set,
// often years before the account existed). lib/student-recipient already
// reads both when SENDING; this helper makes the app's own picture match by
// copying an Airtable id into the account once — so a student who linked the
// bot long ago never sees a "Link Telegram" card. 'unknown' (Airtable down)
// hides the nudge rather than nagging someone who may already be linked.
import { cache } from 'react';
import { airtableRequest } from '@/lib/airtable';
import { createServiceClient } from '@/lib/supabase-server';
import type { PortalAccount } from '@/lib/portal-auth';

export type TelegramLinkState = 'linked' | 'unlinked' | 'unknown';

export const ensureTelegramLinked = cache(async (
  account: Pick<PortalAccount, 'id' | 'airtable_student_id' | 'telegram_chat_id'>,
): Promise<TelegramLinkState> => {
  if (account.telegram_chat_id) return 'linked';
  const rec = account.airtable_student_id;
  if (!rec || !rec.startsWith('rec')) return 'unlinked';
  try {
    const student = await airtableRequest('Students', `/${rec}`);
    const raw = String(student?.fields?.['Student Telegram ID'] ?? '').trim();
    if (!/^\d{5,15}$/.test(raw)) return 'unlinked';
    await createServiceClient().from('portal_accounts')
      .update({ telegram_chat_id: Number(raw) })
      .eq('id', account.id).is('telegram_chat_id', null);
    return 'linked';
  } catch {
    return 'unknown';
  }
});
