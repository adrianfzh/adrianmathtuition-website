// One-shot service-worker registration for the lessons editor.
// Safe to call multiple times — browser dedupes by scope+url.
//
// SW lives at /public/sw-lessons.js. Scope = '/admin/lessons/' so it only intercepts
// the editor and its assets — no impact on the rest of the site.

export function registerLessonsServiceWorker(): void {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;
  // Disable in dev to avoid stale-bundle headaches with HMR.
  if (process.env.NODE_ENV !== 'production') return;
  // Register on idle so it doesn't compete with the editor's bootstrap.
  const start = () => {
    navigator.serviceWorker
      .register('/sw-lessons.js', { scope: '/admin/lessons/' })
      .catch((e) => { console.warn('lessons SW register failed', e); });
  };
  if ('requestIdleCallback' in window) {
    (window as unknown as { requestIdleCallback: (cb: () => void) => void }).requestIdleCallback(start);
  } else {
    setTimeout(start, 1500);
  }
}
