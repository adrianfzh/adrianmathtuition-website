// ⏻ The per-account switches for the Mac slots (Adrian, 13 Sep 2026: "can you
// build me 3 toggles to on/off each one?"). Every marking or sheet slot spends
// ONE Claude account and knows which (its `account` sidecar or the keychain
// login); before claiming anything it asks the site whether that account is
// switched on. One Airtable `Settings` row, `slot_accounts`, holds a JSON map
// keyed the way the workers key their plan-limit files — the email lowercased
// with every run of non-alphanumerics turned into "-" — so the worker and the
// site can never disagree about which switch is whose.
//
// Fail OPEN: an account with no entry is on, an unreadable row is "all on",
// and a worker that cannot reach the site claims as before. A switch stops NEW
// claims only; a paper or sheet already in progress finishes.
//
// 🎯 22 Sep 2026: the slots no longer own an account each. Every slot (Fly worker
// and Mac) holds all three CLI logins and asks the picker (bot
// scripts/claude-pick.sh) for the emptiest one before each job, reading each
// account's 5-hour and 7-day utilisation from the CLI's usage endpoint. The
// picker posts what it read here (`POST {usage}`), kept in a second Settings row
// `slot_usage`, so the card shows the three meters. A switch OFF now means "the
// picker never picks this account".
// Pure; tested. The Airtable I/O lives in slot-accounts-store.ts.

export const SLOT_ACCOUNTS_SETTING = 'slot_accounts';
export const SLOT_USAGE_SETTING = 'slot_usage';

export interface SlotAccount {
  email: string;
  /** Where its slots run — shown beside the switch. */
  label: string;
}

/** The accounts Adrian's slots spend, in the order the card lists them. Add a line when a group is added. */
export const SLOT_ACCOUNTS: readonly SlotAccount[] = [
  { email: 'adrianmathtuition@gmail.com', label: 'login 1 · every machine, picked by usage before each job' },
  { email: 'ablnon@gmail.com', label: 'login 2 · every machine, picked by usage before each job' },
  { email: 'ablnon@hotmail.com', label: 'login 3 · every machine, picked by usage before each job' },
];

/** The workers' key for an account: `ablnon@gmail.com` → `ablnon-gmail-com`. */
export function accountKey(email: string): string {
  const k = String(email ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return k || 'default';
}

export interface SlotAccountState { on: boolean; at: string | null; by: string | null }
export type SlotAccountMap = Record<string, SlotAccountState>;

/** The Airtable Value string → the map. Anything unreadable = an empty map = everything on. */
export function parseSlotAccounts(value: unknown): SlotAccountMap {
  try {
    const o = JSON.parse(String(value ?? '{}')) as Record<string, unknown>;
    const out: SlotAccountMap = {};
    for (const [k, v] of Object.entries(o)) {
      if (!v || typeof v !== 'object') continue;
      const s = v as Record<string, unknown>;
      out[accountKey(k)] = {
        on: s.on !== false,
        at: typeof s.at === 'string' ? s.at : null,
        by: typeof s.by === 'string' ? s.by : null,
      };
    }
    return out;
  } catch {
    return {};
  }
}

/** Is this account's group allowed to claim? Absent = on. */
export function isSlotAccountOn(map: SlotAccountMap, email: string): boolean {
  const s = map[accountKey(email)];
  return s ? s.on : true;
}

/** The keys that are OFF — what the workers read (`off` in the route's answer). */
export function offKeys(map: SlotAccountMap): string[] {
  return Object.entries(map).filter(([, s]) => !s.on).map(([k]) => k).sort();
}

/** Flip one account; the rest of the map is kept as it was. */
export function withSlotAccount(map: SlotAccountMap, email: string, on: boolean, by: string, at = new Date().toISOString()): SlotAccountMap {
  return { ...map, [accountKey(email)]: { on, at, by } };
}

/** What the picker read from the CLI's usage endpoint for one account — percentages. */
export interface SlotUsage {
  five_hour: number | null;
  seven_day: number | null;
  /** ISO instants the two windows reset, when the endpoint gave them. */
  resets_5h: string | null;
  resets_7d: string | null;
  /** When it was read, and which machine read it. */
  at: string;
  from: string | null;
}
export type SlotUsageMap = Record<string, SlotUsage>;

function pct(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n * 10) / 10)) : null;
}
function str(v: unknown): string | null { return typeof v === 'string' && v ? v : null; }

/** One posted/stored usage object → a SlotUsage, or null when it carries no meter at all. */
export function parseSlotUsageEntry(v: unknown, at = new Date().toISOString()): SlotUsage | null {
  if (!v || typeof v !== 'object') return null;
  const s = v as Record<string, unknown>;
  const u: SlotUsage = {
    five_hour: pct(s.five_hour ?? s.h5),
    seven_day: pct(s.seven_day ?? s.d7),
    resets_5h: str(s.resets_5h ?? s.resets5),
    resets_7d: str(s.resets_7d ?? s.resets7),
    at: str(s.at) ?? at,
    from: str(s.from),
  };
  return u.five_hour === null && u.seven_day === null ? null : u;
}

/** The `slot_usage` row's Value → the map. Unreadable = empty. */
export function parseSlotUsage(value: unknown): SlotUsageMap {
  try {
    const o = JSON.parse(String(value ?? '{}')) as Record<string, unknown>;
    const out: SlotUsageMap = {};
    for (const [k, v] of Object.entries(o)) {
      const u = parseSlotUsageEntry(v);
      if (u) out[accountKey(k)] = u;
    }
    return out;
  } catch {
    return {};
  }
}

/** Merge a picker's post into the map — only accounts it named change; a reading older than what is stored is ignored. */
export function withSlotUsage(map: SlotUsageMap, posted: unknown, at = new Date().toISOString()): SlotUsageMap {
  if (!posted || typeof posted !== 'object') return map;
  const out: SlotUsageMap = { ...map };
  for (const [k, v] of Object.entries(posted as Record<string, unknown>)) {
    const u = parseSlotUsageEntry(v, at);
    if (!u) continue;
    const key = accountKey(k);
    const cur = out[key];
    if (cur && Date.parse(cur.at) > Date.parse(u.at)) continue;
    out[key] = u;
  }
  return out;
}

/** A reading older than this is shown greyed as stale (the picker refreshes every job; slots idle at night). */
export const SLOT_USAGE_STALE_MS = 6 * 3600_000;

export type SlotAccountRow = SlotAccount & SlotAccountState & { key: string; usage: SlotUsage | null };

/** The card's rows: every known account with its current state and its last usage reading. */
export function slotAccountRows(map: SlotAccountMap, usage: SlotUsageMap = {}): SlotAccountRow[] {
  return SLOT_ACCOUNTS.map(a => {
    const key = accountKey(a.email);
    const s = map[key] ?? { on: true, at: null, by: null };
    return { ...a, key, ...s, usage: usage[key] ?? null };
  });
}
