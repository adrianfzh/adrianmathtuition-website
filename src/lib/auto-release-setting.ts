// lib/auto-release-setting.ts — the auto-release switch as a SETTING, not a line
// of code (8 Sep 2026). Airtable `Settings` row `auto_release_paused`, JSON
// Value {"paused": true|false, "by", "at"}. Read with a short cache so the
// release path costs no Airtable call per paper; written from the desk header.
// Default when the row is missing: NOT paused — Adrian's decision of 8 Sep 2026
// ("can we automate the release of the marking and the practice again without
// my vetting? … build all"). The old code constant (paused since 29 Aug) is gone.
import { airtableRequest } from '@/lib/airtable';

export const SETTING_NAME = 'auto_release_paused';
const TTL_MS = 60_000;

export type AutoReleaseSetting = { paused: boolean; by: string | null; at: string | null; note: string | null };

/** Pure: the Airtable Value string → the setting. Anything unreadable = not paused. */
export function parseAutoReleaseSetting(value: unknown): AutoReleaseSetting {
  try {
    const o = JSON.parse(String(value ?? '{}')) as Record<string, unknown>;
    return { paused: o.paused === true, by: typeof o.by === 'string' ? o.by : null, at: typeof o.at === 'string' ? o.at : null, note: typeof o.note === 'string' ? o.note : null };
  } catch { return { paused: false, by: null, at: null, note: null }; }
}

let cache: { at: number; value: AutoReleaseSetting; id: string | null } | null = null;

async function fetchRow(): Promise<{ id: string | null; value: AutoReleaseSetting }> {
  const data = await airtableRequest('Settings', `?filterByFormula=${encodeURIComponent(`{Setting Name}='${SETTING_NAME}'`)}&maxRecords=1`);
  const rec = (data as { records?: { id: string; fields: Record<string, unknown> }[] }).records?.[0];
  return { id: rec?.id ?? null, value: parseAutoReleaseSetting(rec?.fields?.Value) };
}

export async function getAutoReleaseSetting(fresh = false): Promise<AutoReleaseSetting> {
  if (!fresh && cache && Date.now() - cache.at < TTL_MS) return cache.value;
  try {
    const row = await fetchRow();
    cache = { at: Date.now(), value: row.value, id: row.id };
    return row.value;
  } catch (e) {
    // Fail-safe in the SAFE direction: an unreadable setting pauses auto-release.
    console.warn('[auto-release] setting unreadable — treating as paused:', (e as Error).message);
    return { paused: true, by: null, at: null, note: 'setting unreadable' };
  }
}

export async function isAutoReleasePaused(): Promise<boolean> { return (await getAutoReleaseSetting()).paused; }

export async function setAutoReleasePaused(paused: boolean, by: string, note?: string): Promise<AutoReleaseSetting> {
  const value: AutoReleaseSetting = { paused, by, at: new Date().toISOString(), note: note ?? null };
  const json = JSON.stringify(value);
  const row = await fetchRow();
  if (row.id) await airtableRequest('Settings', `/${row.id}`, { method: 'PATCH', body: JSON.stringify({ fields: { Value: json } }) });
  else await airtableRequest('Settings', '', { method: 'POST', body: JSON.stringify({ fields: { 'Setting Name': SETTING_NAME, Value: json } }) });
  cache = { at: Date.now(), value, id: row.id };
  return value;
}
