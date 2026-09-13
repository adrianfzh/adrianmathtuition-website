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
// Pure; tested. The Airtable I/O lives in slot-accounts-store.ts.

export const SLOT_ACCOUNTS_SETTING = 'slot_accounts';

export interface SlotAccount {
  email: string;
  /** Where its slots run — shown beside the switch. */
  label: string;
}

/** The accounts Adrian's slots spend, in the order the card lists them. Add a line when a group is added. */
export const SLOT_ACCOUNTS: readonly SlotAccount[] = [
  { email: 'adrianmathtuition@gmail.com', label: 'Main Mac · marking 1–3 · sheets 1–3' },
  { email: 'ablnon@gmail.com', label: 'Main Mac · marking 4–6 · sheets 4–6' },
  { email: 'ablnon@hotmail.com', label: 'MacBook Air · marking 1–3 · sheets 1–3' },
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

/** The card's rows: every known account with its current state. */
export function slotAccountRows(map: SlotAccountMap): (SlotAccount & SlotAccountState & { key: string })[] {
  return SLOT_ACCOUNTS.map(a => {
    const key = accountKey(a.email);
    const s = map[key] ?? { on: true, at: null, by: null };
    return { ...a, key, ...s };
  });
}
