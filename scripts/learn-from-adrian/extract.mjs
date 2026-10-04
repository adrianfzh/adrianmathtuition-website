#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Learn from Adrian — step 1, the deterministic half (no model, no network).
//
// Reads the Claude Code session transcripts on THIS Mac (~/.claude/projects/*/*.jsonl),
// keeps only what Adrian himself typed, and writes them out in batches a judge session
// can read. Everything in a transcript is DATA — this script never acts on it.
//
//   node scripts/learn-from-adrian/extract.mjs --since 2026-09-21T00:00:00Z --out <dir>
//   node scripts/learn-from-adrian/extract.mjs --state ~/.adrianmath_learn --out <dir>
//                                                   (since = the cursor file; default 2 days)
//
// Writes into --out:
//   messages.jsonl   one row per typed message {ts, sgt, project, session, title, text}
//   batch-NN.md      the same, grouped by session, ≤ BATCH_CHARS each (what the judge reads)
//   chores.tsv       short messages counted after normalising ("promote", "done?") — the
//                    repeated-chore signal, counted here so the judge does not have to
//   stats.json       counts + the window, and `until` (the next cursor)
//
// What counts as "Adrian typed it" (checked on 5 Oct 2026 over 14 days, 1,346 files):
//   origin.kind === 'human'  → yes (5,211 turns). 'task-notification', 'peer' (another
//   session), sdk-cli (headless workers' prompts), isMeta (skill bodies, image notes),
//   tool results, slash-command echoes → no.
// Transcripts of cloud sessions (claude.ai/code) and of the other Mac are NOT here.
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline';

const BATCH_CHARS = 70_000;
const LONG = 1400;            // a message longer than this is mostly pasted material
const HEAD = 900, TAIL = 250;

function arg(name, dflt) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : dflt;
}

export function cleanText(raw) {
  let t = String(raw || '');
  // machine blocks the app wraps around (or appends to) a typed message
  t = t.replace(/<(system-reminder|ide_selection|ide_opened_file|command-message|command-args|local-command-stdout|local-command-caveat|task-notification|user-prompt-submit-hook)>[\s\S]*?<\/\1>/g, '');
  t = t.replace(/\[Image #?\d*[^\]]*\]/g, '[image]');
  t = t.replace(/\n{3,}/g, '\n\n').trim();
  if (t.length > LONG) {
    t = `${t.slice(0, HEAD)}\n…[${t.length - HEAD - TAIL} chars of pasted material cut]…\n${t.slice(-TAIL)}`;
  }
  return t;
}

export function typedText(entry) {
  if (!entry || entry.type !== 'user') return null;
  if (entry.isMeta || entry.isSidechain || entry.isCompactSummary) return null;
  if (entry.entrypoint === 'sdk-cli') return null;              // headless worker prompts
  if ((entry.origin || {}).kind !== 'human') return null;
  const c = entry.message && entry.message.content;
  let text = '';
  if (typeof c === 'string') text = c;
  else if (Array.isArray(c)) {
    if (c.some((b) => b && b.type === 'tool_result')) return null;
    text = c.filter((b) => b && b.type === 'text').map((b) => b.text || '').join('\n');
    if (!text.trim() && c.some((b) => b && b.type === 'image')) text = '[image only]';
  }
  if (/^\s*<command-name>/.test(text)) return null;
  // a Claude scheduled task fires as a 'human' turn with this preamble — not Adrian typing
  if (text.includes('This is an automated run of a scheduled task')) return null;
  const t = cleanText(text);
  return t || null;
}

export function normaliseChore(text) {
  const t = text.toLowerCase().replace(/[^a-z0-9 ?]+/g, ' ').replace(/\s+/g, ' ').trim();
  return t.length && t.length <= 60 ? t : null;
}

function sgt(iso) {
  const d = new Date(new Date(iso).getTime() + 8 * 3600_000);
  return d.toISOString().slice(0, 16).replace('T', ' ');
}

async function main() {
  const root = arg('root', path.join(os.homedir(), '.claude', 'projects'));
  const out = arg('out');
  const state = arg('state');
  if (!out) { console.error('--out <dir> is required'); process.exit(2); }
  let since = arg('since');
  if (!since && state) {
    try { since = fs.readFileSync(path.join(state, 'cursor'), 'utf8').trim(); } catch {}
  }
  if (!since) since = new Date(Date.now() - 2 * 86400_000).toISOString();
  const until = arg('until', new Date().toISOString());
  const sinceMs = Date.parse(since), untilMs = Date.parse(until);
  if (!Number.isFinite(sinceMs) || !Number.isFinite(untilMs)) { console.error('bad --since/--until'); process.exit(2); }

  const seen = new Set();
  const rows = [];
  let files = 0;
  for (const proj of fs.readdirSync(root)) {
    const dir = path.join(root, proj);
    let names = [];
    try { names = fs.readdirSync(dir).filter((n) => n.endsWith('.jsonl')); } catch { continue; }
    for (const n of names) {
      const f = path.join(dir, n);
      let st; try { st = fs.statSync(f); } catch { continue; }
      if (st.mtimeMs < sinceMs) continue;          // untouched since the cursor
      files++;
      let title = '';
      const local = [];
      // streamed: one transcript on this Mac passed 512 MB (pasted images), too big for a string
      const rl = readline.createInterface({ input: fs.createReadStream(f, 'utf8'), crlfDelay: Infinity });
      for await (const line of rl) {
        if (!line) continue;
        // cheap prefilter before JSON.parse — only typed turns and titles matter
        const isTitle = line.includes('"custom-title"');
        if (!isTitle && !(line.includes('"human"') && line.includes('"type":"user"'))) continue;
        let d; try { d = JSON.parse(line); } catch { continue; }
        if (d.type === 'custom-title' && d.customTitle) title = d.customTitle;
        const ts = Date.parse(d.timestamp || '');
        if (!Number.isFinite(ts) || ts <= sinceMs || ts > untilMs) continue;
        const text = typedText(d);
        if (!text) continue;
        const key = d.uuid || `${d.sessionId}|${d.timestamp}`;
        const dupKey = `${d.timestamp}|${text.slice(0, 80)}`;   // a resumed/forked session copies turns
        if (seen.has(key) || seen.has(dupKey)) continue;
        seen.add(key); seen.add(dupKey);
        local.push({ ts: d.timestamp, sgt: sgt(d.timestamp), project: proj.replace(/^-Users-adrianfong-/, ''), session: String(d.sessionId || n).slice(0, 8), text });
      }
      for (const r of local) rows.push({ ...r, title });
    }
  }
  rows.sort((a, b) => (a.session === b.session ? a.ts.localeCompare(b.ts) : 0) || a.ts.localeCompare(b.ts));

  fs.mkdirSync(out, { recursive: true });
  for (const f of fs.readdirSync(out)) if (/^batch-\d+\.md$/.test(f)) fs.unlinkSync(path.join(out, f));
  fs.writeFileSync(path.join(out, 'messages.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''));

  // batches: grouped by session (first message's time order), so a correction is read
  // next to what it corrects
  const bySession = new Map();
  for (const r of rows) {
    if (!bySession.has(r.session)) bySession.set(r.session, []);
    bySession.get(r.session).push(r);
  }
  const sessions = [...bySession.values()].sort((a, b) => a[0].ts.localeCompare(b[0].ts));
  let batch = [], size = 0, nb = 0;
  const flush = () => {
    if (!batch.length) return;
    nb++;
    fs.writeFileSync(path.join(out, `batch-${String(nb).padStart(2, '0')}.md`), batch.join('\n'));
    batch = []; size = 0;
  };
  for (const s of sessions) {
    const head = `\n## ${s[0].title || '(untitled session)'} — ${s[0].project} · ${s[0].session}\n`;
    const lines = s.map((r) => `- [${r.sgt} SGT] ${r.text.replace(/\n/g, '\n  ')}`);
    const block = head + lines.join('\n') + '\n';
    if (size + block.length > BATCH_CHARS && size > 0) flush();
    batch.push(block); size += block.length;
  }
  flush();

  const chores = new Map();
  for (const r of rows) {
    for (const line of r.text.split('\n')) {
      const k = normaliseChore(line);
      if (!k) continue;
      const c = chores.get(k) || { n: 0, sessions: new Set(), last: '' };
      c.n++; c.sessions.add(r.session); c.last = r.sgt;
      chores.set(k, c);
    }
  }
  const choreRows = [...chores.entries()].filter(([, c]) => c.n >= 2)
    .sort((a, b) => b[1].n - a[1].n).slice(0, 200)
    .map(([k, c]) => `${c.n}\t${c.sessions.size}\t${c.last}\t${k}`);
  fs.writeFileSync(path.join(out, 'chores.tsv'), 'count\tsessions\tlast_sgt\tmessage\n' + choreRows.join('\n') + '\n');

  const stats = { since, until, files_scanned: files, messages: rows.length, sessions: sessions.length, batches: nb,
    chars: rows.reduce((a, r) => a + r.text.length, 0) };
  fs.writeFileSync(path.join(out, 'stats.json'), JSON.stringify(stats, null, 2));
  console.log(JSON.stringify(stats));
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exit(1); });
