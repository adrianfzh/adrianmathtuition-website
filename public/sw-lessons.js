/* Service worker for the /admin/lessons editor.
 *
 * Scope: only the admin/lessons editor — registered from LessonEditorClient.
 * Strategy:
 *   - HTML navigations to /admin/lessons/* → network-first, fall back to the cached
 *     shell so the editor still boots offline. Authentication still has to be
 *     valid (cookie); the SW just keeps the page+bundles available.
 *   - JS / CSS / fonts → stale-while-revalidate. Cached on first hit, refreshed
 *     opportunistically afterwards.
 *   - API calls (`/api/*`) → never cached; pass straight through. The offline
 *     editor stack (IndexedDB + mutation log) handles offline data, not the SW.
 *
 * Cache versioning: bump CACHE_VERSION to invalidate. The activate handler removes
 * any cache whose name does not match CACHE_PREFIX + CACHE_VERSION.
 */

const CACHE_PREFIX = 'adrianmath-lessons-';
const CACHE_VERSION = 'v1';
const CACHE_NAME = CACHE_PREFIX + CACHE_VERSION;

self.addEventListener('install', (event) => {
  // Activate as soon as installed — we have only one client per session.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME)
        .map((k) => caches.delete(k)),
    );
    await self.clients.claim();
  })());
});

function isStaticAsset(url) {
  return /\.(?:js|css|woff2?|ttf|otf|png|svg|jpg|jpeg|webp|ico)$/i.test(url.pathname)
    || url.pathname.startsWith('/_next/static/')
    || url.pathname.startsWith('/_next/image');
}

function isLessonsNavigation(req, url) {
  return req.mode === 'navigate' && url.pathname.startsWith('/admin/lessons');
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Never cache APIs — the offline editor uses IndexedDB for data
  if (url.pathname.startsWith('/api/')) return;

  // Only handle same-origin
  if (url.origin !== self.location.origin) return;

  if (isLessonsNavigation(req, url)) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        // Cache a copy of the navigation shell for offline reload
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, fresh.clone()).catch(() => {});
        return fresh;
      } catch {
        const cache = await caches.open(CACHE_NAME);
        // Try exact URL first, fall back to any cached /admin/lessons page
        const exact = await cache.match(req);
        if (exact) return exact;
        const all = await cache.keys();
        const anyLessons = all.find((k) => new URL(k.url).pathname.startsWith('/admin/lessons'));
        if (anyLessons) {
          const r = await cache.match(anyLessons);
          if (r) return r;
        }
        return new Response('Offline — open this lesson while online at least once.', {
          status: 503, headers: { 'Content-Type': 'text/plain' },
        });
      }
    })());
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(req);
      const network = fetch(req).then((res) => {
        if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
        return res;
      }).catch(() => null);
      return cached || (await network) || new Response('', { status: 504 });
    })());
  }
});
