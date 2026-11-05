// Second try: picture 1 = the approved character (Option A idle), picture 2 = the pose to copy (Option B oops).
import path from 'node:path';
import { generate, firstFileUrl, download, uploadFile } from '../../src/fal.js';
const dir = path.resolve('out/chibi-poses/oops');
const PROMPT = 'Draw the character from image 1 in the POSE from image 2. ' +
  'From image 1 keep EVERYTHING about the character: the exact face, hair, eyes, skin, clothes, shoes, proportions, the cute chibi sticker-art style and the white sticker outline around the figure. ' +
  'From image 2 take ONLY the pose and gesture: one hand held up in front of the chest with the palm flat toward the viewer and the fingers held TOGETHER, like a gentle "stop, careful!" sign (not a wave), the other hand resting on the hip; one eyebrow raised, a small round "o" mouth, a kind but concerned look. ' +
  'Full body, standing, centred. Background: completely flat pure chroma-key green (#00FF00). No shadow, no sweat drop, no text, no letters, no logos.';
await Promise.all(['boy', 'girl'].flatMap((who) => [3, 4].map(async (n) => {
  const a = await uploadFile(path.join(dir, `${who}-idle-green.png`));
  const b = await uploadFile(path.join(dir, `${who}-pose-ref.png`));
  const data = await generate('fal-ai/bytedance/seedream/v4.5/edit', { prompt: PROMPT, image_urls: [a, b], image_size: { width: 1024, height: 1024 }, num_images: 1 }, `oops ${who} ${n}`);
  await download(firstFileUrl(data), path.join(dir, `${who}-oops-${n}.png`));
})));
