// Install-to-Home-Screen + push-nudge decisions for the student portal — the
// PURE half (no DOM, no React) of components/InstallCard.tsx,
// components/PushAskCard.tsx and components/portal-install-store.ts.
//
// Why this exists (Adrian, 2026-09-02: students should "STAY in the app"):
// Safari never offers an install on its own, Chrome's own mini-infobar is easy
// to miss, and the push toggle sat unnoticed in Settings. The portal now asks
// once, politely, on Home — and every branch of "what do we show this device"
// is decided here so it can be unit-tested (install-prompt.test.ts) instead
// of on four phones.
//
// Decision table (platform × state → Home card):
//   standalone (installed)           → 'installed'  nothing on Home; Settings says ✓
//   desktop UA (no touch Mac, Win…)  → 'desktop'    nothing on Home; Settings: phone hint
//   dismissed (✕ tapped, ever)       → 'dismissed' nothing on Home; Settings still shows
//   iPhone / iPad (incl. Mac UA+touch)→ 'ios'       2-step Share → Add to Home Screen
//   Android                          → 'android'    Install button (needs the captured
//                                                   beforeinstallprompt; without it the
//                                                   Home card stays hidden and Settings
//                                                   shows the Chrome-menu instruction)
// The push nudge is the mirror image: only INSIDE the installed app, only while
// the browser has not been asked yet (permission 'default'), never on load.

export type InstallPlatform = 'ios' | 'android' | 'desktop';
export type InstallState = 'installed' | 'android' | 'ios' | 'desktop' | 'dismissed';

export interface InstallInput {
  /** navigator.userAgent */
  ua: string;
  /** `(display-mode: standalone)` matches, or navigator.standalone (iOS) */
  standalone: boolean;
  /** navigator.maxTouchPoints — iPadOS reports a Mac UA; touch gives it away */
  maxTouchPoints: number;
  /** The student tapped ✕ on the Home card once — it never comes back (21 Sep 2026). */
  dismissed: boolean;
}

/** iPhone, iPod, iPad — including iPadOS 13+ asking for desktop sites (Mac UA + touch). */
export function isIOS(ua: string, maxTouchPoints: number): boolean {
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  return /Macintosh/i.test(ua) && maxTouchPoints > 1;
}

/** iPad specifically — the share button lives at the top right there, not the bottom bar. */
export function isIPad(ua: string, maxTouchPoints: number): boolean {
  if (/iPad/i.test(ua)) return true;
  return /Macintosh/i.test(ua) && maxTouchPoints > 1;
}

export function isAndroid(ua: string): boolean {
  return /Android/i.test(ua);
}

export function installPlatform(ua: string, maxTouchPoints: number): InstallPlatform {
  if (isIOS(ua, maxTouchPoints)) return 'ios';
  if (isAndroid(ua)) return 'android';
  return 'desktop';
}

/**
 * What the Home install card should do for this device right now.
 * Precedence: installed > desktop > dismissed > platform — a dismissal never
 * matters on desktop, and an installed app never nags whatever was stored.
 */
export function installState(i: InstallInput): InstallState {
  if (i.standalone) return 'installed';
  const platform = installPlatform(i.ua, i.maxTouchPoints);
  if (platform === 'desktop') return 'desktop';
  if (i.dismissed) return 'dismissed';
  return platform;
}

/**
 * Where the Share button is on this iOS browser — appended to step 1 so a
 * student doesn't hunt for it. Safari on iPhone keeps it in the bottom bar;
 * on iPad it sits top-right; Chrome/Firefox/Edge on iOS put it by the
 * address bar (Chrome's is top-right too). Empty when we'd only be guessing.
 */
export function iosShareHint(ua: string, maxTouchPoints: number): string {
  if (!isIOS(ua, maxTouchPoints)) return '';
  const thirdParty = /CriOS|FxiOS|EdgiOS|OPiOS|Brave/i.test(ua);
  if (isIPad(ua, maxTouchPoints)) return 'at the top right';
  return thirdParty ? 'next to the address bar' : 'in the bar at the bottom';
}

// ── Dismissal (✕ = "not now" — and never again) ─────────────────────────────
// Until 21 Sep 2026 a ✕ was a 14-day snooze, so the same cards came back to
// the same students month after month (167 push nudges and 147 install nudges
// shown to 21 students in 30 days). Adrian: "once a student has dismissed or
// done it, never show it again." Each nudge keeps its own key; the stored
// value is DISMISSED_MARK. The old *_snooze_until keys are simply ignored.

export const INSTALL_DISMISSED_KEY = 'portal_install_dismissed';
export const PUSH_NUDGE_DISMISSED_KEY = 'portal_push_nudge_dismissed';
export const TELEGRAM_NUDGE_DISMISSED_KEY = 'portal_telegram_nudge_dismissed';
export const DISMISSED_MARK = '1';

/** Read a dismissal flag; anything but the mark is "not dismissed". */
export function parseDismissed(raw: string | null | undefined): boolean {
  return raw === DISMISSED_MARK;
}

// ── Push nudge ("Turn on notifications", inside the installed app) ──────────

export type PushPermission = 'default' | 'granted' | 'denied';
export type PushNudgeState = 'show' | 'not-installed' | 'unsupported' | 'decided' | 'dismissed';

export interface PushNudgeInput {
  standalone: boolean;
  /** serviceWorker + PushManager + Notification all present */
  supported: boolean;
  /** Notification.permission, or null when the API is missing */
  permission: PushPermission | null;
  dismissed: boolean;
}

/**
 * Show the one-tap nudge only where a tap can actually succeed: the installed
 * app (iOS exposes PushManager to Home-Screen apps only), push supported, and
 * the browser not yet asked. 'granted' hides it too — a student who granted
 * and then switched the Settings toggle OFF made a choice; the nudge must not
 * undo it. 'denied' is the browser's own permanent answer.
 */
export function pushNudgeState(i: PushNudgeInput): PushNudgeState {
  if (!i.standalone) return 'not-installed';
  if (!i.supported || i.permission === null) return 'unsupported';
  if (i.permission !== 'default') return 'decided';
  if (i.dismissed) return 'dismissed';
  return 'show';
}

// ── The install card's two-day window (14 Oct 2026) ─────────────────────────
// Adrian: "for add to home screen, show it for the first time a student
// registers for the first 2 days, then after no more." 17 students had seen the
// card 275 times. The Home card now shows only while the account is under two
// days old (portal_accounts.created_at — the same moment as the sign-up; checked
// 14 Oct 2026, all 21 accounts within the hour of auth.users.created_at). ✕
// still hides it at once. The Settings row is not affected.

export const INSTALL_CARD_WINDOW_MS = 2 * 86_400_000;

/** True while the account is less than two days old. A missing or unreadable date = closed. */
export function installCardWindowOpen(accountCreatedAt: string | null | undefined, now: Date): boolean {
  const t = Date.parse(accountCreatedAt ?? '');
  if (!Number.isFinite(t)) return false;
  const age = now.getTime() - t;
  return age >= -60_000 && age < INSTALL_CARD_WINDOW_MS;
}

// ── Ask for notifications once, on a marked paper (14 Oct 2026) ─────────────
// Adrian: ask "once, right after their first marked paper comes back, instead
// of on every Home visit" → "yes". The Home nudge was shown 329 times to 11
// students; 4 phones turned it on. Now: never on Home. The first time a student
// opens a marked paper on a device where the tap can work, one line asks. It is
// remembered on the ACCOUNT (prefs.push_asked) the moment it shows, so it is
// asked once per student, not once per phone. "Not now" = never again.

export type PushAskState = 'show' | 'admin' | 'unsupported' | 'decided' | 'asked-before';

export interface PushAskInput {
  /** Adrian's admin view of a student's paper — never ask. */
  adminViewer: boolean;
  /** serviceWorker + PushManager + Notification all present (iPhone: only inside the installed app). */
  supported: boolean;
  /** Notification.permission, or null when the API is missing. */
  permission: PushPermission | null;
  /** prefs.push_asked on the account — the ask has already been shown once. */
  askedOnAccount: boolean;
  /** This device dismissed the old Home nudge (✕) — that already was a "not now". */
  dismissedOnDevice: boolean;
}

/**
 * Whether the marked-paper page asks. Waits for a device where a tap can
 * succeed (an iPhone Safari tab has no push — the ask waits until the app is
 * installed); 'granted' or 'denied' are answers already given; the account
 * flag makes it once per student.
 */
export function pushAskState(i: PushAskInput): PushAskState {
  if (i.adminViewer) return 'admin';
  if (!i.supported || i.permission === null) return 'unsupported';
  if (i.permission !== 'default') return 'decided';
  if (i.askedOnAccount || i.dismissedOnDevice) return 'asked-before';
  return 'show';
}

/** The account flag, read from portal_accounts.prefs. */
export function pushAskedOnAccount(prefs: unknown): boolean {
  return !!prefs && typeof prefs === 'object' && !Array.isArray(prefs) && (prefs as Record<string, unknown>).push_asked === true;
}

// ── One nudge on Home at a time (21 Sep 2026) ───────────────────────────────
// Home used to stack up to three asks (install · notifications · Telegram).
// Now exactly one shows, in this order, and each disappears for good once
// done or dismissed: install the app → link Telegram. Since 14 Oct 2026 the
// install card shows only in the account's first two days, and notifications
// are no longer asked on Home at all (the marked-paper page asks once).

export type HomeNudge = 'install' | 'telegram' | null;

export interface HomeNudgeInput {
  state: InstallState;
  /** Chrome has handed over its install prompt (Android needs it to show a button). */
  deferredPromptAvailable: boolean;
  /** The account is under two days old (installCardWindowOpen). */
  installWindowOpen: boolean;
  /** The server says the account has no Telegram chat bound. */
  telegramUnlinked: boolean;
  telegramDismissed: boolean;
}

export function homeNudge(i: HomeNudgeInput): HomeNudge {
  if (i.installWindowOpen && (i.state === 'ios' || (i.state === 'android' && i.deferredPromptAvailable))) return 'install';
  if (i.telegramUnlinked && !i.telegramDismissed) return 'telegram';
  return null;
}

// ── Telemetry kinds (portal_event_log, via POST /api/portal/event) ──────────
// Bounded on purpose: the route refuses anything not in this list, so the
// kind space stays enumerable for one GROUP BY. Funnel reads:
//   install:shown ÷ install:accepted  = Android take-up
//   install:ios-shown                 = iPhones that saw the 2-step card
//   install:dismissed                 = ✕ on either platform
//   push:nudge-shown ÷ push:nudge-on  = notification take-up (since 14 Oct 2026: the
//                                       one ask on a marked paper, not the Home nudge)

export const PORTAL_CLIENT_EVENT_KINDS = [
  'install:shown',
  'install:accepted',
  'install:dismissed',
  'install:ios-shown',
  'push:nudge-shown',
  'push:nudge-on',
  'push:nudge-denied',
  'push:nudge-dismissed',
  'telegram:nudge-dismissed',
] as const;

export type PortalClientEventKind = typeof PORTAL_CLIENT_EVENT_KINDS[number];

export function isPortalClientEventKind(x: unknown): x is PortalClientEventKind {
  return typeof x === 'string' && (PORTAL_CLIENT_EVENT_KINDS as readonly string[]).includes(x);
}
