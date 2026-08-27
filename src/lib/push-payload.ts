// Pure helpers for portal web-push — shared by the server sender
// (lib/portal-push.ts) and the settings-page subscribe flow. No I/O here
// (repo policy: logic in lib with a sibling .test.ts, not inline in routes).

export type PortalPushMessage = {
  title: string;
  body?: string;
  url?: string;
};

// Notification UIs truncate long strings anyway; capping here also keeps the
// payload far under the ~4KB web-push limit.
const MAX_TITLE_CHARS = 120;
const MAX_BODY_CHARS = 240;

/**
 * The JSON string handed to webpush.sendNotification and parsed by
 * public/sw.js. `url` is restricted to a same-origin path ('/…', never
 * '//host' or 'https://…') — the service worker feeds it to openWindow, and a
 * push payload must never be able to deep-link a student off-site.
 */
export function buildPushPayload(msg: PortalPushMessage): string {
  const title = (msg.title || 'AdrianMath').slice(0, MAX_TITLE_CHARS);
  const body = (msg.body || '').slice(0, MAX_BODY_CHARS);
  let url = msg.url || '/app';
  if (!url.startsWith('/') || url.startsWith('//')) url = '/app';
  return JSON.stringify({ title, body, url });
}

/**
 * Decode a base64url VAPID public key into the byte array
 * pushManager.subscribe wants as applicationServerKey.
 * (Return type is inferred so it stays Uint8Array<ArrayBuffer> — assignable
 * to BufferSource under TS 5.7+ typed-array generics.)
 */
export function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}
