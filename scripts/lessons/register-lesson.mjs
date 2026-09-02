#!/usr/bin/env node
// Register a verified lesson: one static-import + registry line in
// src/lib/lesson-load.ts and one catalog row in src/lib/lesson-catalog.ts,
// written together so the coherence test (lesson-script.test.ts) keeps passing.
//
//   node scripts/lessons/register-lesson.mjs <slug> [--dry-run]
//
// Refuses when the slug is already registered in either file, and when the
// script fails validation (register only what verify-lesson passed). It is
// plain string surgery on two files with fixed anchors — if an anchor has
// moved, it says so and touches nothing.

import fs from 'node:fs';
import path from 'node:path';
import { ROOT, loadTs, readScriptArg, parseArgs, fmt } from './shared.mjs';

const args = parseArgs(process.argv.slice(2));
const slug = args._[0];
if (!slug || args.help) {
  console.error('usage: node scripts/lessons/register-lesson.mjs <slug> [--dry-run]');
  process.exit(2);
}

const { raw, slug: fileSlug } = readScriptArg(slug);
const { validateLessonScript } = await loadTs('src/lib/lesson-script.ts');
const result = validateLessonScript(raw);
if (!result.ok) {
  console.error(fmt.red(`data/lessons/${fileSlug}.json does not validate — run verify-lesson first:`));
  for (const e of result.errors) console.error(`  · ${e}`);
  process.exit(1);
}
const script = result.script;
if (script.slug !== fileSlug) {
  console.error(fmt.red(`script slug "${script.slug}" must match the file name "${fileSlug}"`));
  process.exit(1);
}

const LOAD = path.join(ROOT, 'src/lib/lesson-load.ts');
const CATALOG = path.join(ROOT, 'src/lib/lesson-catalog.ts');
const load = fs.readFileSync(LOAD, 'utf8');
const catalog = fs.readFileSync(CATALOG, 'utf8');

const slugLiteral = `'${slug}'`;
if (load.includes(slugLiteral) || catalog.includes(slugLiteral)) {
  console.error(fmt.red(`"${slug}" is already registered (${load.includes(slugLiteral) ? 'lesson-load.ts' : ''}${load.includes(slugLiteral) && catalog.includes(slugLiteral) ? ' + ' : ''}${catalog.includes(slugLiteral) ? 'lesson-catalog.ts' : ''}). Nothing changed.`));
  process.exit(1);
}

// The import identifier: kebab slug → camelCase, never colliding with an existing one.
const ident = slug.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
if (new RegExp(`\\bimport ${ident}\\b`).test(load)) {
  console.error(fmt.red(`identifier "${ident}" already imported in lesson-load.ts — rename the slug.`));
  process.exit(1);
}

// ── lesson-load.ts: import line after the last data/lessons import, registry row before `};`
const importRe = /^import \w+ from '\.\.\/\.\.\/data\/lessons\/[^']+\.json';$/gm;
let lastImport = null;
for (const m of load.matchAll(importRe)) lastImport = m;
if (!lastImport) fail('lesson-load.ts: no `import … from \'../../data/lessons/….json\'` line to anchor on');
const importLine = `import ${ident} from '../../data/lessons/${slug}.json';`;
const importAt = lastImport.index + lastImport[0].length;

const regStart = load.indexOf('const RAW_SCRIPTS: Record<string, unknown> = {');
if (regStart === -1) fail('lesson-load.ts: RAW_SCRIPTS block not found');
const regEnd = load.indexOf('\n};', regStart);
if (regEnd === -1) fail('lesson-load.ts: RAW_SCRIPTS block has no closing `};`');
const registryLine = `  '${slug}': ${ident},`;

const newLoad = load.slice(0, importAt) + '\n' + importLine + load.slice(importAt, regEnd) + '\n' + registryLine + load.slice(regEnd);

// ── lesson-catalog.ts: row before the array's closing `];`
const catStart = catalog.indexOf('export const LESSON_CATALOG: LessonCatalogEntry[] = [');
if (catStart === -1) fail('lesson-catalog.ts: LESSON_CATALOG array not found');
const catEnd = catalog.indexOf('\n];', catStart);
if (catEnd === -1) fail('lesson-catalog.ts: LESSON_CATALOG has no closing `];`');
const q = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const row = [
  '  {',
  `    slug: ${q(script.slug)},`,
  `    level: ${q(script.level)},`,
  `    topic: ${q(script.topic)},`,
  `    title: ${q(script.title)},`,
  `    minutes: ${script.minutes},`,
  '  },',
].join('\n');
const newCatalog = catalog.slice(0, catEnd) + '\n' + row + catalog.slice(catEnd);

console.log(`${fmt.bold(args['dry-run'] ? 'Would register' : 'Registering')} ${fmt.cyan(slug)} — "${script.title}" · ${script.level} · ${script.topic} · ${script.minutes} min`);
console.log(`  src/lib/lesson-load.ts     + ${importLine}`);
console.log(`                             + ${registryLine.trim()}`);
console.log(`  src/lib/lesson-catalog.ts  + { slug: ${q(script.slug)}, … }`);
if (args['dry-run']) process.exit(0);

fs.writeFileSync(LOAD, newLoad);
fs.writeFileSync(CATALOG, newCatalog);
console.log(fmt.green('Done.'), 'Next: `npx vitest run src/lib/lesson` (catalog coherence), then commit the three files together.');

function fail(msg) {
  console.error(fmt.red(msg));
  process.exit(1);
}
