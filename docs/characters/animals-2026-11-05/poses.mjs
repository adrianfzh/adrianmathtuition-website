// Six-pose sets for the four animal sidekicks (Adrian, 5 Nov 2026: "all 4, we can switch around").
// Each pose is an EDIT of the approved picture (never a fresh draw), on chroma green.
//   cd ~/Desktop/ai-video-pipeline && node <this file> <outDir> [animal pose …]
import path from 'node:path';
const { generate, firstFileUrl, download, uploadFile } = await import('file:///Users/adrianfong/Desktop/ai-video-pipeline/src/fal.js');
const HERE = path.dirname(new URL(import.meta.url).pathname);
const OUT = process.argv[2];
const only = process.argv.slice(3);
const ANIMALS = { otter: 'otter.png', owl: 'owl.png', cat: 'cat.png', 'red-panda': 'red-panda.png' };
const POSES = {
  point: 'New pose: ONE front paw (or wing) raised high, pointing up and to the side as if pointing at something on a board; mouth open as if explaining, eyes bright.',
  think: 'New pose: one paw (or wing) touching the chin, eyes looking up, a small thoughtful mouth, and ONE small question mark floating beside the head.',
  oops: 'New pose: a big surprised gasp — both paws (or wings) on its cheeks, eyes wide, small round open mouth, one small sweat drop beside the head.',
  nod: 'New pose: eyes softly closed in happy curves, a warm smile, head tilted slightly forward, paws together in front.',
  cheer: 'New pose: both paws (or wings) thrown up in celebration, a big open happy smile, eyes sparkling, two small sparkles beside it.',
};
const jobs = [];
for (const [a, file] of Object.entries(ANIMALS)) for (const [p, pose] of Object.entries(POSES)) {
  if (only.length && !only.includes(a) && !only.includes(`${a}:${p}`)) continue;
  jobs.push(async () => {
    const url = await uploadFile(path.join(HERE, file));
    const prompt = 'Edit this picture. Change ONLY the pose and the expression; keep exactly the same character, face, eyes, fur or feathers, colours, markings, accessories, proportions, cute chibi sticker-art style, and the same white sticker outline around the figure. ' +
      pose + ' Full body, centred, the SAME size as in the original picture — zoomed out so the WHOLE figure (ears, paws, feet and tail) fits inside the frame with a clear margin of green on every side; nothing touches the edges. It may put down what it was holding if the pose needs both paws. Background: completely flat pure chroma-key green (#00FF00). No shadow, no text, no letters, no numbers, no logos.';
    const data = await generate('fal-ai/bytedance/seedream/v4.5/edit', { prompt, image_urls: [url], image_size: { width: 1024, height: 1024 }, num_images: 1 }, `${a} ${p}`);
    await download(firstFileUrl(data), path.join(OUT, `${a}-${p}.png`));
  });
}
for (let i = 0; i < jobs.length; i += 6) await Promise.all(jobs.slice(i, i + 6).map(j => j()));
console.log(`${jobs.length} poses drawn`);
