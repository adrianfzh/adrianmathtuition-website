#!/usr/bin/env node
// The authoring gate for animated lessons.
//
//   node scripts/lessons/verify-lesson.mjs <slug | path/to/lesson.json> [flags]
//
//   --offline             skip the bank lookup for check scenes (warns instead)
//   --require-narration   missing narration is an error, not a warning
//   --json                machine-readable report on stdout
//   --no-info             hide info-level notes
//
// Exit 0 only when there are no errors. What it checks, in order:
//   1. structure       validateLessonScript — the SAME validator the app runs
//   2. KaTeX           every token `tex` and every $…$ fragment renders (throwOnError)
//   3. assertions      the script's own `verify` lists (numeric / identity / graph-state)
//   4. graph-morph     finite coefficients, curves inside the window, sane ranges
//   5. craft           the pilot's rules — token-line length, teach-before-check, closer
//   6. narration       present, spoken English (no TeX), sane length; a beat scene's
//                      beats[].say one idea each (≤ ~40 words) and every line /
//                      callout / state shown by some beat (lib/lesson-verify.beatIssues)
//   7. checks          each qid exists, passes the practice eligibility gate, carries a
//                      short official answer that grades against itself, matches level
// Rules 3–7 live in src/lib/lesson-verify.ts (pure, unit-tested); this file only
// wires them to KaTeX and Supabase and prints the report.

import katex from 'katex';
import path from 'node:path';
import {
  ROOT, loadTs, supaGet, inList, readScriptArg, parseArgs, fmt,
} from './shared.mjs';

const args = parseArgs(process.argv.slice(2));
if (!args._[0] || args.help) {
  console.error('usage: node scripts/lessons/verify-lesson.mjs <slug|path> [--offline] [--require-narration] [--json] [--no-info]');
  process.exit(2);
}

const { path: file, slug: fileSlug, raw } = readScriptArg(args._[0]);
const [{ validateLessonScript, checkQids }, V, { CHECK_QUESTION_COLUMNS }] = await Promise.all([
  loadTs('src/lib/lesson-script.ts'),
  loadTs('src/lib/lesson-verify.ts'),
  loadTs('src/lib/lesson-load.ts'),
]);

const issues = [];
const push = (severity, where, message) => issues.push({ severity, where, message });
const stats = { tex: 0, assertions: [], checks: 0 };

// 1. structure — stop here if the shape is wrong; nothing else is meaningful.
const result = validateLessonScript(raw);
if (!result.ok) {
  for (const e of result.errors) push('error', 'structure', e);
  report(null);
}
const script = result.script;
if (script.slug !== fileSlug) push('error', 'slug', `script slug "${script.slug}" must match the file name "${fileSlug}"`);

// 2. KaTeX — same options as lib/math-markdown, but throwing.
const KATEX = { throwOnError: true, strict: false, trust: true, macros: { '\\tfrac': '\\frac', '\\usd': '\\$' } };
const { units, issues: texIssues } = V.texUnits(script);
issues.push(...texIssues);
for (const u of units) {
  try {
    katex.renderToString(u.tex, { ...KATEX, displayMode: u.display });
    stats.tex += 1;
  } catch (e) {
    push('error', u.where, `${String(e.message).replace(/^KaTeX parse error: /, 'KaTeX: ')} — in "${u.tex}"`);
  }
}

// 3. author assertions
stats.assertions = V.runAssertions(script);
for (const a of stats.assertions) if (!a.ok) push('error', a.where, `assertion failed: ${a.detail}`);

// 4. graph-morph sanity
script.scenes.forEach((s, i) => {
  if (s.type === 'graph-morph') issues.push(...V.graphIssues(s, `scenes[${i}] (graph-morph)`));
});

// 5 + 6. craft + narration
issues.push(...V.craftIssues(script));
issues.push(...V.narrationIssues(script, { require: Boolean(args['require-narration']) }));
issues.push(...V.beatIssues(script));

// 7. checks against the bank
const qids = checkQids(script);
if (qids.length > 0) {
  if (args.offline) {
    push('warn', 'checks', `${qids.length} check question(s) not verified (--offline) — run online before registering`);
  } else {
    try {
      const cols = encodeURIComponent(`${CHECK_QUESTION_COLUMNS}, level, topics`);
      const rows = await supaGet(`questions?select=${cols}&id=${inList(qids)}`);
      const map = new Map(rows.map(r => [r.id, r]));
      issues.push(...V.checkIssues(script, map));
      stats.checks = qids.filter(q => map.has(q)).length;
    } catch (e) {
      push('error', 'checks', `bank lookup failed: ${e.message} (pass --offline to skip)`);
    }
  }
}

report(script);

// ── Report ───────────────────────────────────────────────────────────────────
function report(script) {
  const { errors, warnings, infos } = V.summarize(issues);
  const shown = args['no-info'] ? issues.filter(i => i.severity !== 'info') : issues;
  const rel = path.relative(ROOT, file);
  if (args.json) {
    console.log(JSON.stringify({ file: rel, ok: errors === 0, errors, warnings, infos, issues, stats }, null, 2));
    process.exit(errors === 0 ? 0 : 1);
  }
  const beats = script ? script.scenes.reduce((n, s) => n + (Array.isArray(s.beats) ? s.beats.length : 0), 0) : 0;
  const head = script
    ? `${fmt.bold(script.title)} · ${script.level} · ${script.topic} · ${script.scenes.length} scenes${beats ? ` · ${beats} beats` : ''}${script.theme ? ` · ${script.theme}` : ''} · ${script.minutes} min`
    : fmt.dim('(did not validate)');
  console.log(`▶ ${rel} — ${head}`);
  if (script) {
    console.log(`  KaTeX: ${stats.tex}/${units.length} units rendered`);
    const okCount = stats.assertions.filter(a => a.ok).length;
    console.log(`  Assertions: ${okCount}/${stats.assertions.length} hold${stats.assertions.length === 0 ? fmt.dim(' (none declared — add `verify` lists for every computed number)') : ''}`);
    for (const a of stats.assertions) {
      console.log(`    ${a.ok ? fmt.green('✓') : fmt.red('✗')} ${fmt.dim(a.where)} ${a.detail}${a.assertion.note ? fmt.dim(` — ${a.assertion.note}`) : ''}`);
    }
    const nChecks = checkQids(script).length;
    console.log(`  Checks: ${args.offline ? 'skipped' : `${stats.checks}/${nChecks} found in the bank`}`);
  }
  if (shown.length > 0) {
    console.log('  Issues:');
    const order = { error: 0, warn: 1, info: 2 };
    for (const i of [...shown].sort((a, b) => order[a.severity] - order[b.severity])) {
      const tag = i.severity === 'error' ? fmt.red('✖ error') : i.severity === 'warn' ? fmt.yellow('⚠ warn ') : fmt.dim('ℹ info ');
      console.log(`    ${tag} ${fmt.cyan(i.where)} — ${i.message}`);
    }
  }
  const verdict = errors === 0
    ? fmt.green(`PASS — 0 errors, ${warnings} warning${warnings === 1 ? '' : 's'}`)
    : fmt.red(`FAIL — ${errors} error${errors === 1 ? '' : 's'}, ${warnings} warning${warnings === 1 ? '' : 's'}`);
  console.log(`  ${verdict}${infos && !args['no-info'] ? fmt.dim(` · ${infos} note${infos === 1 ? '' : 's'}`) : ''}`);
  process.exit(errors === 0 ? 0 : 1);
}
