import path from 'node:path';
const { generate, firstFileUrl, download, uploadFile } = await import('file:///Users/adrianfong/Desktop/ai-video-pipeline/src/fal.js');
const OUT = process.argv[2];
const REF = '/Users/adrianfong/dev/adrianmathtuition-website/.claude/worktrees/stretch-set-255055/docs/characters/scholars/approved/final-set.png';
const STYLE = 'Style: modern Chinese cute animation and sticker-pack art (萌系Q版，国产动画表情包风格) — a chibi little character about two heads tall, with a very big round head, a tiny chubby body, stubby arms and legs, huge sparkling eyes, a tiny mouth, blushing cheeks, soft thick outline, bright soft colours with gentle gradient shading, lively and a little silly. Irresistibly cute.';
const ANIMALS = {
  otter: 'a little smooth-coated otter (the kind famous in Singapore), sleek chocolate-brown fur with a cream face and belly, round small ears, little whiskers, holding a tiny yellow pencil',
  owl: 'a little round owl, soft grey-and-cream feathers, big round black glasses, two small ear tufts, a tiny red bow tie, holding a tiny open book with its wing',
  cat: 'a little chubby ginger cat, orange fur with soft cream stripes, a white muzzle and paws, a curly tail, a tiny blue scarf, holding a tiny yellow pencil',
  redpanda: 'a little red panda, rusty-red fluffy fur, white cheek marks and white-edged ears, a big striped ringed tail, holding a tiny calculator',
};
const ref = await uploadFile(REF);
await Promise.all(Object.entries(ANIMALS).flatMap(([k, desc]) => [1, 2].map(async (n) => {
  const prompt = 'Draw ONE NEW original character in EXACTLY the same art style as the reference picture (same line weight, same colouring, same cute chibi proportions) — a sidekick for these two children. ' +
    `The character: ${desc}. Standing, full body, facing the viewer, a cheerful friendly expression. ` + STYLE +
    ' An original character, not any existing brand, toy, game or cartoon character. Do NOT draw the children. Background: completely flat pure chroma-key green (#00FF00). No shadow, no text, no letters, no logos.';
  const data = await generate('fal-ai/bytedance/seedream/v4.5/edit', { prompt, image_urls: [ref], image_size: { width: 1024, height: 1024 }, num_images: 1 }, `${k} ${n}`);
  await download(firstFileUrl(data), path.join(OUT, `${k}-${n}.png`));
})));
