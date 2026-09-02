// Shared plumbing for the lesson-authoring tools (scripts/lessons/*.mjs).
//
// Two jobs, both deliberately boring:
//   · loadTs(relPath) — bundle a src/lib TypeScript module with esbuild (already a
//     vitest dependency) and import it, so the tools run the SAME validator,
//     eligibility gate and answer checker the app runs. No re-implementation,
//     no drift: if lesson-script.ts changes, the verifier changes with it.
//   · supaGet(query) — one PostgREST GET against the math Supabase project with
//     the privileged key, resolved from .env.local (SUPABASE_URL +
//     SUPABASE_SECRET_KEY) or, failing that, the bot repo's .env
//     (SUPABASE_SERVICE_KEY_MAIN). Read-only: nothing here ever writes.
//
// Run from anywhere — every path is resolved against the repo root.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { parse as parseDotenv } from 'dotenv';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const LESSONS_DIR = path.join(ROOT, 'data', 'lessons');

// Every tool is a top-level-await script: an unhandled throw (bad slug, no
// credentials, Supabase down) should read as one red line, not a stack trace.
// DEBUG=1 keeps the stack.
for (const event of ['uncaughtException', 'unhandledRejection']) {
  process.on(event, (err) => {
    const e = err instanceof Error ? err : new Error(String(err));
    console.error(`\x1b[31m✖ ${e.message}\x1b[0m`);
    if (process.env.DEBUG) console.error(e.stack);
    process.exit(2);
  });
}

const MATH_SUPABASE_URL = 'https://nempslbewxtlikfzachi.supabase.co';

// ── Console formatting (no dependency; honours NO_COLOR and non-TTY) ─────────
const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code) => (s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : String(s));
export const fmt = {
  red: paint('31'), green: paint('32'), yellow: paint('33'), cyan: paint('36'),
  dim: paint('2'), bold: paint('1'),
};

// ── TypeScript module loader ─────────────────────────────────────────────────
const aliasPlugin = {
  name: 'at-alias',
  setup(build) {
    // `@/x` → src/x, mirroring tsconfig `paths` (some libs import siblings that way).
    build.onResolve({ filter: /^@\// }, (args) => ({
      path: resolveTsFile(path.join(ROOT, 'src', args.path.slice(2))),
    }));
  },
};

function resolveTsFile(base) {
  for (const ext of ['', '.ts', '.tsx', '/index.ts']) {
    const p = base + ext;
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
  }
  return base;
}

/**
 * Bundle + import a repo TS module by path relative to the repo root, e.g.
 * `loadTs('src/lib/lesson-script.ts')`. node_modules stay external (they load
 * normally); relative imports and JSON files are inlined.
 */
export async function loadTs(relPath) {
  const entry = path.join(ROOT, relPath);
  const result = await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    packages: 'external',
    logLevel: 'silent',
    absWorkingDir: ROOT,
    plugins: [aliasPlugin],
  });
  const code = result.outputFiles[0].text;
  return import(`data:text/javascript;base64,${Buffer.from(code, 'utf8').toString('base64')}`);
}

// ── Env + Supabase ───────────────────────────────────────────────────────────
function readDotenv(file) {
  try { return parseDotenv(fs.readFileSync(file, 'utf8')); } catch { return {}; }
}
function clean(v) {
  if (typeof v !== 'string') return '';
  // Values pulled through `vercel env pull` can carry a trailing literal "\n".
  return v.trim().replace(/\\n$/, '').replace(/^"(.*)"$/, '$1').trim();
}

/** { url, key, source } for the math project, or throws with a fix-it message. */
export function resolveSupabase() {
  const fromProcess = { url: clean(process.env.SUPABASE_URL), key: clean(process.env.SUPABASE_SECRET_KEY) };
  if (fromProcess.url && fromProcess.key) return { ...fromProcess, source: 'process.env' };

  const local = readDotenv(path.join(ROOT, '.env.local'));
  const localKey = clean(local.SUPABASE_SECRET_KEY) || clean(local.SUPABASE_SERVICE_ROLE_KEY);
  const localUrl = clean(local.SUPABASE_URL) || MATH_SUPABASE_URL;
  if (localKey && !localKey.includes('SENSITIVE') && !localUrl.includes('SENSITIVE')) {
    return { url: localUrl, key: localKey, source: '.env.local' };
  }

  const botEnvPath = process.env.BOT_ENV_PATH
    || path.join(os.homedir(), 'Desktop', 'adrianmath-telegram-math-bot', '.env');
  const bot = readDotenv(botEnvPath);
  const botKey = clean(bot.SUPABASE_SERVICE_KEY_MAIN);
  if (botKey) return { url: clean(bot.SUPABASE_URL) || MATH_SUPABASE_URL, key: botKey, source: botEnvPath };

  throw new Error(
    'No Supabase credentials: set SUPABASE_URL + SUPABASE_SECRET_KEY, or put them in .env.local, '
    + `or point BOT_ENV_PATH at a bot .env carrying SUPABASE_SERVICE_KEY_MAIN (tried ${botEnvPath}).`,
  );
}

/**
 * GET `/rest/v1/<query>` and return the parsed JSON. `query` is the table plus
 * its PostgREST filter string, e.g. `questions?select=id&id=in.(a,b)`.
 */
export async function supaGet(query, creds = resolveSupabase()) {
  const res = await fetch(`${creds.url.replace(/\/$/, '')}/rest/v1/${query}`, {
    headers: { apikey: creds.key, Authorization: `Bearer ${creds.key}`, Accept: 'application/json' },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Supabase ${res.status} on ${query.split('?')[0]}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

/** PostgREST `in.(…)` list — values quoted so uuids/strings with commas survive. */
export function inList(values) {
  return `in.(${values.map(v => `"${String(v).replace(/"/g, '\\"')}"`).join(',')})`;
}

// ── Script files ─────────────────────────────────────────────────────────────
/**
 * `<slug>` or a path → { path, slug, raw }. A slug resolves to
 * data/lessons/<slug>.json; anything containing a slash or ending in .json is a path.
 */
export function readScriptArg(arg) {
  if (!arg) throw new Error('usage: <slug | path/to/lesson.json>');
  const file = /[/\\]|\.json$/.test(arg) ? path.resolve(process.cwd(), arg) : path.join(LESSONS_DIR, `${arg}.json`);
  if (!fs.existsSync(file)) throw new Error(`No such lesson file: ${file}`);
  let raw;
  try { raw = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { throw new Error(`${file} is not valid JSON: ${e.message}`); }
  return { path: file, slug: path.basename(file, '.json'), raw };
}

/** Minimal flag parser: `--n 2 --offline foo` → { _: ['foo'], n: '2', offline: true }. */
export function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) { out[key] = next; i++; }
      else out[key] = true;
    } else out._.push(a);
  }
  return out;
}
