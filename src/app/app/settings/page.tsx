// /app/settings — server wrapper: loads the account, hands plain fields to the
// interactive client component.
import { currentAccount } from '@/lib/portal-auth';
import { ensureTelegramLinked } from '@/lib/telegram-link-state';
import SettingsClient from './SettingsClient';
import { suggestionsOpen } from '@/lib/portal-beta';
import { privacyUpdatedTag } from '@/lib/portal-consent';
import { sgtTodayISO } from '@/lib/sgt';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const account = await currentAccount();
  const [tg, suggest] = await Promise.all([ensureTelegramLinked(account), suggestionsOpen().catch(() => false)]);
  return (
    <SettingsClient
      email={account.email}
      displayName={account.display_name || ''}
      level={account.level || ''}
      telegramChatId={account.telegram_chat_id ? String(account.telegram_chat_id) : ''}
      telegramLinked={tg === 'linked'}
      tuition={Boolean(account.airtable_student_id?.trim())}
      showSuggestions={suggest}
      privacyTag={privacyUpdatedTag(sgtTodayISO())}
    />
  );
}
