// Server-side reads for /admin/overnight (lib/overnight.ts holds the pure parts).
//
// • The open proposals: the BOT serves its ledger's open rows (bot GET /api/internal/proposals,
//   Bearer BOT_INTERNAL_SECRET — 12 Oct 2026), so no GitHub key is needed. Only if the bot cannot
//   be reached, the ledger is read from GitHub (needs GITHUB_TOKEN — the repo is private).
// • Waking the Fly worker after a tap: the same Machines-API call as the bot's
//   lib/fly-worker.js wakeWorker, a no-op without FLY_WORKER_TOKEN. Without it the bot's
//   once-a-minute check starts the worker for a waiting request anyway (bot wakeForWaitingWork).

import { fromBotProposals, openProposals, type OpenProposal } from './overnight';
import { sgtTodayISO } from './sgt';

const LEDGER_REPO = 'adrianfzh/adrianmath-telegram-bot';
const LEDGER_PATH = 'docs/PROPOSALS.md';
const TTL_MS = 2 * 60_000;

type Open = { ok: true; open: OpenProposal[]; from: 'bot' | 'github' } | { ok: false; error: string };
let cache: { at: number; value: Open & { ok: true } } | null = null;

const env = (k: string) => (process.env[k] || '').trim().replace(/^["']|["']$/g, '');

async function fromBot(): Promise<Open> {
  const base = env('BOT_BASE_URL').replace(/\/$/, '');
  const secret = env('BOT_INTERNAL_SECRET');
  if (!base || !secret) return { ok: false, error: 'the bot address is not set on the website' };
  try {
    const r = await fetch(`${base}/api/internal/proposals`, {
      headers: { Authorization: `Bearer ${secret}` }, cache: 'no-store', signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return { ok: false, error: `the bot said HTTP ${r.status}` };
    const d = (await r.json()) as { ok?: boolean; proposals?: unknown };
    if (!d || d.ok !== true || !Array.isArray(d.proposals)) return { ok: false, error: 'the bot sent no list' };
    return { ok: true, open: fromBotProposals(d.proposals), from: 'bot' };
  } catch (e) { return { ok: false, error: `the bot did not answer (${(e as Error).message})` }; }
}

async function fromGitHub(): Promise<Open> {
  const token = env('GITHUB_TOKEN');
  if (!token) return { ok: false, error: 'no GitHub key' };
  try {
    const r = await fetch(`https://api.github.com/repos/${LEDGER_REPO}/contents/${LEDGER_PATH}?ref=main`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.raw', 'User-Agent': 'adrianmath-overnight' },
      cache: 'no-store', signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return { ok: false, error: `GitHub said HTTP ${r.status}` };
    const text = await r.text();
    if (!text.includes('| slug |')) return { ok: false, error: 'GitHub sent something else' };
    return { ok: true, open: openProposals(text, sgtTodayISO()), from: 'github' };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

/** The open proposals, cached two minutes. `fresh` skips the cache (before a tap is checked). */
export async function readOpenProposals({ fresh = false } = {}): Promise<Open> {
  if (!fresh && cache && Date.now() - cache.at < TTL_MS) return cache.value;
  const bot = await fromBot();
  const got = bot.ok ? bot : await fromGitHub();
  if (got.ok) { cache = { at: Date.now(), value: got }; return got; }
  if (cache) return cache.value;   // an older copy beats nothing
  return { ok: false, error: bot.ok ? got.error : bot.error };
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
