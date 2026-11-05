// Redraw only the "oops" (careful) pose by EDITING the approved idle picture (Option A, 5 Nov 2026).
import path from 'node:path';
import { generate, firstFileUrl, download, uploadFile } from '../../src/fal.js';
const dir = path.resolve('out/chibi-poses/oops');
const PROMPT = 'Edit this picture. Change ONLY the pose and the expression; keep exactly the same character, face, hair, eyes, skin, clothes, shoes, proportions, cute chibi sticker-art style, and the same white sticker outline around the figure. ' +
  'New pose: a gentle "hmm, careful!" — the character raises ONE hand to shoulder height with the palm open and facing the viewer, fingers together, like signalling "wait, careful"; the other arm stays down at the side. ' +
  'Expression: ONE eyebrow raised, eyes looking at the viewer, a small pursed mouth, a slightly concerned but kind look. Not a wave, not a wince, no sweat drop, no tears. ' +
  'Full body, standing, centred, same size. Background: completely flat pure chroma-key green (#00FF00). No shadow, no text, no letters, no logos.';
await Promise.all(['boy', 'girl'].flatMap((who) => [1, 2].map(async (n) => {
  const url = await uploadFile(path.join(dir, `${who}-idle-green.png`));
  const data = await generate('fal-ai/bytedance/seedream/v4.5/edit', { prompt: PROMPT, image_urls: [url], image_size: { width: 1024, height: 1024 }, num_images: 1 }, `oops ${who} ${n}`);
  await download(firstFileUrl(data), path.join(dir, `${who}-oops-${n}.png`));
})));
