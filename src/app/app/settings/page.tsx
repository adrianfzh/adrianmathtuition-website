// /app/settings — server wrapper: loads the account, hands plain fields to the
// interactive client component.
import { currentAccount } from '@/lib/portal-auth';
import SettingsClient from './SettingsClient';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const account = await currentAccount();
  return (
    <SettingsClient
      email={account.email}
      displayName={account.display_name || ''}
      level={account.level || ''}
      telegramChatId={account.telegram_chat_id ? String(account.telegram_chat_id) : ''}
    />
  );
}
