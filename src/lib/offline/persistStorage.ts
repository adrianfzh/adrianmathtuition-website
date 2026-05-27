// Ask the browser for persistent storage so the cache isn't evicted under disk pressure.
//
// Browser behaviour:
//   - Chrome / Edge — auto-granted for engaged origins, no prompt.
//   - Firefox — shows a prompt the first time we ask.
//   - Safari — shows a "Storage is limited" prompt the first time we ask.
//
// The call is idempotent and cheap. We only ask if persistence hasn't already been granted,
// to avoid re-prompting users who might have declined.
//
// Result is cached in a module-level promise so concurrent calls don't pile up.

let _checked: Promise<boolean> | null = null;

export function requestPersistentStorage(): Promise<boolean> {
  if (_checked) return _checked;
  _checked = (async () => {
    if (typeof navigator === 'undefined') return false;
    const s = (navigator as Navigator).storage;
    if (!s || typeof s.persist !== 'function' || typeof s.persisted !== 'function') return false;
    try {
      if (await s.persisted()) return true;
      return await s.persist();
    } catch {
      return false;
    }
  })();
  return _checked;
}
