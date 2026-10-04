#!/usr/bin/env node
// scripts/ops-status.mjs — one-line state of the machine, as JSON, for the
// "queues" mod above the Claude Code prompt (5 Oct 2026, Adrian: "create a mod
// showing marking queue and twins progress") and for any session that wants it.
//
//   node scripts/ops-status.mjs        → {"marking":{…},"extraction":{…},"twins":{…},"at":"…"}
//
// Reads .env.local (SUPABASE_URL + SUPABASE_SECRET_KEY) — never prints them.
// Counts only (PostgREST `Prefer: count=exact`), no rows. The "twins left" numbers
// come from scripts/twins/twin.mjs and are slow, so they are cached for an hour.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = {};
for (const line of readFileSync(join(root, '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^"|"$/g, '').replace(/\\n$/, '');
}
const url = env.SUPABASE_URL;
const key = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.log(JSON.stringify({ error: 'no database keys in .env.local' })); process.exit(0); }

async function count(path) {
  try {
    const r = await fetch(`${url}/rest/v1/${path}`, {
      method: 'HEAD',
      headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: 'count=exact' },
    });
    const range = r.headers.get('content-range') || '';
    const n = Number(range.split('/')[1]);
    return Number.isFinite(n) ? n : null;
  } catch { return null; }
}

// Midnight in Singapore, as an ISO instant (16:00Z the day before).
const now = new Date();
const sgt = new Date(now.getTime() + 8 * 3600_000);
const sgtMidnight = new Date(Date.UTC(sgt.getUTCFullYear(), sgt.getUTCMonth(), sgt.getUTCDate()) - 8 * 3600_000).toISOString();

const [mQueued, mClaimed, eQueued, eClaimed, eDone, tToday, tTotal] = await Promise.all([
  count('paper_marking_runs?select=id&queue_status=eq.queued'),
  count('paper_marking_runs?select=id&queue_status=eq.claimed'),
  count('paper_library?select=id&kind=eq.source&status=eq.queued'),
  count('paper_library?select=id&kind=eq.source&status=eq.claimed'),
  count(`paper_library?select=id&kind=eq.source&status=eq.done&finished_at=gte.${sgtMidnight}`),
  count(`questions?select=id&school=eq.AdrianMath&exam_type=eq.Twin&created_at=gte.${sgtMidnight}`),
  count('questions?select=id&school=eq.AdrianMath&exam_type=eq.Twin'),
]);

// Twins still to write, per level the lanes are on (cached 15 min).
const cacheFile = join(tmpdir(), 'adrianmath-ops-status-twins.json');
let left = null;
try {
  if (existsSync(cacheFile)) {
    const c = JSON.parse(readFileSync(cacheFile, 'utf8'));
    if (Date.now() - c.at < 60 * 60_000) left = c.left;
  }
} catch { /* stale cache = recompute */ }
if (!left) {
  left = {};
  for (const level of ['S1', 'S2']) {
    // twin.mjs prints its count line on stderr ("S1: 139 sub-skills short of 3 twins (211 twins to write)").
    const r = spawnSync('node', [join(root, 'scripts/twins/twin.mjs'), 'queue', '--level', level, '--per-skill', '3', '--limit', '0'],
      { cwd: root, encoding: 'utf8', timeout: 60_000 });
    const m = `${r.stdout || ''}\n${r.stderr || ''}`.match(/\((\d+) twins to write\)/);
    left[level] = m ? Number(m[1]) : null;
  }
  if (Object.values(left).every((v) => v !== null)) {
    try { writeFileSync(cacheFile, JSON.stringify({ at: Date.now(), left })); } catch { /* fine */ }
  }
}

console.log(JSON.stringify({
  marking: { waiting: mQueued, marking: mClaimed },
  extraction: { waiting: eQueued, working: eClaimed, doneToday: eDone },
  twins: { today: tToday, total: tTotal, left },
  at: now.toISOString(),
}));
