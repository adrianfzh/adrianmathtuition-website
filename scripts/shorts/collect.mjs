#!/usr/bin/env node
// scripts/shorts/collect.mjs — gather the finished Shorts for Adrian to watch (SPEC-CLIP-PIPELINE.md §10).
//
//   node scripts/shorts/collect.mjs [--to "<folder>"]   default: ~/Movies/AdrianMath Shorts (drafts)
//
// Only a Short that passed EVERY check is copied: the script checks (check.mjs), the speech round
// trip (every line ≥ 85 %), the look (no problems) and an MP4 under 60 s. Writes, in that folder,
// the MP4s and "Open me.html" — each video with its title, description, hashtags and link, each
// with a Copy button. Also writes data/shorts/_checks.json (committed: the record of every check).
// Nothing is uploaded anywhere.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(2);
const TO = argv.includes('--to') ? path.resolve(argv[argv.indexOf('--to') + 1]) : path.join(os.homedir(), 'Movies', 'AdrianMath Shorts (drafts)');
const OUT = path.join(ROOT, 'out/shorts');
const read = (f) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null);
const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const check = read(path.join(OUT, 'check.json')) || [];
const slugs = fs.readdirSync(path.join(ROOT, 'data/shorts')).filter(f => f.endsWith('.json') && !f.startsWith('_')).map(f => f.replace(/\.json$/, ''));
fs.mkdirSync(TO, { recursive: true });
const record = {};
const cards = [];
let usd = 0;
for (const slug of slugs) {
  const s = read(path.join(ROOT, 'data/shorts', `${slug}.json`));
  const asr = read(path.join(OUT, slug, 'asr.json'));
  const look = read(path.join(OUT, slug, 'look.json'));
  const cost = read(path.join(OUT, slug, 'voice-cost.json'));
  const c = check.find(x => x.slug === slug);
  const r = {
    script: !!c?.ok, words: c?.words ?? null, mathsAsserts: c?.asserts ?? null,
    voiceWorst: asr ? Math.round(asr.worst * 100) : null,
    look: look ? look.problems.length === 0 : false, lookProblems: look?.problems ?? ['not rendered'],
    seconds: look?.mp4?.seconds ?? null, mb: look?.mp4 ? +(look.mp4.bytes / 1e6).toFixed(1) : null,
    voiceUsd: cost?.usdTotal ?? null,
  };
  r.ok = r.script && r.voiceWorst >= 85 && r.look && r.seconds !== null && r.seconds < 60;
  record[slug] = r;
  usd += cost?.usdTotal || 0;
  if (!r.ok) { console.log(`✗ ${slug} — not copied: ${JSON.stringify(r)}`); continue; }
  const file = `${String(cards.length + 1).padStart(2, '0')} ${s.youtube.title.replace(/[/\\:?"<>|*]/g, '')}.mp4`;
  fs.copyFileSync(path.join(OUT, slug, `${slug}.mp4`), path.join(TO, file));
  const desc = `${s.youtube.description}\n\nMore like this, free: ${s.youtube.link}\n\n${s.youtube.hashtags.join(' ')}`;
  cards.push({ n: cards.length + 1, file, s, r, desc });
  console.log(`✓ ${slug} → ${file}`);
}
fs.writeFileSync(path.join(ROOT, 'data/shorts/_checks.json'), JSON.stringify({ made: new Date().toISOString().slice(0, 10), voiceUsdTotal: +usd.toFixed(2), shorts: record }, null, 2) + '\n');

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Trap Shorts — drafts</title>
<style>
:root{--bg:#f6f5f1;--card:#fff;--ink:#1d2320;--muted:#5f6b65;--line:#dcdcd4;--green:#1f7a4a}
@media (prefers-color-scheme:dark){:root{--bg:#161a18;--card:#202623;--ink:#eef1ee;--muted:#a7b2ac;--line:#38413c;--green:#7fd3a0}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 -apple-system,system-ui,sans-serif}
main{max-width:1100px;margin:0 auto;padding:24px 16px 60px}h1{font-size:26px;margin:0 0 6px}.lead{color:var(--muted);margin:0 0 22px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:18px}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:14px}
video{width:100%;aspect-ratio:9/16;border-radius:10px;background:#000;display:block}
h2{font-size:17px;margin:12px 0 4px}.meta{color:var(--muted);font-size:13px;margin-bottom:8px}
.field{margin-top:8px}.label{font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);display:flex;justify-content:space-between;align-items:center}
.box{white-space:pre-wrap;font-size:14px;border:1px solid var(--line);border-radius:8px;padding:8px;margin-top:4px}
button{font:inherit;font-size:12px;border:1px solid var(--line);background:transparent;color:var(--ink);border-radius:6px;padding:2px 8px;cursor:pointer}
.ok{color:var(--green);font-size:13px}
</style></head><body><main>
<h1>Common-trap Shorts — drafts (${cards.length})</h1>
<p class="lead">Not posted anywhere. Watch each one; when you are happy, copy its title and description into YouTube. Each description carries its own link, so we can see which Short brought people to the site.</p>
<div class="grid">
${cards.map(({ n, file, s, r, desc }) => `<div class="card">
<video src="${encodeURI(file)}" controls playsinline preload="metadata"></video>
<h2>${n}. ${esc(s.youtube.title)}</h2>
<div class="meta">${esc(s.levelLabel)} · ${esc(s.topic)} · ${r.seconds} s</div>
<div class="ok">✓ answer checked by computer · ✓ voice checked · ✓ nothing cut off</div>
<div class="field"><div class="label">Title <button data-copy="${esc(s.youtube.title)}">Copy</button></div><div class="box">${esc(s.youtube.title)}</div></div>
<div class="field"><div class="label">Description <button data-copy="${esc(desc)}">Copy</button></div><div class="box">${esc(desc)}</div></div>
</div>`).join('\n')}
</div></main>
<script>document.addEventListener('click',e=>{const b=e.target.closest('button[data-copy]');if(!b)return;navigator.clipboard.writeText(b.dataset.copy).then(()=>{b.textContent='Copied';setTimeout(()=>b.textContent='Copy',1500)})})</script>
</body></html>`;
fs.writeFileSync(path.join(TO, 'Open me.html'), html);
console.log(`\n${cards.length}/${slugs.length} copied to ${TO}\nVoice spend (MiniMax): US$${usd.toFixed(2)}`);
