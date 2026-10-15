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
if (!url || !key) { // Science twins still to write to reach 3 per sub-skill, per subject (pure + combined
// together) — the same science_twin_units() the science lane reads. Cached an hour too.
const sciCacheFile = join(tmpdir(), 'adrianmath-ops-status-sci-twins.json');
let sciLeft = null;
try {
  if (existsSync(sciCacheFile)) {
    const c = JSON.parse(readFileSync(sciCacheFile, 'utf8'));
    if (Date.now() - c.at < 60 * 60_000) sciLeft = c.left;
  }
} catch { /* stale cache = recompute */ }
if (!sciLeft && sciUrl && sciKey) {
  try {
    const r = await fetch(`${sciUrl}/rest/v1/rpc/science_twin_units`, {
      method: 'POST',
      headers: { apikey: sciKey, Authorization: `Bearer ${sciKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ open_topics: {}, per_skill: 3 }),
    });
    const rows = r.ok ? await r.json() : null;
    if (Array.isArray(rows)) {
      sciLeft = { Phys: 0, Chem: 0, Bio: 0 };
      const name = { physics: 'Phys', chemistry: 'Chem', biology: 'Bio' };
      // Only sub-skills that have a seed question can be written (sci-twin.mjs gapSummary).
      for (const u of rows) if (u.seed_count && name[u.subject]) sciLeft[name[u.subject]] += u.need || 0;
      try { writeFileSync(sciCacheFile, JSON.stringify({ at: Date.now(), left: sciLeft })); } catch { /* fine */ }
    }
  } catch { /* shown as ? */ }
}

console.log(JSON.stringify({ error: 'no database keys in .env.local' })); process.exit(0); }

// Science lives in its own database (SUPABASE_URL_SCIENCE).
const sciUrl = env.SUPABASE_URL_SCIENCE;
const sciKey = env.SUPABASE_SERVICE_KEY_SCIENCE;

async function count(path, base = url, k = key) {
  if (!base || !k) return null;
  try {
    const r = await fetch(`${base}/rest/v1/${path}`, {
      method: 'HEAD',
      headers: { apikey: k, Authorization: `Bearer ${k}`, Prefer: 'count=exact' },
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

const [mQueued, mClaimed, eQueued, eClaimed, eDone, tToday, tTotal, sToday] = await Promise.all([
  count('paper_marking_runs?select=id&queue_status=eq.queued'),
  count('paper_marking_runs?select=id&queue_status=eq.claimed'),
  count('paper_library?select=id&kind=eq.source&status=eq.queued'),
  count('paper_library?select=id&kind=eq.source&status=eq.claimed'),
  count(`paper_library?select=id&kind=eq.source&status=eq.done&finished_at=gte.${sgtMidnight}`),
  count(`questions?select=id&school=eq.AdrianMath&exam_type=eq.Twin&created_at=gte.${sgtMidnight}`),
  count('questions?select=id&school=eq.AdrianMath&exam_type=eq.Twin'),
  count(`questions?select=id&school=eq.AdrianMath&exam_type=eq.Twin&created_at=gte.${sgtMidnight}`, sciUrl, sciKey),
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

// Science twins still to write to reach 3 per sub-skill, per subject (pure + combined
// together) — the same science_twin_units() the science lane reads. Cached an hour too.
const sciCacheFile = join(tmpdir(), 'adrianmath-ops-status-sci-twins.json');
let sciLeft = null;
try {
  if (existsSync(sciCacheFile)) {
    const c = JSON.parse(readFileSync(sciCacheFile, 'utf8'));
    if (Date.now() - c.at < 60 * 60_000) sciLeft = c.left;
  }
} catch { /* stale cache = recompute */ }
if (!sciLeft && sciUrl && sciKey) {
  try {
    const r = await fetch(`${sciUrl}/rest/v1/rpc/science_twin_units`, {
      method: 'POST',
      headers: { apikey: sciKey, Authorization: `Bearer ${sciKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ open_topics: {}, per_skill: 3 }),
    });
    const rows = r.ok ? await r.json() : null;
    if (Array.isArray(rows)) {
      sciLeft = { Phys: 0, Chem: 0, Bio: 0 };
      const name = { physics: 'Phys', chemistry: 'Chem', biology: 'Bio' };
      // Only sub-skills that have a seed question can be written (sci-twin.mjs gapSummary).
      for (const u of rows) if (u.seed_count && name[u.subject]) sciLeft[name[u.subject]] += u.need || 0;
      try { writeFileSync(sciCacheFile, JSON.stringify({ at: Date.now(), left: sciLeft })); } catch { /* fine */ }
    }
  } catch { /* shown as ? */ }
}

console.log(JSON.stringify({
  marking: { waiting: mQueued, marking: mClaimed },
  extraction: { waiting: eQueued, working: eClaimed, doneToday: eDone },
  twins: { today: tToday, total: tTotal, left },
  science: { today: sToday, left: sciLeft },
  at: now.toISOString(),
}));
