import { describe, it, expect } from 'vitest';
import {
  INSTALL_SNOOZE_KEY, PORTAL_CLIENT_EVENT_KINDS, PUSH_NUDGE_SNOOZE_KEY, SNOOZE_DAYS,
  installPlatform, installState, iosShareHint, isAndroid, isIOS, isIPad,
  isPortalClientEventKind, parseSnooze, pushNudgeState, snoozeDeadline,
} from './install-prompt';

const UA = {
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1',
  ipadClassic: 'Mozilla/5.0 (iPad; CPU OS 12_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1 Mobile/15E148 Safari/604.1',
  // iPadOS 13+ "Request Desktop Website" default — indistinguishable from a Mac by UA alone.
  ipadAsMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  macChrome: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  androidChrome: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.71 Mobile Safari/537.36',
  androidFirefox: 'Mozilla/5.0 (Android 14; Mobile; rv:127.0) Gecko/127.0 Firefox/127.0',
  windowsChrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  chromebook: 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
};

const NOW = Date.UTC(2026, 8, 3, 4, 0, 0); // 2026-09-03 12:00 SGT

function input(over: Partial<Parameters<typeof installState>[0]> = {}) {
  return { ua: UA.iphoneSafari, standalone: false, maxTouchPoints: 5, snoozedUntil: null, now: NOW, ...over };
}

describe('platform detection', () => {
  it('spots iPhone and iPad by UA', () => {
    expect(isIOS(UA.iphoneSafari, 5)).toBe(true);
    expect(isIOS(UA.iphoneChrome, 5)).toBe(true);
    expect(isIOS(UA.ipadClassic, 5)).toBe(true);
    expect(isIPad(UA.ipadClassic, 5)).toBe(true);
    expect(isIPad(UA.iphoneSafari, 5)).toBe(false);
  });
  it('unmasks an iPad wearing a Mac UA through its touch points', () => {
    expect(isIOS(UA.ipadAsMac, 5)).toBe(true);
    expect(isIPad(UA.ipadAsMac, 5)).toBe(true);
    // The same UA with no touch is a real Mac.
    expect(isIOS(UA.macSafari, 0)).toBe(false);
    expect(isIPad(UA.macSafari, 0)).toBe(false);
    // One touch point is what some Windows/Chrome builds report — not an iPad.
    expect(isIOS(UA.macSafari, 1)).toBe(false);
  });
  it('spots Android (any browser) and treats everything else as desktop', () => {
    expect(isAndroid(UA.androidChrome)).toBe(true);
    expect(isAndroid(UA.androidFirefox)).toBe(true);
    expect(installPlatform(UA.androidFirefox, 5)).toBe('android');
    expect(installPlatform(UA.windowsChrome, 0)).toBe('desktop');
    expect(installPlatform(UA.macChrome, 0)).toBe('desktop');
    expect(installPlatform(UA.chromebook, 0)).toBe('desktop');
    // A touch-screen Windows laptop is still a desktop — only a Mac UA + touch means iPad.
    expect(installPlatform(UA.windowsChrome, 10)).toBe('desktop');
  });
});

describe('installState', () => {
  it('iPhone Safari, not installed → ios (the 2-step card)', () => {
    expect(installState(input())).toBe('ios');
  });
  it('iPad reporting a Mac UA + touch → ios', () => {
    expect(installState(input({ ua: UA.ipadAsMac, maxTouchPoints: 5 }))).toBe('ios');
  });
  it('Android → android (the Install button)', () => {
    expect(installState(input({ ua: UA.androidChrome }))).toBe('android');
  });
  it('desktop → desktop, whatever else is stored', () => {
    expect(installState(input({ ua: UA.macChrome, maxTouchPoints: 0 }))).toBe('desktop');
    expect(installState(input({ ua: UA.macChrome, maxTouchPoints: 0, snoozedUntil: NOW + 1 }))).toBe('desktop');
  });
  it('standalone wins over everything — an installed app never nags', () => {
    expect(installState(input({ standalone: true }))).toBe('installed');
    expect(installState(input({ standalone: true, ua: UA.androidChrome }))).toBe('installed');
    expect(installState(input({ standalone: true, ua: UA.macChrome, maxTouchPoints: 0 }))).toBe('installed');
    expect(installState(input({ standalone: true, snoozedUntil: NOW + 1 }))).toBe('installed');
  });
  it('a live snooze hides the card on phones; an expired one does not', () => {
    expect(installState(input({ snoozedUntil: NOW + 1 }))).toBe('snoozed');
    expect(installState(input({ ua: UA.androidChrome, snoozedUntil: NOW + 60_000 }))).toBe('snoozed');
    expect(installState(input({ snoozedUntil: NOW }))).toBe('ios');       // deadline reached
    expect(installState(input({ snoozedUntil: NOW - 1 }))).toBe('ios');
  });
});

describe('snooze bookkeeping', () => {
  it('✕ snoozes for exactly 14 days', () => {
    expect(SNOOZE_DAYS).toBe(14);
    expect(snoozeDeadline(NOW)).toBe(NOW + 14 * 86_400_000);
    // The written value round-trips through localStorage as a string.
    expect(parseSnooze(String(snoozeDeadline(NOW)))).toBe(snoozeDeadline(NOW));
    // …and survives a reload at day 13, not at day 15.
    const until = snoozeDeadline(NOW);
    expect(installState(input({ snoozedUntil: until, now: NOW + 13 * 86_400_000 }))).toBe('snoozed');
    expect(installState(input({ snoozedUntil: until, now: NOW + 15 * 86_400_000 }))).toBe('ios');
  });
  it('treats junk in localStorage as "not snoozed"', () => {
    expect(parseSnooze(null)).toBeNull();
    expect(parseSnooze(undefined)).toBeNull();
    expect(parseSnooze('')).toBeNull();
    expect(parseSnooze('yes')).toBeNull();
    expect(parseSnooze('NaN')).toBeNull();
    expect(parseSnooze('-5')).toBeNull();
    expect(parseSnooze('0')).toBeNull();
  });
  it('keeps the two nudges on separate keys', () => {
    expect(INSTALL_SNOOZE_KEY).not.toBe(PUSH_NUDGE_SNOOZE_KEY);
  });
});

describe('iosShareHint', () => {
  it('points at the bottom bar on iPhone Safari, top right on iPad, address bar on iOS Chrome', () => {
    expect(iosShareHint(UA.iphoneSafari, 5)).toBe('in the bar at the bottom');
    expect(iosShareHint(UA.ipadClassic, 5)).toBe('at the top right');
    expect(iosShareHint(UA.ipadAsMac, 5)).toBe('at the top right');
    expect(iosShareHint(UA.iphoneChrome, 5)).toBe('next to the address bar');
  });
  it('says nothing off iOS', () => {
    expect(iosShareHint(UA.androidChrome, 5)).toBe('');
    expect(iosShareHint(UA.macSafari, 0)).toBe('');
  });
});

describe('pushNudgeState', () => {
  const base = { standalone: true, supported: true, permission: 'default' as const, snoozedUntil: null, now: NOW };
  it('shows only inside the installed app with the browser not yet asked', () => {
    expect(pushNudgeState(base)).toBe('show');
  });
  it('never shows in a plain browser tab (iOS has no PushManager there anyway)', () => {
    expect(pushNudgeState({ ...base, standalone: false })).toBe('not-installed');
  });
  it('hides once the browser has an answer — granted OR denied', () => {
    expect(pushNudgeState({ ...base, permission: 'granted' })).toBe('decided');
    expect(pushNudgeState({ ...base, permission: 'denied' })).toBe('decided');
  });
  it('hides where push cannot work', () => {
    expect(pushNudgeState({ ...base, supported: false })).toBe('unsupported');
    expect(pushNudgeState({ ...base, permission: null })).toBe('unsupported');
  });
  it('honours its own snooze', () => {
    expect(pushNudgeState({ ...base, snoozedUntil: NOW + 1 })).toBe('snoozed');
    expect(pushNudgeState({ ...base, snoozedUntil: NOW - 1 })).toBe('show');
  });
});

describe('telemetry kinds', () => {
  it('accepts exactly the bounded list', () => {
    for (const k of PORTAL_CLIENT_EVENT_KINDS) expect(isPortalClientEventKind(k)).toBe(true);
    expect(isPortalClientEventKind('install:shown')).toBe(true);
    expect(isPortalClientEventKind('install:whatever')).toBe(false);
    expect(isPortalClientEventKind('lesson:x:done')).toBe(false);
    expect(isPortalClientEventKind('')).toBe(false);
    expect(isPortalClientEventKind(null)).toBe(false);
    expect(isPortalClientEventKind(42)).toBe(false);
  });
  it('carries the four install kinds the spec names', () => {
    expect(PORTAL_CLIENT_EVENT_KINDS).toEqual(expect.arrayContaining([
      'install:shown', 'install:accepted', 'install:dismissed', 'install:ios-shown',
    ]));
  });
});
