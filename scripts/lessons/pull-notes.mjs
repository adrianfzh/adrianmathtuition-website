#!/usr/bin/env node
// The approved notes a lesson may draw its claims from — Adrian's learning
// units for one (level, topic), printed as readable text so an authoring
// session reads them instead of retyping them.
//
//   node scripts/lessons/pull-notes.mjs <level> <topic…> [--all] [--json]
//   e.g. node scripts/lessons/pull-notes.mjs AM Quadratic Functions
//
// Only status = 'approved' units count as a source of truth (--all shows the
// rest, tagged, for context — never as a claim). Quick checks (kind = check)
// are player material and are not listed. Figures are noted, not dumped.

import { supaGet, parseArgs, fmt } from './shared.mjs';

const args = parseArgs(process.argv.slice(2));
const level = (args._[0] || '').toUpperCase();
const topic = args._.slice(1).join(' ').trim();
if (!level || !topic) {
  console.error('usage: node scripts/lessons/pull-notes.mjs <level> <topic…> [--all] [--json]');
  process.exit(2);
}

const query = [
  'select=id,kind,title,unit_order,status,payload',
  `subject=eq.${encodeURIComponent(level)}`,
  `topic=eq.${encodeURIComponent(topic)}`,
  'kind=neq.check',
  ...(args.all ? [] : ['status=eq.approved']),
  'order=unit_order.asc',
].join('&');
const rows = await supaGet(`learning_units?${query}`);

if (args.json) { console.log(JSON.stringify(rows, null, 2)); process.exit(0); }

const approved = rows.filter(r => r.status === 'approved');
if (approved.length === 0) {
  console.error(fmt.yellow(`No approved learning units for ${level} · ${topic} — approve the topic on /notes first; a lesson cannot be drafted from unvetted notes.`));
  process.exit(1);
}

const KIND = { core: '💡 CORE', example: '✏️ EXAMPLE', autopsy: '⚠️ COMMON MISTAKE', try: '💪 TRY' };
const strip = (s) => (typeof s === 'string' ? s.trim() : '');
const line = (label, text) => { const t = strip(text); if (t) console.log(`  ${fmt.dim(label)} ${t.replace(/\n+/g, '\n      ')}`); };

console.log(`${fmt.bold(`${level} · ${topic}`)} — ${approved.length} approved unit(s)${args.all ? ` (${rows.length - approved.length} unapproved shown, tagged)` : ''}`);
for (const r of rows) {
  const p = r.payload && typeof r.payload === 'object' ? r.payload : {};
  const tag = r.status === 'approved' ? '' : fmt.yellow(` [${r.status ?? 'draft'} — NOT a source of claims]`);
  console.log(`\n${fmt.cyan(`${KIND[r.kind] ?? r.kind.toUpperCase()} ${r.unit_order ?? ''}`)} ${fmt.bold(r.title)}${tag}  ${fmt.dim(r.id)}`);
  if (p.title_q) line('asks:', p.title_q);
  switch (r.kind) {
    case 'core':
      line('summary:', p.summary_md);
      line('formula:', p.formula_md);
      line('remember:', p.remember_md);
      break;
    case 'example':
      line('problem:', p.problem_md);
      (p.steps ?? []).forEach((s, i) => {
        console.log(`  ${fmt.dim(`step ${i + 1}:`)} ${strip(s.label)}`);
        if (s.math) console.log(`      $$ ${strip(s.math)} $$`);
        if (s.annotation_md) console.log(`      ${fmt.dim('↳')} ${strip(s.annotation_md)}`);
        if (s.figure_svg) console.log(`      ${fmt.dim('(figure at this step)')}`);
      });
      line('answer:', p.answer_md);
      break;
    case 'autopsy':
      line('problem:', p.problem_md);
      (p.working ?? []).forEach((w, i) => console.log(`  ${i + 1 === p.wrong_line ? fmt.red(`✗ ${i + 1}.`) : fmt.dim(`  ${i + 1}.`)} ${strip(w)}`));
      line('why:', p.why_md);
      line('fix:', p.fix_md);
      break;
    case 'try':
      line('problem:', p.problem_md);
      line('answer:', p.answer_md);
      break;
    default:
      console.log(`  ${fmt.dim(JSON.stringify(p).slice(0, 300))}`);
  }
  if (p.figure_svg) console.log(`  ${fmt.dim('(has an authored figure — not reproducible in a lesson; describe the idea in words or a graph-morph)')}`);
  if (Array.isArray(p.figures) && p.figures.length) console.log(`  ${fmt.dim(`(${p.figures.length} extracted figure(s))`)}`);
}

const byKind = {};
for (const r of approved) byKind[r.kind] = (byKind[r.kind] ?? 0) + 1;
console.log(`\n${fmt.dim(`approved by kind: ${Object.entries(byKind).map(([k, v]) => `${v} ${k}`).join(' · ')}`)}`);
