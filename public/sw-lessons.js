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
// v3: image cache previously stored opaque (no-cors) responses, which render in <img>
// but break the DOCX export's fetch() (status 0, empty body). Bump clears them.
const CACHE_VERSION = 'v3';
const CACHE_NAME = CACHE_PREFIX + CACHE_VERSION;
const IMG_CACHE_NAME = CACHE_PREFIX + 'images-' + CACHE_VERSION;

// Hosts whose images we cache for offline use. Supabase storage serves the
// question_images bucket; the path includes '/storage/v1/object/public/question_images/'.
// We cache anything from the bucket so stem + solution diagrams both work offline.
const IMAGE_ALLOWED_HOSTS = ['nempslbewxtlikfzachi.supabase.co'];

function isQuestionImage(url) {
  if (!IMAGE_ALLOWED_HOSTS.includes(url.host)) return false;
  return url.pathname.includes('/question_images/');
}

self.addEventListener('install', (event) => {
  // Activate as soon as installed — we have only one client per session.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME && k !== IMG_CACHE_NAME)
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

  // Cross-origin: only intervene for the question-image bucket.
  if (url.origin !== self.location.origin) {
    if (!isQuestionImage(url)) return;
    event.respondWith((async () => {
      const cache = await caches.open(IMG_CACHE_NAME);
      const cached = await cache.match(req);
      // An OPAQUE cached response (from a no-cors fetch, status 0) renders fine in
      // <img> but is useless to the page's fetch() — the DOCX export reads it as a
      // failure. Only serve an opaque hit when the request itself is no-cors.
      if (cached && (cached.type !== 'opaque' || req.mode === 'no-cors')) {
        // Opportunistically refresh with a proper CORS fetch (the bucket sends
        // Access-Control-Allow-Origin: *), upgrading any old opaque entry.
        fetch(req.url, { mode: 'cors' }).then((res) => {
          if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
        }).catch(() => {});
        return cached;
      }
      try {
        const fresh = await fetch(req.url, { mode: 'cors' });
        if (fresh && fresh.ok) {
          cache.put(req, fresh.clone()).catch(() => {});
          return fresh;
        }
        throw new Error('cors fetch not ok');
      } catch {
        // Last resort: an opaque fetch still lets <img> render (it just can't
        // satisfy a page fetch()). Don't cache it — a later CORS success should win.
        try {
          return await fetch(req, { mode: 'no-cors' });
        } catch {
          return cached || new Response('', { status: 504 });
        }
      }
    })());
    return;
  }

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
