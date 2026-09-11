// The marking switches — Airtable `Settings` rows flipped from /admin/mark-paper,
// live within half a minute, no deploy.
//
// 🖥 "Mac plan only" (Adrian, 11 Sep 2026: "a toggle on /admin/mark-paper that
// allow me to toggle mac plan only for marking (so no api, batch or full)").
// ON: the Fly worker marks nothing itself — no full-price API run, no batch
// lane, no takeover of a stalled Mac claim. Every queued paper waits for a
// plan-billed Mac slot (⚡ Mark now and ☁️ Batch now rows included — they become
// ordinary Mac candidates). The worker still ASSEMBLES what the Mac hands back
// (that is drawing, not marking). OFF: the normal split — the Mac gets a head
// start, the worker takes what it does not.
//
// 🧪 "Science tab open to students" (Adrian, 11 Sep 2026: "don't open it yet.
// i will see test through student portal myself first. just keep things ready
// so that we can release at the moment's notice"). ON: every signed-in student
// sees the Math | Science switcher and may hand in physics / chemistry /
// biology papers (lib/portal-beta.ts scienceMarkingOpen). OFF: the tab is
// Adrian's admin preview only. A row, not a code flag, so the release is a tap.
//
// Both rows live where the auto-release switch lives (lib/auto-release-setting.ts):
// one Airtable `Settings` row each, Setting Name = the constant, Value = JSON
// {on, by, at, note} — the bot reads `marking_mac_only` on every queue tick
// (bot lib/marking-settings.js, 20 s cache).
import { airtableRequest } from '@/lib/airtable';

export const MAC_ONLY_SETTING = 'marking_mac_only';
export const SCIENCE_OPEN_SETTING = 'science_marking_open';
const TTL_MS = 30_000;

export type MarkingSwitch = { on: boolean; by: string | null; at: string | null; note: string | null };
/** The Mac-only row's shape — the same shape every switch here uses. */
export type MacOnlySetting = MarkingSwitch;

/** Pure: the Airtable Value string → the switch. Anything unreadable = OFF. */
export function parseMarkingSwitch(value: unknown): MarkingSwitch {
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
export const parseMacOnlySetting = parseMarkingSwitch;

const cache = new Map<string, { at: number; value: MarkingSwitch; id: string | null }>();

async function fetchRow(name: string): Promise<{ id: string | null; value: MarkingSwitch }> {
  const data = await airtableRequest('Settings', `?filterByFormula=${encodeURIComponent(`{Setting Name}='${name}'`)}&maxRecords=1`);
  const rec = (data as { records?: { id: string; fields: Record<string, unknown> }[] }).records?.[0];
  return { id: rec?.id ?? null, value: parseMarkingSwitch(rec?.fields?.Value) };
}

export async function getMarkingSwitch(name: string, fresh = false): Promise<MarkingSwitch> {
  const hit = cache.get(name);
  if (!fresh && hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const row = await fetchRow(name);
  cache.set(name, { at: Date.now(), value: row.value, id: row.id });
  return row.value;
}

export async function setMarkingSwitch(name: string, on: boolean, by: string, note?: string): Promise<MarkingSwitch> {
  const value: MarkingSwitch = { on, by, at: new Date().toISOString(), note: note ?? null };
  const json = JSON.stringify(value);
  const row = await fetchRow(name);
  if (row.id) await airtableRequest('Settings', `/${row.id}`, { method: 'PATCH', body: JSON.stringify({ fields: { Value: json } }) });
  else await airtableRequest('Settings', '', { method: 'POST', body: JSON.stringify({ fields: { 'Setting Name': name, Value: json } }) });
  cache.set(name, { at: Date.now(), value, id: row.id });
  return value;
}

// ── the two switches, by name ────────────────────────────────────────────────
export const getMacOnlySetting = (fresh = false) => getMarkingSwitch(MAC_ONLY_SETTING, fresh);
export const setMacOnly = (on: boolean, by: string, note?: string) => setMarkingSwitch(MAC_ONLY_SETTING, on, by, note);
export const getScienceOpenSetting = (fresh = false) => getMarkingSwitch(SCIENCE_OPEN_SETTING, fresh);
export const setScienceOpen = (on: boolean, by: string, note?: string) => setMarkingSwitch(SCIENCE_OPEN_SETTING, on, by, note);
