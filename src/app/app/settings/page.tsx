// /app/settings — server wrapper: loads the account, hands plain fields to the
// interactive client component.
import { currentAccount } from '@/lib/portal-auth';
import { ensureTelegramLinked } from '@/lib/telegram-link-state';
import { askSignalOn } from '@/lib/ask-signal';
import { examCountdownOn, saveAnswersOn } from '@/lib/portal-prefs';
import SettingsClient from './SettingsClient';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const account = await currentAccount();
  const tg = await ensureTelegramLinked(account);
  return (
    <SettingsClient
      email={account.email}
      displayName={account.display_name || ''}
      level={account.level || ''}
      telegramChatId={account.telegram_chat_id ? String(account.telegram_chat_id) : ''}
      telegramLinked={tg === 'linked'}
      askSignal={askSignalOn(account.prefs)}
      examCountdown={examCountdownOn(account.prefs)}
      saveAnswers={saveAnswersOn(account.prefs)}
    />
  );
}
