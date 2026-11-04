// Shared .env.local loader + service client for the spot-error scripts.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const here = path.dirname(fileURLToPath(import.meta.url));
const env: Record<string, string> = Object.fromEntries(
  fs.readFileSync(path.join(here, '..', '..', '.env.local'), 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]),
);
const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('SUPABASE_URL / SUPABASE_SECRET_KEY missing from .env.local'); process.exit(1); }
export const sb = createClient(url, key, { auth: { persistSession: false } });

export const argv = process.argv.slice(2);
export const arg = (name: string) => { const i = argv.indexOf(name); return i > -1 ? argv[i + 1] : undefined; };
