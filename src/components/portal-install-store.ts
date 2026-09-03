'use client';

// The install + push-nudge store — ONE client-side snapshot of "what does this
// device look like" that components/InstallCard.tsx, components/PushNudgeCard.tsx
// and app/settings/PushToggle.tsx read through useSyncExternalStore. SSR-safe:
// the server snapshot is a constant with ready:false, so every card renders
// nothing on the server and during hydration, then fills in — no hydration
// mismatch, no setState-in-effect cascade (the lesson player's prefs pattern).
//
// Why a module-level store and not per-component state: Chrome fires
// `beforeinstallprompt` ONCE, early — often before React has mounted the Home
// card — so the listener has to be installed the moment this chunk evaluates
// and hold the event for whichever card mounts later. Everything the decision
// needs (UA, touch points, standalone, the two snoozes, Notification state) is
// gathered here; the decisions themselves are the pure functions in
// lib/install-prompt.ts.
import { useSyncExternalStore } from 'react';
import {
  INSTALL_SNOOZE_KEY, PUSH_NUDGE_SNOOZE_KEY, installPlatform, installState, iosShareHint, isIPad,
  parseSnooze, pushNudgeState, snoozeDeadline,
  type InstallPlatform, type InstallState, type PushNudgeState, type PushPermission,
} from '@/lib/install-prompt';
import { pushPermission, pushSupported } from '@/lib/portal-push-client';

/** Chrome's non-standard event (not in lib.dom). */
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export interface InstallSnapshot {
  /** false on the server and during hydration — render nothing then. */
  ready: boolean;
  platform: InstallPlatform;
  ipad: boolean;
  /** Where the Share button is on this iOS browser ('' off iOS). */
  shareHint: string;
  /** The Home install card's decision (lib/install-prompt installState). */
  state: InstallState;
  /** Chrome's deferred install prompt, held until a card uses it. */
  deferredPrompt: BeforeInstallPromptEvent | null;
  /** The Home push nudge's decision (lib/install-prompt pushNudgeState). */
  push: PushNudgeState;
  pushSupported: boolean;
  pushPermission: PushPermission | null;
  /**
   * Once per page load: the component instance (its claim token) that owns
   * the Home install card / push nudge slot, or null while unclaimed. A later
   * Home visit in the same load mounts a new instance with a new token, sees
   * the slot taken, and stays quiet.
   */
  homeInstallOwner: object | null;
  homePushOwner: object | null;
}

const SERVER_SNAPSHOT: InstallSnapshot = {
  ready: false, platform: 'desktop', ipad: false, shareHint: '', state: 'desktop', deferredPrompt: null,
  push: 'not-installed', pushSupported: false, pushPermission: null, homeInstallOwner: null, homePushOwner: null,
};

function readStorage(key: string): string | null {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
function writeStorage(key: string, value: string): void {
  try { window.localStorage.setItem(key, value); } catch { /* private mode / quota — the snooze just doesn't persist */ }
}

function isStandalone(): boolean {
  try {
    if (window.matchMedia('(display-mode: standalone)').matches) return true;
  } catch { /* no matchMedia */ }
  return (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

// Mutable facts the snapshot is derived from.
let installed = false;         // appinstalled fired, or standalone at read time
let deferredPrompt: BeforeInstallPromptEvent | null = null;
let homeInstallOwner: object | null = null;
let homePushOwner: object | null = null;

let snapshot: InstallSnapshot = SERVER_SNAPSHOT;
const listeners = new Set<() => void>();

function compute(): InstallSnapshot {
  const ua = navigator.userAgent || '';
  const touch = navigator.maxTouchPoints || 0;
  const standalone = installed || isStandalone();
  const now = Date.now();
  const supported = pushSupported();
  const permission = pushPermission();
  return {
    ready: true,
    platform: installPlatform(ua, touch),
    ipad: isIPad(ua, touch),
    shareHint: iosShareHint(ua, touch),
    state: installState({ ua, standalone, maxTouchPoints: touch, snoozedUntil: parseSnooze(readStorage(INSTALL_SNOOZE_KEY)), now }),
    deferredPrompt,
    push: pushNudgeState({ standalone, supported, permission, snoozedUntil: parseSnooze(readStorage(PUSH_NUDGE_SNOOZE_KEY)), now }),
    pushSupported: supported,
    pushPermission: permission,
    homeInstallOwner,
    homePushOwner,
  };
}

/** Recompute the snapshot from the facts and tell every subscriber. */
export function refreshInstallStore(): void {
  if (typeof window === 'undefined') return;
  snapshot = compute();
  listeners.forEach(l => l());
}

// Listeners go on at module evaluation (client only) so an early
// beforeinstallprompt is never missed. Passive if the browser never fires them.
if (typeof window !== 'undefined') {
  snapshot = compute();
  window.addEventListener('beforeinstallprompt', (e) => {
    // Hold Chrome's mini-infobar back — the Home card / Settings row is the prompt.
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    refreshInstallStore();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    deferredPrompt = null;
    refreshInstallStore();
  });
  try {
    window.matchMedia('(display-mode: standalone)').addEventListener('change', refreshInstallStore);
  } catch { /* no matchMedia */ }
  // Another tab snoozing / installing should quieten this one too.
  window.addEventListener('storage', refreshInstallStore);
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}
const getSnapshot = () => snapshot;
const getServerSnapshot = () => SERVER_SNAPSHOT;

/** The live device snapshot — SERVER_SNAPSHOT (ready:false) on the server and during hydration. */
export function useInstallStore(): InstallSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

// ── Actions ──────────────────────────────────────────────────────────────────

/** ✕ on the Home install card: hide it here for 14 days (lib/install-prompt SNOOZE_DAYS). */
export function snoozeInstall(now: number = Date.now()): void {
  writeStorage(INSTALL_SNOOZE_KEY, String(snoozeDeadline(now)));
  refreshInstallStore();
}

/** ✕ on the Home push nudge: same 14-day rest, its own key. */
export function snoozePushNudge(now: number = Date.now()): void {
  writeStorage(PUSH_NUDGE_SNOOZE_KEY, String(snoozeDeadline(now)));
  refreshInstallStore();
}

/**
 * Claim the Home install-card slot for this page load with the caller's
 * token (once per session — a later Home visit stays quiet). No-op when
 * already claimed, including by the same token (StrictMode's double effect).
 */
export function claimHomeInstall(token: object): void {
  if (homeInstallOwner !== null) return;
  homeInstallOwner = token;
  refreshInstallStore();
}
export function claimHomePush(token: object): void {
  if (homePushOwner !== null) return;
  homePushOwner = token;
  refreshInstallStore();
}

/**
 * Fire Chrome's install prompt (Android). The deferred event is single-use, so
 * it is cleared before prompting; 'unavailable' means nothing was captured.
 */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const e = deferredPrompt;
  if (!e) return 'unavailable';
  deferredPrompt = null;
  try {
    await e.prompt();
    const { outcome } = await e.userChoice;
    if (outcome === 'accepted') installed = true;
    refreshInstallStore();
    return outcome;
  } catch {
    refreshInstallStore();
    return 'dismissed';
  }
}
