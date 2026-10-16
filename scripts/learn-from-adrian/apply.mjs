#!/usr/bin/env node
// Learn from Adrian — carry out the ✅ Apply / 🗑 Drop taps (16 Oct 2026).
// Run by apply.sh (launchd com.adrianmath.learnapply, every 10 min while the Mac is on).
//
// 1. Read pending `learn_requests` rows (the bot writes one per tap). None → exit at once.
// 2. Claim each (pending → running).
// 3. Drop: no model — the group becomes "dropped" in ledger.json and its proposal branches
//    are deleted in both of the job's clones and on GitHub.
//    Apply: one headless Claude Code session (plan usage) following APPLY_PROMPT.md, which
//    writes {"ok", "line"} to a result file.
// 4. Row → done / failed with the line; the button becomes "✅ N · Applied" (or ❌), and a
//    short reply with the line goes under the message.
// Env: SUPABASE_URL, SUPABASE_SECRET_KEY, LFA_STATE, LFA_REPO, LFA_TODAY + Telegram (tg.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const STATE = process.env.LFA_STATE;
const SB = (process.env.SUPABASE_URL || '').trim().replace(/\/$/, '');
const KEY = (process.env.SUPABASE_SECRET_KEY || '').trim();
const TODAY = process.env.LFA_TODAY;
const MAX_MS = Number(process.env.LFA_APPLY_MAX_SEC || 1200) * 1000;
const log = (...a) => console.log(`[${new Date().toISOString()}]`, ...a);

async function rest(method, q, body) {
  const r = await fetch(`${SB}/rest/v1/learn_requests${q}`, {
    method, headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!r.ok) throw new Error(`learn_requests ${method} ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

function tg(...args) {
  try { execFileSync('node', [path.join(HERE, 'tg.mjs'), ...args], { stdio: 'inherit', env: process.env }); }
  catch (e) { log('telegram:', e.message); }
}

function titleFor(messageId, slug) {
  try {
    const saved = JSON.parse(fs.readFileSync(path.join(STATE, 'messages', `${messageId}.json`), 'utf8'));
    for (const row of (saved.kb || saved).inline_keyboard) for (const b of row) {
      if (b.callback_data === `lf:a:${slug}`) return String(b.text).replace(/^✅\s*Apply\s*/, '').replace(/^\d+$/, '').trim();
    }
  } catch { /* no saved keyboard */ }
  return '';
}

function setLedger(slug, patch) {
  const f = path.join(STATE, 'ledger.json');
  const l = JSON.parse(fs.readFileSync(f, 'utf8'));
  const g = (l.groups || []).find((x) => x.slug === slug);
  if (!g) return false;
  Object.assign(g, patch);
  fs.writeFileSync(f + '.tmp', JSON.stringify(l, null, 1));
  fs.renameSync(f + '.tmp', f);
  return true;
}

function drop(slug) {
  const known = setLedger(slug, { status: 'dropped', dropped_on: TODAY });
  for (const name of ['website', 'bot']) {
    const repo = path.join(STATE, 'repos', name);
    const git = (...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8' });
    try {
      git('fetch', '-q', '--prune', 'origin');
      const pat = `proposal/*-learn-${slug}`;
      for (const r of git('branch', '-r', '--list', `origin/${pat}`).split('\n').map((s) => s.trim()).filter(Boolean)) {
        git('push', '-q', 'origin', '--delete', r.replace(/^origin\//, ''));
      }
      for (const b of git('branch', '--list', pat).split('\n').map((s) => s.replace(/^[*+]?\s*/, '').trim()).filter(Boolean)) {
        git('branch', '-q', '-D', b);
      }
    } catch (e) { log(`drop ${slug} ${name}:`, e.message.split('\n')[0]); }
  }
  return { ok: true, line: known ? 'Dropped — it will not be raised again.' : 'Dropped.' };
}

function apply(slug, note) {
  if (!fs.existsSync(path.join(STATE, 'proposals', `${slug}.md`))) {
    return Promise.resolve({ ok: false, line: 'Could not find that idea any more — nothing changed.' });
  }
  const out = path.join(STATE, 'applied', `${slug}-${Date.now()}.json`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const prompt = fs.readFileSync(path.join(HERE, 'APPLY_PROMPT.md'), 'utf8')
    .replaceAll('{{SLUG}}', slug).replaceAll('{{TODAY}}', TODAY).replaceAll('{{STATE}}', STATE)
    .replaceAll('{{WEBSITE}}', process.env.LFA_REPO).replaceAll('{{OUT}}', out)
    .replaceAll('{{NOTE}}', note ? note.replace(/\s+/g, ' ').trim() : '(none — apply it as written)');
  return new Promise((resolve) => {
    const child = spawn('claude', ['-p', prompt,
      '--model', process.env.APPLY_MODEL || 'opus', '--effort', process.env.APPLY_EFFORT || 'medium',
      '--permission-mode', 'dontAsk', '--allowedTools', 'Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep',
      '--add-dir', process.env.LFA_REPO, path.join(STATE, 'repos'), '--setting-sources', 'user',
    ], { cwd: STATE, stdio: ['ignore', 'inherit', 'inherit'], env: process.env });
    const timer = setTimeout(() => child.kill('SIGTERM'), MAX_MS);
    child.on('close', (code) => {
      clearTimeout(timer);
      try { resolve(JSON.parse(fs.readFileSync(out, 'utf8'))); }
      catch { resolve({ ok: false, line: `Could not finish it (stopped with code ${code}). Tap Apply again later, or say "apply learn ${slug}" in a session.` }); }
    });
  });
}

async function main() {
  if (!SB || !KEY) throw new Error('no Supabase config in env — run install.sh again');
  const pending = await rest('GET', '?status=eq.pending&order=requested_at.asc&limit=10');
  if (!pending.length) return;
  for (const row of pending) {
    const claimed = await rest('PATCH', `?id=eq.${row.id}&status=eq.pending`, { status: 'running', claimed_at: new Date().toISOString() });
    if (!claimed.length) continue;   // another run took it
    log(`${row.action} ${row.slug} (request ${row.id})`);
    const name = (row.message_id ? titleFor(row.message_id, row.slug) : '') || row.slug.replace(/-/g, ' ');
    let res;
    try { res = row.action === 'drop' ? drop(row.slug) : await apply(row.slug, row.action === 'change' ? row.note : ''); }
    catch (e) { res = { ok: false, line: `Something went wrong: ${e.message.slice(0, 120)}` }; }
    await rest('PATCH', `?id=eq.${row.id}`, { status: res.ok ? 'done' : 'failed', result: res.line, finished_at: new Date().toISOString() });
    log(`→ ${res.ok ? 'done' : 'failed'}: ${res.line}`);
    if (row.message_id) {
      const label = row.action === 'drop' ? `🗑 Dropped: ${name}` : res.ok ? `✅ Applied: ${name}` : `❌ Not applied: ${name} — see the reply`;
      tg('mark', String(row.message_id), row.slug, label);
    }
    if (row.action !== 'drop') tg('reply', String(row.message_id || 0), `${res.ok ? '✅' : '❌'} ${name}: ${res.line}`);
  }
}

main().catch((e) => { log('FATAL', e.message); process.exit(1); });
