#!/usr/bin/env node
/**
 * Seed the solution vet lane's cleaned candidates.
 *
 * Reads every ~/.adrianmath-figures/candidates-*.json written by the cleaning
 * sessions and uploads each PNG to  question_images/candidates/<figure_flags.path>
 * (upsert), plus a small sidecar  candidates/<path>.json  carrying the session's
 * VERDICT so /admin/figures-bank can label the candidate honestly:
 *
 *   { verdict, hold_kind, route, confidence, note, hold_reason, by, cand }
 *
 * `hold_kind` is written by the cleaning session and is NEVER inferred here —
 * "residue" (inspected; faint lettering survives the strict stretch) and
 * "unverified" (nobody has looked) are different claims, and a keyword guess once
 * labelled an uninspected image as inspected. Absent → the page says
 * "❓ held — see note" and shows the raw hold_reason.
 *
 * Two file shapes are accepted, because the peer sessions write both:
 *   flat   { "<flag path>": "<abs png>" }
 *   nested { "_README": …, "candidates": { "<flag path>": { png, verdict, … } } }
 *
 * EVERY candidate with a PNG is uploaded regardless of verdict — a hold is
 * something Adrian must be able to see and decide, not something to hide.
 *
 * This writes to STORAGE ONLY. It never touches question rows or figure_flags;
 * putting an image back is the vet lane's job, under the apply.py contract.
 *
 *   node scripts/figures/upload-solution-candidates.mjs [--dry]
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import dotenv from 'dotenv';

const DRY = process.argv.includes('--dry');
const BUCKET = 'question_images';
const DIR = path.join(homedir(), '.adrianmath-figures');
const REPO = path.resolve(new URL('../..', import.meta.url).pathname);

const env = dotenv.parse(readFileSync(path.join(REPO, '.env.local')));
const URL_ = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) {
  console.error('missing SUPABASE_URL / SUPABASE_SECRET_KEY in .env.local');
  process.exit(1);
}

/** Both file shapes → one map of { path → { png, ...meta } }. */
function readCandidateFile(file) {
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  const src = raw && typeof raw === 'object' && raw.candidates && typeof raw.candidates === 'object'
    ? raw.candidates : raw;
  const out = {};
  for (const [key, value] of Object.entries(src)) {
    if (key.startsWith('_')) continue;
    if (typeof value === 'string') out[key] = { png: value };
    else if (value && typeof value === 'object' && typeof value.png === 'string') out[key] = value;
  }
  return out;
}

async function put(objectPath, body, contentType) {
  const r = await fetch(`${URL_}/storage/v1/object/${BUCKET}/${objectPath}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${KEY}`, apikey: KEY,
      'Content-Type': contentType, 'x-upsert': 'true', 'Cache-Control': '3600',
    },
    body,
  });
  if (r.ok) return { ok: true };
  return { ok: false, error: `${r.status} ${(await r.text()).slice(0, 160)}` };
}

const files = existsSync(DIR)
  ? readdirSync(DIR).filter((f) => /^candidates-.*\.json$/.test(f)).sort()
  : [];
if (!files.length) { console.error(`no candidates-*.json in ${DIR}`); process.exit(1); }

let ok = 0, failed = 0, missing = 0;
const byVerdict = {};

for (const file of files) {
  // Re-read every run: the peer sessions rewrite these files whole.
  const cands = readCandidateFile(path.join(DIR, file));
  console.log(`\n${file} — ${Object.keys(cands).length} candidates`);
  for (const [flagPath, meta] of Object.entries(cands)) {
    const png = meta.png;
    if (!existsSync(png) || !statSync(png).isFile()) {
      console.log(`  ✗ ${flagPath} — png missing: ${png}`);
      missing++; continue;
    }
    const verdict = meta.verdict || 'unknown';
    byVerdict[verdict] = (byVerdict[verdict] ?? 0) + 1;
    const sidecar = JSON.stringify({
      verdict,
      hold_kind: meta.hold_kind ?? null,
      route: meta.route ?? null,
      confidence: meta.confidence ?? null,
      note: meta.note ?? null,
      hold_reason: meta.hold_reason ?? null,
      by: meta.by ?? file.replace(/\.json$/, ''),
      cand: meta.cand ?? null,
      source: file,
    });
    if (DRY) { console.log(`  · ${flagPath} — would upload (${verdict})`); ok++; continue; }
    const a = await put(`candidates/${flagPath}`, readFileSync(png), 'image/png');
    const b = a.ok ? await put(`candidates/${flagPath}.json`, sidecar, 'application/json') : a;
    if (a.ok && b.ok) { console.log(`  ✓ ${flagPath} — ${verdict}${meta.hold_kind ? `/${meta.hold_kind}` : ''}`); ok++; }
    else { console.log(`  ✗ ${flagPath} — ${(a.ok ? b : a).error}`); failed++; }
  }
}

console.log(`\n${ok} uploaded · ${failed} failed · ${missing} png missing`);
console.log('by verdict:', JSON.stringify(byVerdict));
process.exit(failed ? 1 : 0);
