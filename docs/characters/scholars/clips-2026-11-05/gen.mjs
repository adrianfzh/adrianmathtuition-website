// 5 s test clip of the approved scholar boy: standing (start frame) → thumbs-up (end frame), 3 models.
// Playbook §5 step 3 (Adrian, 5 Nov 2026: "Yes, make the clips"). Run from the side-project root.
import fs from 'node:fs';
import path from 'node:path';
import { generate, firstFileUrl, download, uploadFile } from '../../src/fal.js';
const dir = path.resolve('out/chibi-clips');
const up = (f) => uploadFile(path.join(dir, 'frames', f));
const [idle, cheer, point, think] = await Promise.all(['idle.png', 'cheer.png', 'point.png', 'think.png'].map(up));
const MOVE =
  'stands relaxed, then gives one small happy bounce, raises a thumbs-up beside his face and breaks into a big smile with his eyes closed in happy curves, and two small sparkles twinkle beside his head. ' +
  'The camera stays completely still. The plain dark green background never changes. ' +
  'Keep him exactly as in the pictures: the same face, blue eyes, hair, clothes and white sticker outline. Never add anything that is not in the pictures. No text.';
const NEG = 'blur, distort, low quality, extra fingers, extra limbs, face change, text, letters, camera movement, background change';
const jobs = {
  'kling-v3-standard': () => generate('fal-ai/kling-video/v3/standard/image-to-video',
    { start_image_url: idle, end_image_url: cheer, prompt: `The boy ${MOVE}`, duration: '5', generate_audio: false, negative_prompt: NEG }, 'kling v3 standard'),
  'kling-v3-pro-elements': () => generate('fal-ai/kling-video/v3/pro/image-to-video',
    { start_image_url: idle, end_image_url: cheer, prompt: `The boy @Element1 ${MOVE}`, duration: '5', generate_audio: false, negative_prompt: NEG,
      elements: [{ frontal_image_url: idle, reference_image_urls: [cheer, point, think] }] }, 'kling v3 pro + elements'),
  'seedance-2.5': () => generate('bytedance/seedance-2.5/image-to-video',
    { image_url: idle, end_image_url: cheer, prompt: `The boy ${MOVE}`, duration: '5', resolution: '720p', generate_audio: false }, 'seedance 2.5'),
};
const res = await Promise.allSettled(Object.entries(jobs).map(async ([name, run]) => {
  const out = path.join(dir, 'clips', `${name}.mp4`);
  if (fs.existsSync(out)) return console.log(`${name}: already made`);
  const data = await run();
  await download(firstFileUrl(data), out);
  fs.writeFileSync(path.join(dir, 'clips', `${name}.json`), JSON.stringify(data, null, 2));
}));
res.forEach((r, i) => r.status === 'rejected' && console.error(Object.keys(jobs)[i], 'FAILED:', r.reason?.message, JSON.stringify(r.reason?.body ?? '').slice(0, 400)));
