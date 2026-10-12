// Server-side reads for /admin/overnight (lib/overnight.ts holds the pure parts).
//
// • The proposals ledger lives in the BOT repo (docs/PROPOSALS.md on main). The repo is
//   private, so the read needs GITHUB_TOKEN (read-only, contents) in the Vercel env; without
//   it the public raw URL is tried and the page says it could not read the list.
// • Waking the Fly worker after a tap: the same Machines-API call as the bot's
//   lib/fly-worker.js wakeWorker (start every stopped machine of `adrianmath-worker`), and
//   like it a no-op without FLY_WORKER_TOKEN. Never throws, never delays the answer much.

const LEDGER_REPO = 'adrianfzh/adrianmath-telegram-bot';
const LEDGER_PATH = 'docs/PROPOSALS.md';
const TTL_MS = 2 * 60_000;

let cache: { at: number; text: string } | null = null;

const env = (k: string) => (process.env[k] || '').trim().replace(/^["']|["']$/g, '');

/** The ledger's markdown, cached two minutes. `fresh` skips the cache (after a tap). */
export async function readLedger({ fresh = false } = {}): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  if (!fresh && cache && Date.now() - cache.at < TTL_MS) return { ok: true, text: cache.text };
  const token = env('GITHUB_TOKEN');
  const tries: { url: string; headers: Record<string, string> }[] = [];
  if (token) {
    tries.push({
      url: `https://api.github.com/repos/${LEDGER_REPO}/contents/${LEDGER_PATH}?ref=main`,
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.raw', 'User-Agent': 'adrianmath-overnight' },
    });
  }
  tries.push({ url: `https://raw.githubusercontent.com/${LEDGER_REPO}/main/${LEDGER_PATH}`, headers: {} });
  let last = '';
  for (const t of tries) {
    try {
      const r = await fetch(t.url, { headers: t.headers, cache: 'no-store', signal: AbortSignal.timeout(8000) });
      if (!r.ok) { last = `HTTP ${r.status}`; continue; }
      const text = await r.text();
      if (!text.includes('| slug |')) { last = 'not the ledger'; continue; }
      cache = { at: Date.now(), text };
      return { ok: true, text };
    } catch (e) { last = (e as Error).message; }
  }
  if (cache) return { ok: true, text: cache.text };   // an older copy beats nothing
  return { ok: false, error: token ? `GitHub said ${last}` : 'no GitHub key on the website yet' };
}

/** Start the Fly worker (bot lib/fly-worker.js wakeWorker). 'started' | 'awake' | 'no key' | 'failed'. */
export async function wakeWorker(why: string): Promise<'started' | 'awake' | 'no key' | 'failed'> {
  const token = env('FLY_WORKER_TOKEN');
  if (!token) return 'no key';
  const app = env('FLY_WORKER_APP') || 'adrianmath-worker';
  const api = 'https://api.machines.dev/v1';
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  try {
    const r = await fetch(`${api}/apps/${app}/machines`, { headers, signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const machines = (await r.json()) as { id: string; state?: string }[];
    const stopped = (machines || []).filter((m) => m && m.state && m.state !== 'started' && m.state !== 'starting');
    for (const m of stopped) {
      await fetch(`${api}/apps/${app}/machines/${m.id}/start`, { method: 'POST', headers, signal: AbortSignal.timeout(8000) });
      console.log(`[overnight] started worker ${m.id} (${why})`);
    }
    return stopped.length ? 'started' : 'awake';
  } catch (e) {
    console.warn('[overnight] wake failed:', (e as Error).message);
    return 'failed';
  }
}
