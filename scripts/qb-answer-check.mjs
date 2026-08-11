#!/usr/bin/env node
// scripts/qb-answer-check.mjs — gate Tier-A answer proposals before they are written.
//
//   node scripts/qb-answer-check.mjs --proposals p.json --rows r.json [--sql out.sql] [--held held.json]
//
// `--proposals` is qb-extractor's output: either the full {proposed:[…]} object or a
// bare array of {id, answer, evidence}.
// `--rows` is the source data: [{id, solution, question_text, answer}] — fetch it with
// the same ids, straight from the DB, so the check runs against the real solution text
// rather than anything the model reported back.
//
// Writes nothing to the database. It prints a verdict and (with --sql) emits UPDATE
// statements for the rows that passed, each carrying the empty-guard. Apply those
// separately — keeping propose and write apart is the whole point.

import fs from 'node:fs';
import { checkBatch, buildUpdates } from '../src/lib/qb-answer-check.ts';

const argv = process.argv.slice(2);
const arg = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

const proposalsPath = arg('proposals');
const rowsPath = arg('rows');
if (!proposalsPath || !rowsPath) {
  console.error('usage: --proposals <file> --rows <file> [--sql <file>] [--held <file>]');
  process.exit(2);
}

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const raw = readJson(proposalsPath);
const proposals = Array.isArray(raw) ? raw : raw.proposed || [];
const rows = readJson(rowsPath);

if (!proposals.length) {
  console.error('no proposals found — expected an array or {proposed:[…]}');
  process.exit(2);
}

const report = checkBatch(proposals, rows);
const pct = (n) => `${((n / report.total) * 100).toFixed(1)}%`;

console.log(`\nchecked ${report.total} proposal(s) against ${rows.length} source row(s)`);
console.log(`  accepted  ${report.accepted.length}  (${pct(report.accepted.length)})`);
console.log(`  held      ${report.held.length}  (${pct(report.held.length)})`);
if (report.proseAccepted)
  console.log(`  of accepted, ${report.proseAccepted} carry no digits (proof/prose) — eyeball these`);

if (report.held.length) {
  console.log('\nheld by reason:');
  for (const [code, n] of Object.entries(report.byReason).sort((a, b) => b[1] - a[1]))
    console.log(`  ${String(n).padStart(4)}  ${code}`);
  console.log('\nfirst 10 held:');
  for (const h of report.held.slice(0, 10)) console.log(`  ${h.id}  ${h.detail.join(' | ')}`);
}

const sqlPath = arg('sql');
if (sqlPath) {
  const sql = buildUpdates(report, proposals);
  fs.writeFileSync(sqlPath, sql.join('\n') + (sql.length ? '\n' : ''));
  console.log(`\nwrote ${sql.length} UPDATE statement(s) → ${sqlPath}`);
}

const heldPath = arg('held');
if (heldPath) {
  fs.writeFileSync(heldPath, JSON.stringify(report.held, null, 2));
  console.log(`wrote ${report.held.length} held row(s) → ${heldPath}`);
}

console.log('');
