// Six-pose sheets of the scholar boy/girl (website docs/characters/scholars/BIBLE.md), two models.
// node out/chibi-poses/gen.mjs   (run from the side-project root)
import fs from 'node:fs';
import path from 'node:path';
import { generate, firstFileUrl, download, uploadFile } from '../../src/fal.js';

const dir = path.resolve('out/chibi-poses');
const bible = fs.readFileSync('/Users/adrianfong/dev/adrianmathtuition-website/docs/characters/scholars/BIBLE.md', 'utf8');
const block = (h) => bible.split(h)[1].split('```')[1].trim();
const STYLE = block('## Style lock');
const LOOK = { boy: block('## Fixed look — the boy'), girl: block('## Fixed look — the girl') };
const OUTFIT = {
  boy: 'Outfit (pupil): white short-sleeved school shirt with a blue pocket stripe, royal-blue shorts, white socks, blue-and-white sneakers. No backpack.',
  girl: 'Outfit (pupil): white short-sleeved school blouse with a navy bow, navy pleated skirt, white socks, navy Mary-Jane shoes. No backpack.',
};
const POSES =
  'Character pose sheet: the SAME character six times, in a 3-column by 2-row grid, every figure full body, the same size, evenly spaced, not touching. ' +
  'Top row, left to right: (1) IDLE — standing relaxed, arms at the sides, small friendly smile, looking at the viewer; ' +
  '(2) POINT — one arm raised pointing up and to the side with the index finger, mouth open as if explaining; ' +
  '(3) THINK — one hand on the chin, eyes looking up, a small question mark floating by the head. ' +
  'Bottom row, left to right: (4) OOPS — a gentle "hmm, careful": one eyebrow raised, one hand up palm-out, small pursed mouth (no wince, no sweat drop); ' +
  '(5) NOD — eyes softly closed in happy curves, warm smile, head tilted slightly forward; ' +
  '(6) CHEER — a thumbs-up beside the face, big smile, two small sparkles (not both arms up).';
const BG = 'Background: completely flat, uniform, pure chroma-key green (#00FF00) everywhere. No shadow, no floor, no gradient, no border, no frames between figures. ' +
  'No text, no letters, no numbers, no labels, no captions, no logos, no watermark.';
const prompt = (who) => `Same character as the reference image: keep the face, hair, eyes and skin exactly. ${LOOK[who]} ${OUTFIT[who]} ${POSES} ${STYLE} ${BG}`;

async function seedream(who) {
  const url = await uploadFile(path.join(dir, 'ref', `${who}-reference.png`));
  const data = await generate('fal-ai/bytedance/seedream/v4.5/edit',
    { prompt: prompt(who), image_urls: [url], image_size: { width: 1536, height: 1024 }, num_images: 1 }, `seedream ${who}`);
  await download(firstFileUrl(data), path.join(dir, 'gen', `${who}-seedream.png`));
}

async function gpt(who) {
  const key = fs.readFileSync('/Users/adrianfong/dev/adrianmath-telegram-math-bot/.env', 'utf8')
    .match(/^OPENAI_API_KEY=(.*)$/m)[1].trim().replace(/^["']|["']$/g, '');
  const form = new FormData();
  form.append('model', 'gpt-image-2');
  form.append('prompt', prompt(who));
  form.append('size', '1536x1024');
  form.append('quality', 'medium');
  form.append('image', new Blob([fs.readFileSync(path.join(dir, 'ref', `${who}-reference.png`))], { type: 'image/png' }), `${who}.png`);
  const r = await fetch('https://api.openai.com/v1/images/edits', { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form });
  const j = await r.json();
  if (!r.ok) throw new Error(`gpt ${who}: ${r.status} ${JSON.stringify(j.error ?? j).slice(0, 300)}`);
  fs.writeFileSync(path.join(dir, 'gen', `${who}-gpt.png`), Buffer.from(j.data[0].b64_json, 'base64'));
  console.log(`gpt ${who} done`, j.usage ? JSON.stringify(j.usage) : '');
}

fs.writeFileSync(path.join(dir, 'prompt-boy.txt'), prompt('boy'));
const jobs = [];
for (const who of ['boy', 'girl']) {
  if (!fs.existsSync(path.join(dir, 'gen', `${who}-seedream.png`))) jobs.push(seedream(who));
  if (!fs.existsSync(path.join(dir, 'gen', `${who}-gpt.png`))) jobs.push(gpt(who));
}
const res = await Promise.allSettled(jobs);
for (const x of res) if (x.status === 'rejected') console.error('FAILED:', x.reason.message);
