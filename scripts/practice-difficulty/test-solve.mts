// 🎚 Practice difficulty — the TEST SOLVE (5 Oct 2026): Claude Haiku 4.5 answers each sample
// MCQ twice, a letter only, no working (temperature 1, so a lucky guess shows as a split).
// Uses the bot's ANTHROPIC_API_KEY (never printed). Reads out/sample.json, writes
// out/test-solve.json with the tries and the token usage (for the cost estimate).
//   npx tsx scripts/practice-difficulty/test-solve.mts
import dotenv from 'dotenv'; import fs from 'fs'; import path from 'path';
import Anthropic from '@anthropic-ai/sdk';
const botEnv = dotenv.parse(fs.readFileSync(path.join(process.env.HOME!, 'dev/adrianmath-telegram-math-bot/.env')));
const client = new Anthropic({ apiKey: (botEnv.ANTHROPIC_API_KEY || '').trim() });
const MODEL = 'claude-haiku-4-5-20251001';
const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), 'out');
// --in <file> --out <file> (defaults: the sample). Questions already in --reuse <file> are not asked again.
const arg = (k: string, d: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const IN = arg('--in', 'sample.json'), OUTF = arg('--out', 'test-solve.json'), REUSE = arg('--reuse', '');
const reused: any[] = REUSE ? JSON.parse(fs.readFileSync(path.join(OUT, REUSE), 'utf8')).results : [];
const reusedIds = new Set(reused.map(r => r.id));
const sample: any[] = JSON.parse(fs.readFileSync(path.join(OUT, IN), 'utf8')).filter((q: any) => !reusedIds.has(q.id));
const TRIES = 2;

function content(q: any): Anthropic.ContentBlockParam[] {
  const imgs = [...String(q.markdown).matchAll(/<img src="([^"]+)"/g)].map(m => m[1]);
  const text = String(q.markdown).replace(/<img[^>]*>/g, '[figure attached]');
  return [
    ...imgs.map(url => ({ type: 'image' as const, source: { type: 'url' as const, url } })),
    { type: 'text' as const, text: `O-Level ${q.subject} multiple-choice question.\n\n${text}\n\nReply with the letter of the correct option only (A, B, C or D). No working.` },
  ];
}

(async () => {
  const results: any[] = [...reused]; let inTok = 0, outTok = 0;
  const queue = [...sample];
  async function worker() {
    for (let q = queue.shift(); q; q = queue.shift()) {
      const tries: (boolean | null)[] = []; const letters: (string | null)[] = [];
      for (let t = 0; t < TRIES; t++) {
        try {
          const r = await client.messages.create({ model: MODEL, max_tokens: 5, temperature: 1, messages: [{ role: 'user', content: content(q) }] });
          inTok += r.usage.input_tokens; outTok += r.usage.output_tokens;
          const txt = r.content.map(c => (c.type === 'text' ? c.text : '')).join('');
          const L = /[A-D]/.exec(txt.toUpperCase())?.[0] ?? null;
          letters.push(L); tries.push(L ? L === q.key : null);
        } catch (e: any) { letters.push(null); tries.push(null); console.error(q.id, e?.message); }
      }
      results.push({ id: q.id, key: q.key, letters, tries });
    }
  }
  await Promise.all(Array.from({ length: 8 }, worker));
  fs.writeFileSync(path.join(OUT, OUTF), JSON.stringify({ model: MODEL, inTok, outTok, results }, null, 1));
  const right = results.filter(r => r.tries.every((x: any) => x === true)).length;
  const wrong = results.filter(r => r.tries.every((x: any) => x === false)).length;
  console.log(`done ${results.length}: both right ${right}, both wrong ${wrong}, split ${results.length - right - wrong}; tokens in ${inTok} out ${outTok}`);
})();
