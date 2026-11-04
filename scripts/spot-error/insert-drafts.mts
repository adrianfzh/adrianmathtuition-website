// scripts/spot-error/insert-drafts.mts — check spot-the-error drafts and save
// them as WAITING learning units (status 'pending') for Adrian's review on
// /admin/spot-error (SPEC-SPOT-ERROR.md §3).
//
//   npx tsx scripts/spot-error/insert-drafts.mts --drafts drafts.json [--briefs briefs.json] [--apply]
//
// drafts.json = SpotDraft[] (lib/spot-error). A 'marked' draft must name its
// brief by payload.key and --briefs must hold that brief: the novelty check
// (no copied line, no reused distinctive number, no copied wording) runs
// against it. Every draft is shape-checked against topic_spine. A key that is
// already a unit is skipped. Dry run unless --apply. Nothing is ever approved
// here — approval is Adrian's, one card at a time.
import fs from 'node:fs';
import { sb, arg, argv } from './env.mjs';
import { draftProblems, noveltyProblems, SPOT_ORIGIN, type SpotBrief, type SpotDraft } from '../../src/lib/spot-error';

const APPLY = argv.includes('--apply');
const draftsPath = arg('--drafts');
if (!draftsPath) { console.error('--drafts <file> required'); process.exit(1); }
const drafts = JSON.parse(fs.readFileSync(draftsPath, 'utf8')) as SpotDraft[];
const briefsPath = arg('--briefs');
const briefs = new Map<string, SpotBrief>(
  briefsPath ? (JSON.parse(fs.readFileSync(briefsPath, 'utf8')) as SpotBrief[]).map(b => [b.key, b]) : [],
);

const { data: spine } = await sb.from('topic_spine').select('subject, topic');
const spineSet = new Set((spine ?? []).map(s => `${s.subject}|${s.topic}`));
const { data: used } = await sb.from('learning_units').select('payload->>key').eq('payload->>origin', SPOT_ORIGIN);
const usedKeys = new Set((used ?? []).map(u => (u as Record<string, string>).key));

let ok = 0, bad = 0;
for (const d of drafts) {
  const problems = draftProblems(d, spineSet);
  if (d.payload?.source === 'marked') {
    const src = briefs.get(d.payload.key);
    if (!src) problems.push(`no brief for key ${d.payload.key} — pass --briefs`);
    else problems.push(...noveltyProblems(d, src));
  }
  if (usedKeys.has(d.payload?.key)) { console.log(`skip  ${d.title} — key already a unit`); continue; }
  if (problems.length) { bad++; console.log(`✗ ${d.title}\n    ${problems.join('\n    ')}`); continue; }

  // Slot: after the topic's last unit, so it reads at the end of the topic
  // until Adrian drags it (hold-and-drag on /notes).
  const { data: last } = await sb.from('learning_units').select('unit_order')
    .eq('subject', d.subject).eq('topic', d.topic).order('unit_order', { ascending: false }).limit(1);
  const order = Math.round(((Number(last?.[0]?.unit_order) || 0) + 0.5) * 100) / 100;
  ok++;
  if (!APPLY) { console.log(`✓ ${d.title} (${d.subject} / ${d.topic}, order ${order}) — dry run`); continue; }
  const { error } = await sb.from('learning_units').insert({
    subject: d.subject, topic: d.topic, kind: 'autopsy', title: d.title,
    unit_order: order, status: 'pending', payload: d.payload,
  });
  if (error) { bad++; ok--; console.log(`✗ ${d.title} — ${error.message}`); continue; }
  usedKeys.add(d.payload.key);
  console.log(`✓ ${d.title} saved as waiting (${d.subject} / ${d.topic})`);
}
console.log(`${ok} ok, ${bad} refused${APPLY ? '' : ' (dry run — add --apply to save)'}`);
