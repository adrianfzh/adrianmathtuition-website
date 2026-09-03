// Browser-side web push for the student portal — ONE implementation of
// "turn notifications on/off", shared by the Settings toggle
// (app/settings/PushToggle.tsx) and the Home nudge (components/PushNudgeCard).
// Before 2026-09-03 the toggle owned this inline; the nudge would have been a
// second copy of the same seven steps.
//
// Enable: ask permission → register /sw.js → wait for it to activate →
// subscribe with the VAPID key → POST /api/portal/push. Disable: unsubscribe
// → DELETE. Both are browser-only; call them from event handlers.
//
// Permission is requested FIRST, before any await: Safari only honours
// Notification.requestPermission() while the tap's transient activation is
// still live, and a cold service-worker registration can outlast it. Chrome
// is lenient either way. (The previous order — register, then ask — worked on
// Android; this one works on both.)
import { urlBase64ToUint8Array } from './push-payload';
import { portalFetch } from './portal-fetch';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';

/** serviceWorker + PushManager + Notification all present in this browser context. */
export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    typeof Notification !== 'undefined'
  );
}

/** Notification.permission, or null where the API is missing (an un-installed iPhone tab). */
export function pushPermission(): NotificationPermission | null {
  return typeof Notification !== 'undefined' ? Notification.permission : null;
}

/** The browser's current subscription for this origin, or null. Never throws. */
export async function currentPushSubscription(): Promise<PushSubscription | null> {
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    return (await reg?.pushManager.getSubscription()) ?? null;
  } catch {
    return null;
  }
}

export type EnablePushResult =
  | { ok: true }
  /**
   * 'denied'      — the browser said no (permanent until the student changes site settings)
   * 'default'     — the prompt was closed without an answer; asking again later is fine
   * 'unsupported' — no push here (plain iOS tab, old browser)
   * 'no-key'      — NEXT_PUBLIC_VAPID_PUBLIC_KEY missing from this build
   * 'failed'      — subscribe or the server save threw; the browser side is rolled back
   */
  | { ok: false; reason: 'denied' | 'default' | 'unsupported' | 'no-key' | 'failed' };

/** Turn push on for this browser. Call from a tap handler — never on load. */
export async function enablePush(): Promise<EnablePushResult> {
  if (!pushSupported()) return { ok: false, reason: 'unsupported' };
  if (!VAPID_PUBLIC_KEY) return { ok: false, reason: 'no-key' };
  let permission: NotificationPermission;
  try {
    permission = await Notification.requestPermission();
  } catch {
    return { ok: false, reason: 'failed' };
  }
  if (permission !== 'granted') return { ok: false, reason: permission === 'denied' ? 'denied' : 'default' };
  try {
    await navigator.serviceWorker.register('/sw.js');
    // `ready` waits for the worker to activate — subscribing on a
    // just-registered, not-yet-active worker throws in Chrome.
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
    try {
      await portalFetch('/api/portal/push', { json: sub.toJSON() });
    } catch {
      // Server didn't store it — undo the browser side so nothing ever shows
      // "on" for a subscription no push will reach.
      await sub.unsubscribe().catch(() => { /* best effort */ });
      return { ok: false, reason: 'failed' };
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}

/** Turn push off for this browser. Throws only if the browser-side lookup itself fails. */
export async function disablePush(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  await sub.unsubscribe().catch(() => { /* best effort */ });
  await fetch('/api/portal/push', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint }),
  }).catch(() => { /* row self-cleans on the next expired send */ });
}
