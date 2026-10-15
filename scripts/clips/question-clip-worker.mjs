#!/usr/bin/env node
// Question clips — the queue runner (SPEC-CLIP-PIPELINE.md §9). Claims the oldest `queued`
// row of question_clips and runs scripts/clips/question-clip.mjs on it, one clip at a time
// per worker (each clip already runs two writers in parallel), forever or --once.
//
//   node scripts/clips/question-clip-worker.mjs [--once] [--base http://localhost:3211] [--every 30]
//
// The claim is a conditional update (status queued → making, only if still queued), so two
// workers never take the same question. A row left `making` for 40 minutes (a crashed run)
// goes back to `queued` once; a second crash fails it.
// Logbook: every finished clip stamps job_runs 'question-clips' (question-clip.mjs); this
// loop stamps 'question-clips-worker' at most once an hour, idle or not, so a dead worker
// alarms by absence (JOB_RHYTHMS in lib/job-health.ts).
// Where it runs: the Mac (launchd, scripts/clips/com.adrianmath.questionclips.plist) — it needs
// the `claude` CLI signed in, Chrome, ffmpeg and a site to play clips on (--base).

import os from 'node:os';
import { spawn } from 'node:child_process';
import { ROOT, parseArgs, resolveSupabase } from '../lessons/shared.mjs';

const args = parseArgs(process.argv.slice(2));
const BASE = String(args.base || 'http://localhost:3211');
const EVERY_S = Number(args.every || 30);
const STALE_MIN = 40;
const WORKER = `${os.hostname().split('.')[0]}:${process.pid}`;
const sb = resolveSupabase();
const H = { apikey: sb.key, Authorization: `Bearer ${sb.key}`, 'Content-Type': 'application/json' };
const rest = async (p, init = {}) => {
  const r = await fetch(`${sb.url}/rest/v1/${p}`, { ...init, headers: { ...H, ...(init.headers || {}) } });
  const t = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : null;
};
let lastBeat = 0;
async function heartbeat(summary) {
  if (Date.now() - lastBeat < 3600_000) return;
  lastBeat = Date.now();
  await rest('job_runs', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ job: 'question-clips-worker', ok: true, summary }) }).catch(() => {});
}

async function requeueStale() {
  const cutoff = new Date(Date.now() - STALE_MIN * 60_000).toISOString();
  const stale = await rest(`question_clips?status=eq.making&started_at=lt.${cutoff}&select=question_id,attempts`);
  for (const s of stale) {
    const next = s.attempts >= 2 ? { status: 'failed', fail_reason: 'the run stopped twice without finishing' } : { status: 'queued' };
    await rest(`question_clips?question_id=eq.${s.question_id}&status=eq.making`, { method: 'PATCH', body: JSON.stringify({ ...next, updated_at: new Date().toISOString() }) });
  }
}

async function claim() {
  const [next] = await rest('question_clips?status=eq.queued&order=requested_at.asc&limit=1&select=question_id');
  if (!next) return null;
  const got = await rest(`question_clips?question_id=eq.${next.question_id}&status=eq.queued`, {
    method: 'PATCH', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ status: 'making', claimed_by: WORKER, started_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
  });
  return got?.[0]?.question_id ?? null;
}

const run = (qid) => new Promise((resolve) => {
  const child = spawn('node', ['scripts/clips/question-clip.mjs', qid, '--base', BASE, '--worker', WORKER], { cwd: ROOT, stdio: 'inherit' });
  child.on('close', code => resolve(code));
});

for (;;) {
  try {
    await requeueStale();
    const qid = await claim();
    if (qid) {
      console.log(`[worker] ${new Date().toISOString()} claimed ${qid}`);
      await run(qid);
      await heartbeat(`made ${qid}`);
      continue;
    }
    await heartbeat('idle — queue empty');
  } catch (e) {
    console.error(`[worker] ${e.message}`);
  }
  if (args.once) break;
  await new Promise(r => setTimeout(r, EVERY_S * 1000));
}
