// 🔑 A dead marking login must be impossible to miss (20 Oct 2026).
//
// What happened: four papers sat queued from 5:59 pm to past 8:30 pm. Marking runs only on the
// Fly worker with three pooled Claude logins. Logins 1 and 2 were switched off on /admin/switches;
// login 3 was on, but its sign-in had reached its end date (the refresh token's hard expiry) at
// 3:31 pm. The picker dropped it silently, the card still said "on", nobody told Adrian.
//
// Three pure pieces, used by the card, the desk / mark-paper rows and the
// /api/cron/marking-stall alarm (every 10 min):
//   loginHealth   — per login: on/off (his switch) AND can the worker use it
//                   (needs sign-in / full until … / ready), plus the day its sign-in ends
//   poolStall     — no login usable → the reason in plain words
//   signinWarnings— one Telegram line ~24 h and again ~2 h before a login's sign-in ends
//   stallDecision — papers waiting > 30 min with no usable login (or nothing marking) →
//                   ONE line per stall, again only if still stuck 2 h later
// Fail open: a login with no reading at all counts as usable (the card says "no reading").
import type { SlotAccountRow } from './slot-accounts';

export const FULL_AT = 98;                        // the picker's own "full" line (claude-pick.sh)
export const STALL_AFTER_MS = 30 * 60_000;
export const STALL_REPEAT_MS = 2 * 3600_000;
export const WARN_DAY_MS = 24 * 3600_000;
export const WARN_HOURS_MS = 2 * 3600_000;
/** A year-long key is warned a week ahead too (20 Oct 2026). */
export const WARN_WEEK_MS = 7 * 24 * 3600_000;
export const SITE = 'https://www.adrianmathtuition.com';

export type LoginState = 'ready' | 'off' | 'needs' | 'renewing' | 'full' | 'unknown';
export interface LoginHealth {
  key: string;
  email: string;
  /** "1", "2", "3" — the worker's folder; the card's order when the picker has not said. */
  login: string;
  on: boolean;
  /** Can the worker mark with it right now (switch on, signed in, not full)? */
  usable: boolean;
  /** What the worker can do with it, ignoring the switch. */
  worker: Exclude<LoginState, 'off'>;
  /** One short phrase for the card: "needs sign-in", "full until Thu 22 Oct, 9:00 am", "ready". */
  text: string;
  fullUntil: string | null;
  signinEnds: string | null;
  /** 🗝 'key' = a year-long key (no meters; rests after a plan-limit message). */
  kind: 'login' | 'key';
}

/** "Thu 22 Oct, 12:40 pm" in Singapore time. */
export function sgtWhen(iso: string | number): string {
  const d = new Date((typeof iso === 'number' ? iso : Date.parse(iso)) + 8 * 3600_000);
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()];
  const mo = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()];
  const h = d.getUTCHours(); const m = String(d.getUTCMinutes()).padStart(2, '0');
  return `${wd} ${d.getUTCDate()} ${mo}, ${h % 12 || 12}:${m} ${h < 12 ? 'am' : 'pm'}`;
}

export function loginHealth(row: SlotAccountRow, index: number, now: number = Date.now()): LoginHealth {
  const u = row.usage;
  const login = u?.login || String(index + 1);
  const ends = u?.signin_ends ?? null;
  const endsMs = ends ? Date.parse(ends) : NaN;
  let worker: LoginHealth['worker'] = u ? 'ready' : 'unknown';
  let fullUntil: string | null = null;
  // past its end date it is dead whatever the last post said (the worker may be asleep)
  if (u?.signin === 'needs' || (Number.isFinite(endsMs) && endsMs <= now)) worker = 'needs';
  else if (u?.signin === 'renewing') worker = 'renewing';
  else if (u?.kind === 'key') {
    const rest = u.resting_until ? Date.parse(u.resting_until) : NaN;
    if (Number.isFinite(rest) && rest > now) { worker = 'full'; fullUntil = new Date(rest).toISOString(); }
  } else if (u) {
    let until = 0;
    for (const [v, r] of [[u.five_hour, u.resets_5h], [u.seven_day, u.resets_7d]] as const) {
      if ((v ?? 0) < FULL_AT) continue;
      const t = r ? Date.parse(r) : NaN;
      if (Number.isFinite(t) && t <= now) continue;        // that meter has reset since
      until = Math.max(until, Number.isFinite(t) ? t : now + 3600_000);
    }
    if (until) { worker = 'full'; fullUntil = new Date(until).toISOString(); }
  }
  const text = worker === 'needs' ? 'needs sign-in'
    : worker === 'renewing' ? 'renewing its sign-in'
    : worker === 'full' ? `${u?.kind === 'key' ? 'resting' : 'full'} until ${sgtWhen(fullUntil!)}`
    : worker === 'unknown' ? 'no reading from the worker yet'
    : 'ready';
  return { key: row.key, email: row.email, login, on: row.on, usable: row.on && (worker === 'ready' || worker === 'unknown' || worker === 'renewing'), worker, text, fullUntil, signinEnds: ends, kind: u?.kind === 'key' ? 'key' : 'login' };
}

export function loginHealths(rows: SlotAccountRow[], now: number = Date.now()): LoginHealth[] {
  return rows.map((r, i) => loginHealth(r, i, now));
}

function joinNums(ns: string[]): string {
  return ns.length <= 1 ? (ns[0] ?? '') : `${ns.slice(0, -1).join(', ')} and ${ns[ns.length - 1]}`;
}

/** Why nothing can mark, in his words — null when some login can. */
export function poolStall(h: LoginHealth[]): string | null {
  if (!h.length) return 'there is no marking login on the worker';
  if (h.some(x => x.usable)) return null;
  const off = h.filter(x => !x.on).map(x => x.login);
  const needs = h.filter(x => x.on && x.worker === 'needs').map(x => x.login);
  const full = h.filter(x => x.on && x.worker === 'full');
  const parts: string[] = [];
  const is = (n: string[]) => (n.length === 1 ? 'is' : 'are');
  if (off.length) parts.push(`login ${joinNums(off)} ${is(off)} switched off`);
  if (needs.length) parts.push(`login ${joinNums(needs)} ${needs.length === 1 ? 'needs' : 'need'} a fresh sign-in`);
  for (const f of full) parts.push(`login ${f.login} is ${f.kind === 'key' ? 'resting' : 'full'} until ${sgtWhen(f.fullUntil!)}`);
  const s = parts.join(', ');
  return parts.length > 1 ? s.replace(/, ([^,]*)$/, ' and $1') : s;
}

/** The steps to sign a login in again — for a tutor: which app, what to type. */
export function signInSteps(h: Pick<LoginHealth, 'login' | 'email'>): string {
  return [
    `To sign login ${h.login} in again:`,
    `1. On your Mac, open the Claude app and start a new session in the bot folder (adrianmath-telegram-math-bot).`,
    `2. Type: sign in marking login ${h.login} again`,
    `3. A browser page opens. Sign in as ${h.email}, copy the code it shows, and paste it back into the session.`,
    `The session does the rest.`,
  ].join('\n');
}

/** A year-long key is replaced from Terminal on the Mac (bot scripts/claude-key-capture.sh). */
export function newKeySteps(h: Pick<LoginHealth, 'login' | 'email'>): string {
  return [
    `To make login ${h.login} a new year-long key:`,
    `1. On your Mac, open the Terminal app.`,
    `2. Type: cd ~/dev/adrianmath-telegram-math-bot && bash scripts/claude-key-capture.sh ${h.login}`,
    `3. Follow what it says: sign in as ${h.email} in the browser, press Authorize, copy the key it prints, press Enter.`,
    `Then tell Claude "keys are in".`,
  ].join('\n');
}

export type SigninTold = Record<string, { ends: string; week?: boolean; day?: boolean; hours?: boolean }>;

/** Lines to send now, and the record to keep. A new end date (he signed in again) starts over. */
export function signinWarnings(h: LoginHealth[], told: SigninTold, now: number = Date.now()): { send: { key: string; text: string }[]; told: SigninTold } {
  const out: SigninTold = {};
  const send: { key: string; text: string }[] = [];
  for (const x of h) {
    if (!x.signinEnds) { if (told[x.key]) out[x.key] = told[x.key]; continue; }
    const ends = Date.parse(x.signinEnds);
    if (!Number.isFinite(ends)) continue;
    const t = told[x.key]?.ends === x.signinEnds ? { ...told[x.key] } : { ends: x.signinEnds };
    const left = ends - now;
    if (left > 0 && x.worker !== 'needs') {
      let stage: 'week' | 'day' | 'hours' | null = null;
      if (left <= WARN_HOURS_MS && !t.hours) { stage = 'hours'; t.hours = true; t.day = true; t.week = true; }
      else if (left <= WARN_DAY_MS && !t.day) { stage = 'day'; t.day = true; t.week = true; }
      else if (x.kind === 'key' && left <= WARN_WEEK_MS && !t.week) { stage = 'week'; t.week = true; }
      if (stage) {
        const inWords = stage === 'week' ? `in about ${Math.max(2, Math.round(left / 86_400_000))} days` : left < 3600_000 ? 'in under an hour' : left < 2 * 3600_000 ? 'in about 1 hour' : left < 20 * 3600_000 ? `in about ${Math.round(left / 3600_000)} hours` : 'in about a day';
        send.push({
          key: x.key,
          text: x.kind === 'key'
            ? `🗝 Marking login ${x.login}'s year-long key (${x.email}) ends ${sgtWhen(ends)} — ${inWords}.${x.on ? '' : ' (It is switched off right now.)'}\n\n${newKeySteps(x)}`
            : `🔑 Marking login ${x.login} (${x.email}) stops working ${sgtWhen(ends)} — ${inWords}.${x.on ? '' : ' (It is switched off right now.)'}\n`
              + `It cannot renew itself past that time; only a fresh sign-in keeps it going.\n\n${signInSteps(x)}`,
        });
      }
    }
    out[x.key] = t;
  }
  return { send, told: out };
}

export interface QueuedPaper { id: string; queued_at: string; claimed: boolean }
export interface StallState { since?: string | null; told_at?: string | null }

/** The stall alarm's decision for this tick. */
export function stallDecision(papers: QueuedPaper[], h: LoginHealth[], state: StallState, now: number = Date.now()): { message: string | null; state: StallState; waiting: number; reason: string | null } {
  const waiting = papers.filter(p => !p.claimed && now - Date.parse(p.queued_at) > STALL_AFTER_MS);
  const marking = papers.some(p => p.claimed);
  const pool = poolStall(h);
  // the worker is marking something → the queue is moving (a cap of 3 can keep a 4th waiting)
  const reason = !waiting.length ? null
    : pool ? pool
    : !marking ? 'a login has room, but the cloud worker is not picking them up'
    : null;
  if (!reason) return { message: null, state: {}, waiting: waiting.length, reason: null };
  const since = state.since || new Date(now).toISOString();
  const told = state.told_at ? Date.parse(state.told_at) : 0;
  if (told && now - told < STALL_REPEAT_MS) return { message: null, state: { since, told_at: state.told_at }, waiting: waiting.length, reason };
  const oldest = Math.min(...waiting.map(p => Date.parse(p.queued_at)));
  const mins = Math.round((now - oldest) / 60_000);
  const age = mins >= 90 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${mins} min`;
  const n = waiting.length;
  const fix: string[] = [];
  if (pool) {
    if (h.some(x => !x.on && x.worker !== 'needs')) fix.push(`• Switch a login on: ${SITE}/admin/switches → Plan accounts.`);
    const dead = h.filter(x => x.worker === 'needs');
    if (dead.length) fix.push(`• Sign a login in again: on your Mac, open the Claude app and type "sign in marking login ${dead[0].login} again".`);
  } else {
    fix.push(`• Tell a Claude session: "the marking worker is not picking up papers".`);
  }
  fix.push(`• Or press ☁️ Batch now on the paper's row in Mark paper (${SITE}/admin/mark-paper) — it uses the paid API.`);
  const message = `⏸ ${n} paper${n === 1 ? '' : 's'} waiting for marking (the oldest for ${age}): ${reason}.\n${fix.join('\n')}`
    + (told ? '\n(Still stuck since my last message.)' : '');
  return { message, state: { since, told_at: new Date(now).toISOString() }, waiting: n, reason };
}

/** The reason to show on a queued row that has waited past STALL_AFTER_MS, or null. */
export function rowStallNote(queuedAt: string | null | undefined, h: LoginHealth[] | null, now: number = Date.now()): string | null {
  if (!queuedAt || !h) return null;
  if (now - Date.parse(queuedAt) <= STALL_AFTER_MS) return null;
  const r = poolStall(h);
  return r ? `not moving: ${r}` : null;
}
