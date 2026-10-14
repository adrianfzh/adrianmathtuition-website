// The English word list for the Singapore-word check of a listening paper (sgUnlisted): the
// small-letter words of the Mac's /usr/share/dict/words, up to 14 letters, gzipped at
// data/english/words.txt.gz (traced into /api/agent/listening-papers by next.config.ts).
// Server only; read once.
import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { wordList } from './english-listening-papers';

let cached: Set<string> | null = null;
export function englishWords(): Set<string> | undefined {
  if (cached) return cached;
  try { cached = wordList(gunzipSync(fs.readFileSync(path.join(process.cwd(), 'data/english/words.txt.gz'))).toString('utf8')); }
  catch (e) { console.error('[listening] word list missing:', e instanceof Error ? e.message : e); return undefined; }
  return cached;
}
