// Phone-width screenshots of out/sample.html (top + full page). node scripts/practice-difficulty/shot.mjs
import puppeteer from 'puppeteer-core';
import path from 'path';
const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), 'out');
const b = await puppeteer.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const p = await b.newPage();
await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
await p.goto('file://' + path.join(OUT, 'sample.html'), { waitUntil: 'networkidle0', timeout: 60000 });
await p.screenshot({ path: path.join(OUT, 'sample-phone-top.png') });
await p.screenshot({ path: path.join(OUT, 'sample-phone-full.png'), fullPage: true });
const info = await p.evaluate(() => ({ h: document.body.scrollHeight, w: document.documentElement.scrollWidth, katex: document.querySelectorAll('.katex').length, imgs: [...document.images].map(i => i.naturalWidth > 0).filter(Boolean).length + '/' + document.images.length, rawDollar: [...document.querySelectorAll('.q')].filter(e => /\$[^$]+\$/.test(e.textContent)).length }));
console.log(info);
await b.close();
