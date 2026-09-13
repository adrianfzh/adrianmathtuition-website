// The Airtable side of the slot-account switches (lib/slot-accounts.ts): one
// `Settings` row, Setting Name = slot_accounts, Value = the JSON map. Same home
// as the other marking switches (lib/marking-settings.ts), 30 s cache.
import { airtableRequest } from '@/lib/airtable';
import { SLOT_ACCOUNTS_SETTING, parseSlotAccounts, withSlotAccount, type SlotAccountMap } from './slot-accounts';

const TTL_MS = 30_000;
let cache: { at: number; map: SlotAccountMap; id: string | null } | null = null;

async function fetchRow(): Promise<{ id: string | null; map: SlotAccountMap }> {
  const data = await airtableRequest('Settings', `?filterByFormula=${encodeURIComponent(`{Setting Name}='${SLOT_ACCOUNTS_SETTING}'`)}&maxRecords=1`);
  const rec = (data as { records?: { id: string; fields: Record<string, unknown> }[] }).records?.[0];
  return { id: rec?.id ?? null, map: parseSlotAccounts(rec?.fields?.Value) };
}

export async function getSlotAccounts(fresh = false): Promise<SlotAccountMap> {
  if (!fresh && cache && Date.now() - cache.at < TTL_MS) return cache.map;
  const row = await fetchRow();
  cache = { at: Date.now(), map: row.map, id: row.id };
  return row.map;
}

export async function setSlotAccount(email: string, on: boolean, by: string): Promise<SlotAccountMap> {
  const row = await fetchRow();
  const map = withSlotAccount(row.map, email, on, by);
  const json = JSON.stringify(map);
  if (row.id) await airtableRequest('Settings', `/${row.id}`, { method: 'PATCH', body: JSON.stringify({ fields: { Value: json } }) });
  else await airtableRequest('Settings', '', { method: 'POST', body: JSON.stringify({ fields: { 'Setting Name': SLOT_ACCOUNTS_SETTING, Value: json } }) });
  cache = { at: Date.now(), map, id: row.id };
  return map;
}
