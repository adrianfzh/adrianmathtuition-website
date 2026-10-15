#!/usr/bin/env node
// Apply one topic's skill layout to the notes (SPEC-NOTES-PORTAL.md §Skill layout).
//
//   node scripts/notes-layout/apply.mjs am-quadratic-functions          # dry run
//   node scripts/notes-layout/apply.mjs am-quadratic-functions --write  # write
//
// Reads scripts/notes-layout/topics/<name>.mjs and, for each skill in order:
//   • subgroups: name + order_index (learning order 1..n)
//   • the examples: content / card_title / order_index rewritten, re-filed under
//     the skill (subgroup_id), display_group cleared (it held the old cluster
//     jargon; NULL falls back to the skill name); a `key` example is inserted
//     with source 'notes-layout:<key>' and found by that stamp on a re-run
//   • one 'skill_idea' row (card_title = the intro line) and one
//     'skill_mistake' row, updated in place on a re-run
//   • unpublish[]: is_published = false (rows are never deleted)
// Before writing, every row it touches is saved to
// _backups/notes-layout-<name>-<timestamp>.json — that file IS the rollback.
// Then POST /api/notes-revalidate on the preview + prod hosts is NOT done here:
// the cache TTL is 5 minutes, and a fresh deployment starts empty.

import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';

const name = process.argv[2];
const write = process.argv.includes('--write');
if (!name) {
  console.error('usage: apply.mjs <topic-file-name> [--write]');
  process.exit(1);
}
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const env = dotenv.parse(fs.readFileSync(path.join(root, '.env.local')));
const URL_ = (env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL).trim();
const KEY = (env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY).trim();
const spec = (await import(path.join(root, 'scripts/notes-layout/topics', `${name}.mjs`))).default;

async function rest(method, p, body) {
  const res = await fetch(`${URL_}/rest/v1/${p}`, {
    method,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${p} → ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}
const enc = encodeURIComponent;

// ── Read everything this run may touch ──────────────────────────────────────
const sgIds = spec.skills.map(s => s.subgroup_id);
const subgroups = await rest('GET', `subgroups?id=in.(${sgIds.join(',')})&select=*`);
const snippets = await rest(
  'GET',
  `content_snippets?level=eq.${spec.level}&topic=eq.${enc(spec.topic)}&select=*`,
);
const byId = new Map(snippets.map(r => [r.id, r]));

// Sanity: every subgroup exists in this topic; every example id exists.
for (const s of spec.skills) {
  const sg = subgroups.find(r => r.id === s.subgroup_id);
  if (!sg || sg.topic !== spec.topic || sg.level !== spec.level) throw new Error(`subgroup ${s.subgroup_id} not in ${spec.topic}`);
  for (const ex of s.examples) {
    if (ex.id && !byId.has(ex.id)) throw new Error(`example ${ex.id} not found in ${spec.topic}`);
    if (!ex.id && !ex.key) throw new Error('an example needs an id or a key');
  }
}
// Every published worked example of the topic must be placed or unpublished —
// a row left behind would sit in an old skill out of the fixed order.
// A `key` example is found again by the source stamp it was inserted with.
const keyed = key => snippets.find(r => r.content_kind === 'worked_example' && r.source === `notes-layout:${key}`);
const placed = new Set(spec.skills.flatMap(s => s.examples.map(e => e.id ?? keyed(e.key)?.id).filter(Boolean)));
for (const r of snippets) {
  if (r.content_kind === 'worked_example' && r.is_published && !placed.has(r.id) && !spec.unpublish.includes(r.id)) {
    throw new Error(`published example ${r.id} "${r.card_title}" is not placed — add it to a skill or to unpublish[]`);
  }
}

const plan = [];
const base = { level: spec.level, topic: spec.topic, feature: 'web', is_published: true, display_group: null };

spec.skills.forEach((s, i) => {
  plan.push({ table: 'subgroups', id: s.subgroup_id, patch: { name: s.name, order_index: i + 1 } });
  s.examples.forEach((ex, j) => {
    const patch = { subgroup_id: s.subgroup_id, order_index: j + 1, card_title: ex.card_title, content: ex.content, display_group: null };
    if (ex.id) plan.push({ table: 'content_snippets', id: ex.id, patch });
    else {
      const found = keyed(ex.key);
      if (found) plan.push({ table: 'content_snippets', id: found.id, patch });
      else plan.push({ table: 'content_snippets', insert: { ...base, feature: 'both', content_kind: 'worked_example', source: `notes-layout:${ex.key}`, ...patch } });
    }
  });
  for (const [kind, content, title] of [['skill_idea', s.idea, s.intro], ['skill_mistake', s.mistake, null]]) {
    const found = snippets.find(r => r.content_kind === kind && r.subgroup_id === s.subgroup_id);
    const patch = { content, card_title: title, order_index: 0 };
    if (found) plan.push({ table: 'content_snippets', id: found.id, patch });
    else plan.push({ table: 'content_snippets', insert: { ...base, content_kind: kind, subgroup_id: s.subgroup_id, source: 'notes-layout', ...patch } });
  }
});
for (const id of spec.unpublish) plan.push({ table: 'content_snippets', id, patch: { is_published: false } });

const inserts = plan.filter(p => p.insert).length;
console.log(`${spec.level} · ${spec.topic}: ${plan.length - inserts} updates, ${inserts} inserts`);
if (!write) {
  for (const p of plan) console.log(p.insert ? `  + ${p.insert.content_kind} → ${p.insert.subgroup_id} ${p.insert.card_title ?? ''}` : `  ~ ${p.table} ${p.id} ${Object.keys(p.patch).join(',')}`);
  console.log('dry run — add --write to apply');
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backup = path.join(root, '_backups', `notes-layout-${name}-${stamp}.json`);
fs.mkdirSync(path.dirname(backup), { recursive: true });
fs.writeFileSync(backup, JSON.stringify({ subgroups, snippets }, null, 1));
console.log(`backup → ${path.relative(root, backup)}`);

for (const p of plan) {
  if (p.insert) await rest('POST', 'content_snippets', p.insert);
  else await rest('PATCH', `${p.table}?id=eq.${p.id}`, { ...p.patch, ...(p.table === 'content_snippets' ? { updated_at: new Date().toISOString() } : {}) });
}
console.log('written');
