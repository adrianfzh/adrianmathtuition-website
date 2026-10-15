#!/usr/bin/env node
// A local production build students can sign in to: `.env.production.local` is a `vercel env pull`
// copy whose secret values read "[SENSITIVE]" (Next bakes NEXT_PUBLIC_* in at build time, so the
// student login breaks). This fills every masked value from `.env.local` through the process
// environment (which beats the .env files) and runs `next build` and/or `next start -p 3210`.
//
//   node scripts/clips/serve-prod.mjs build     # then:
//   node scripts/clips/serve-prod.mjs start     # (run in the background)
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { ROOT } from '../lessons/shared.mjs';

const require = createRequire(import.meta.url);
const dotenv = require('dotenv');
const read = (f) => (fs.existsSync(path.join(ROOT, f)) ? dotenv.parse(fs.readFileSync(path.join(ROOT, f))) : {});
const local = read('.env.local');
const prod = read('.env.production.local');
const fill = {};
for (const [k, v] of Object.entries(prod)) if (/\[SENSITIVE\]/.test(v) && local[k]) fill[k] = local[k];
const what = process.argv[2] === 'start' ? ['start', '-p', '3210'] : ['build'];
console.error(`[serve-prod] ${Object.keys(fill).length} masked values filled from .env.local → next ${what.join(' ')}`);
const child = spawn('npx', ['next', ...what], { cwd: ROOT, stdio: 'inherit', env: { ...process.env, ...fill } });
child.on('exit', (code) => process.exit(code ?? 1));
