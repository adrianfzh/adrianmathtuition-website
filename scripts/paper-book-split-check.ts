// Dry-run the inbox watcher's book splitter on local PDFs — nothing is
// uploaded, queued or filed; the parts are written to an output folder so
// the cut can be eyeballed against the book.
//
//   npx tsx scripts/paper-book-split-check.ts <out-dir> <book.pdf> [more.pdf…]
//
// Reads ANTHROPIC_API_KEY from .env.local (one model call per ≤100-page slice).
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import Anthropic from '@anthropic-ai/sdk';
import { splitBook } from '../src/lib/paper-book-split-io';
import { describeParts } from '../src/lib/paper-book-split';

async function main() {
  const [out, ...files] = process.argv.slice(2);
  if (!out || !files.length) { console.error('usage: npx tsx scripts/paper-book-split-check.ts <out-dir> <book.pdf> [more.pdf…]'); process.exit(2); }
  const env = dotenv.parse(fs.readFileSync(path.join(__dirname, '..', '.env.local')));
  const client = new Anthropic({ apiKey: String(env.ANTHROPIC_API_KEY || '').trim() });
  fs.mkdirSync(out, { recursive: true });
  for (const f of files) {
    const t0 = Date.now();
    const bytes = fs.readFileSync(f);
    try {
      const r = await splitBook(bytes, { client });
      console.log(path.basename(f), `pages=${r.pageCount} calls=${r.calls} model=${r.model} ${Math.round((Date.now() - t0) / 1000)}s`);
      console.log('  plan:', r.plan.kind, r.plan.kind === 'split' ? describeParts(r.plan.parts) : JSON.stringify(r.plan));
      if (r.parts) for (const p of r.parts) {
        const name = `${path.basename(f, '.pdf')} - Paper ${p.paper}.pdf`;
        fs.writeFileSync(path.join(out, name), p.bytes);
        console.log(`  wrote ${name} (${Math.round(p.bytes.byteLength / 1024)} KB)`);
      }
    } catch (e) { console.log(path.basename(f), 'ERROR', (e as Error).message); }
  }
}
main().catch(e => { console.error(e); process.exit(1); });
