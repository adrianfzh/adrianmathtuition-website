// 🖥 "Mac plan only" — the marking queue's spend switch (Adrian, 11 Sep 2026:
// "a toggle on /admin/mark-paper that allow me to toggle mac plan only for
// marking (so no api, batch or full)").
//
// ON: the Fly worker marks nothing itself — no full-price API run, no batch
// lane, no takeover of a stalled Mac claim. Every queued paper waits for a
// plan-billed Mac slot (⚡ Mark now and ☁️ Batch now rows included — they become
// ordinary Mac candidates). The worker still ASSEMBLES what the Mac hands back
// (that is drawing, not marking). OFF: the normal split — the Mac gets a head
// start, the worker takes what it does not.
//
// Stored where the auto-release switch lives (lib/auto-release-setting.ts):
// one Airtable `Settings` row, Setting Name = marking_mac_only, Value = JSON —
// so the bot reads the very same row on every tick (bot lib/marking-settings.js,
// 20 s cache) and a flip here is live within half a minute, no deploy.
import { airtableRequest } from '@/lib/airtable';

export const MAC_ONLY_SETTING = 'marking_mac_only';
const TTL_MS = 30_000;

export type MacOnlySetting = { on: boolean; by: string | null; at: string | null; note: string | null };

/** Pure: the Airtable Value string → the setting. Anything unreadable = OFF (the normal split). */
export function parseMacOnlySetting(value: unknown): MacOnlySetting {
  try {
    const o = JSON.parse(String(value ?? '{}')) as Record<string, unknown>;
    return {
      on: o.on === true,
      by: typeof o.by === 'string' ? o.by : null,
      at: typeof o.at === 'string' ? o.at : null,
      note: typeof o.note === 'string' ? o.note : null,
    };
  } catch {
    return { on: false, by: null, at: null, note: null };
  }
}

let cache: { at: number; value: MacOnlySetting; id: string | null } | null = null;

async function fetchRow(): Promise<{ id: string | null; value: MacOnlySetting }> {
  const data = await airtableRequest('Settings', `?filterByFormula=${encodeURIComponent(`{Setting Name}='${MAC_ONLY_SETTING}'`)}&maxRecords=1`);
  const rec = (data as { records?: { id: string; fields: Record<string, unknown> }[] }).records?.[0];
  return { id: rec?.id ?? null, value: parseMacOnlySetting(rec?.fields?.Value) };
}

export async function getMacOnlySetting(fresh = false): Promise<MacOnlySetting> {
  if (!fresh && cache && Date.now() - cache.at < TTL_MS) return cache.value;
  const row = await fetchRow();
  cache = { at: Date.now(), value: row.value, id: row.id };
  return row.value;
}

export async function setMacOnly(on: boolean, by: string, note?: string): Promise<MacOnlySetting> {
  const value: MacOnlySetting = { on, by, at: new Date().toISOString(), note: note ?? null };
  const json = JSON.stringify(value);
  const row = await fetchRow();
  if (row.id) await airtableRequest('Settings', `/${row.id}`, { method: 'PATCH', body: JSON.stringify({ fields: { Value: json } }) });
  else await airtableRequest('Settings', '', { method: 'POST', body: JSON.stringify({ fields: { 'Setting Name': MAC_ONLY_SETTING, Value: json } }) });
  cache = { at: Date.now(), value, id: row.id };
  return value;
}
