/* Portal service worker — web-push only.
 *
 * Registered on demand from the /app/settings notifications toggle, scope '/'
 * (the /admin/lessons offline editor keeps its own sw-lessons.js at its own
 * scope — the two never overlap). This worker deliberately has NO fetch
 * handler: it caches nothing and intercepts nothing; it exists so the browser
 * can show push notifications and route the tap.
 *
 * Payload contract ({title, body, url}) is produced by
 * src/lib/push-payload.ts buildPushPayload() — keep the two in step.
 */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    // Not JSON (or empty) — fall through to defaults so the required
    // userVisibleOnly notification still shows.
  }
  const title = typeof data.title === 'string' && data.title ? data.title : 'AdrianMath';
  // Same-origin paths only — mirror of the buildPushPayload guard, kept here
  // too so a malformed payload can never open an off-site window.
  let url = typeof data.url === 'string' ? data.url : '/app';
  if (!url.startsWith('/') || url.startsWith('//')) url = '/app';
  event.waitUntil(self.registration.showNotification(title, {
    body: typeof data.body === 'string' ? data.body : '',
    icon: '/icons/admin-192.png',
    badge: '/icons/admin-192.png',
    data: { url },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  let url = (event.notification.data && event.notification.data.url) || '/app';
  if (!url.startsWith('/') || url.startsWith('//')) url = '/app';
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if ('focus' in client) {
        await client.focus();
        if ('navigate' in client) {
          try { await client.navigate(url); } catch { /* focused is good enough */ }
        }
        return;
      }
    }
    await self.clients.openWindow(url);
  })());
});
