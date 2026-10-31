// Server half of the Notebook app backup (lib/app-notebooks.ts has the model): who may use it.
import { NextResponse } from 'next/server';
import { bearerAccount, portalIdentity, type PortalAccount } from './portal-auth';
import { APP_NOTEBOOK_BACKUP_OPEN_TO_STUDENTS, APP_NOTEBOOK_BACKUP_PREVIEW_IDENTITIES } from './portal-beta';

export type BackupCaller = { ok: true; account: PortalAccount; identity: string } | { ok: false; res: NextResponse };

/** The signed-in app user, if backup is open to them. Anonymous → 401 (the health check probes it). */
export async function backupCaller(req: Request): Promise<BackupCaller> {
  const account = await bearerAccount(req);
  if (!account) return { ok: false, res: NextResponse.json({ error: 'Please sign in again.' }, { status: 401 }) };
  const identity = portalIdentity(account);
  if (!APP_NOTEBOOK_BACKUP_OPEN_TO_STUDENTS && !APP_NOTEBOOK_BACKUP_PREVIEW_IDENTITIES.includes(identity)) {
    return { ok: false, res: NextResponse.json({ error: 'Backup isn’t open yet.' }, { status: 403 }) };
  }
  return { ok: true, account, identity };
}
